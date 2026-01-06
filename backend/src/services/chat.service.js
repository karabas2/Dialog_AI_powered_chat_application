import crypto from "crypto";
import { db } from "../db/db.js";
import { supportsVision } from "../constants/models.js";
import { trace, SpanStatusCode } from "@opentelemetry/api";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const tracer = trace.getTracer("dialog.chat");

// ---- helpers ----
function parseStoredContent(raw) {
  try {
    const obj = JSON.parse(String(raw));
    if (obj && obj.v === 1) {
      return {
        text: typeof obj.text === "string" ? obj.text : "",
        images: Array.isArray(obj.images) ? obj.images : [],
      };
    }
  } catch {
    // ignore
  }
  return { text: String(raw ?? ""), images: [] };
}

function buildVisionContent(text, images) {
  const content = [];
  if (text && text.trim().length > 0) content.push({ type: "text", text });
  for (const url of images || []) content.push({ type: "image_url", image_url: { url } });
  return content;
}

function loadHistory(sessionId, limit = 30) {
  const rows = db.prepare(`
    SELECT role, content
    FROM messages
    WHERE session_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `).all(sessionId, limit);
  return rows.reverse();
}

//model token cleanup(<s>)
function cleanModelText(s) {
  let out = String(s ?? "");
  out = out.replace(/<\/?s>/g, "");
  out = out.replace(/\[\/?s\]/g, "");
  out = out.replace(/<\|assistant\|>/g, "");
  out = out.replace(/<\|user\|>/g, "");
  out = out.replace(/<\|system\|>/g, "");
  return out.trim();
}

// fetch timeout
async function fetchWithTimeout(url, opts, ms = 30000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}

export async function createChatCompletionForSession({ sessionId, model }) {
  return tracer.startActiveSpan("llm.chat_completion", async (span) => {
    const reqId = `req_${crypto.randomUUID()}`;

    try {
      const isVision = supportsVision(model);

      span.setAttribute("app.session_id", sessionId);
      span.setAttribute("llm.model", model);
      span.setAttribute("llm.is_vision", isVision);
      span.setAttribute("app.request_id", reqId);

      //history load span
      const history = tracer.startActiveSpan("db.load_history", (s) => {
        try {
          const h = loadHistory(sessionId, 30);
          s.setAttribute("db.system", "sqlite");
          s.setAttribute("db.operation", "SELECT");
          s.setAttribute("app.history.count", h.length);
          s.setStatus({ code: SpanStatusCode.OK });
          return h;
        } catch (e) {
          s.recordException(e);
          s.setStatus({ code: SpanStatusCode.ERROR });
          throw e;
        } finally {
          s.end();
        }
      });

      //normalize messages
      let totalImageCount = 0;

      const normalized = history.map((m) => {
        const { text, images } = parseStoredContent(m.content);
        totalImageCount += Array.isArray(images) ? images.length : 0;

        if (!isVision) return { role: m.role, content: text };

        if (m.role === "user") {
          const content = buildVisionContent(text, images);
          return { role: "user", content: content.length ? content : [{ type: "text", text: " " }] };
        }

        // assistant/system => string
        return { role: m.role, content: text };
      });

      span.setAttribute("app.images.total_in_context", totalImageCount);
      span.setAttribute("app.messages.count", normalized.length);

      const systemMsg = {
        role: "system",
        content:
          "You are a helpful assistant. Reply with plain text only. Do not include special tokens like <s>, </s>, [s], [/s], or role markers.",
      };

      const payload = {
        model,
        messages: [systemMsg, ...normalized],
        temperature: 0.7,
      };

      //OpenRouter call span
      const resp = await tracer.startActiveSpan("http.openrouter.chat_completions", async (s) => {
        try {
          s.setAttribute("http.method", "POST");
          s.setAttribute("http.url", OPENROUTER_URL);
          s.setAttribute("llm.model", model);
          s.setAttribute("app.request_id", reqId);

          const r = await fetchWithTimeout(
            OPENROUTER_URL,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
                "Content-Type": "application/json",
                "X-Title": "Dialog",
              },
              body: JSON.stringify(payload),
            },
            Number(process.env.OPENROUTER_TIMEOUT_MS || 30000)
          );

          s.setAttribute("http.status_code", r.status);

          if (!r.ok) {
            const txt = await r.text().catch(() => "");
            const err = new Error(`OpenRouter error ${r.status}: ${txt}`);
            s.recordException(err);
            s.setStatus({ code: SpanStatusCode.ERROR });
            throw err;
          }

          s.setStatus({ code: SpanStatusCode.OK });
          return r;
        } catch (e) {
          s.recordException(e);
          s.setStatus({ code: SpanStatusCode.ERROR });
          throw e;
        } finally {
          s.end();
        }
      });

      const data = await resp.json();
      const rawAssistantText = data?.choices?.[0]?.message?.content ?? "";
      const assistantText = cleanModelText(rawAssistantText);

      //DB insert assistant span
      const msgId = `msg_${crypto.randomUUID()}`;
      const ts = new Date().toISOString();

      tracer.startActiveSpan("db.insert_assistant_message", (s) => {
        try {
          db.prepare(`
            INSERT INTO messages (id, session_id, role, content, created_at)
            VALUES (?, ?, 'assistant', ?, ?)
          `).run(msgId, sessionId, String(assistantText), ts);

          s.setAttribute("db.system", "sqlite");
          s.setAttribute("db.operation", "INSERT");
          s.setAttribute("app.message_id", msgId);
          s.setAttribute("app.assistant.length", String(assistantText).length);
          s.setStatus({ code: SpanStatusCode.OK });
        } catch (e) {
          s.recordException(e);
          s.setStatus({ code: SpanStatusCode.ERROR });
          throw e;
        } finally {
          s.end();
        }
      });

      span.setStatus({ code: SpanStatusCode.OK });

      return {
        id: msgId,
        role: "assistant",
        content: String(assistantText),
        created_at: ts,
      };
    } catch (e) {
      span.recordException(e);
      span.setStatus({ code: SpanStatusCode.ERROR });
      throw e;
    } finally {
      span.end();
    }
  });
}
