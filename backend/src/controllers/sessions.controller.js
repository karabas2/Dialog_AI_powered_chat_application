import { z } from "zod";
import crypto from "crypto";
import { trace } from "@opentelemetry/api";

import { db } from "../db/db.js";
import { createChatCompletionForSession } from "../services/chat.service.js";
import {
  ALLOWED_MODELS,
  getDefaultModelId,
  supportsVision,
} from "../constants/models.js";

const tracer = trace.getTracer("dialog");

function nowISO() {
  return new Date().toISOString();
}

function genId(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

/**
 * LLM hata verirse:
 * - user mesajını sil
 * - session boş kaldıysa sil
 */
function rollbackFailedPost({ sessionId, userMsgId }) {
  db.prepare(`DELETE FROM messages WHERE id = ?`).run(userMsgId);

  const row = db
    .prepare(`SELECT COUNT(1) AS cnt FROM messages WHERE session_id = ?`)
    .get(sessionId);

  const cnt = Number(row?.cnt ?? 0);
  if (cnt === 0) {
    db.prepare(`DELETE FROM sessions WHERE id = ?`).run(sessionId);
  }
}

const createSessionSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  selected_model: z.string().trim().min(1).optional(),
});

export function createSession(req, res, next) {
  return tracer.startActiveSpan("sessions.createSession", (span) => {
    try {
      const parsed = createSessionSchema.parse(req.body ?? {});
      const id = genId("sess");
      const createdAt = nowISO();

      const resolvedModel =
        (parsed.selected_model && parsed.selected_model.trim()) ||
        (process.env.DEFAULT_MODEL && process.env.DEFAULT_MODEL.trim()) ||
        getDefaultModelId();

      if (!ALLOWED_MODELS.includes(resolvedModel)) {
        span.setAttribute("error", true);
        return res.status(400).json({
          error: { message: `Model izinli değil: ${resolvedModel}` },
        });
      }

      tracer.startActiveSpan("db.sessions.insert", (dbSpan) => {
        try {
          db.prepare(`
            INSERT INTO sessions (id, title, selected_model, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?)
          `).run(id, parsed.title ?? null, resolvedModel, createdAt, createdAt);
        } finally {
          dbSpan.end();
        }
      });

      return res.status(201).json({
        id,
        title: parsed.title ?? null,
        selected_model: resolvedModel,
        created_at: createdAt,
        updated_at: createdAt,
      });
    } catch (err) {
      span.recordException(err);
      span.setStatus({ code: 2, message: String(err?.message ?? "error") });
      next(err);
    } finally {
      span.end();
    }
  });
}

export function listSessions(req, res, next) {
  return tracer.startActiveSpan("sessions.listSessions", (span) => {
    try {
      const rows = tracer.startActiveSpan("db.sessions.list", (dbSpan) => {
        try {
          return db
            .prepare(`
              SELECT s.id, s.title, s.selected_model, s.created_at, s.updated_at
              FROM sessions s
              WHERE EXISTS (SELECT 1 FROM messages m WHERE m.session_id = s.id)
              ORDER BY s.updated_at DESC
              LIMIT 100
            `)
            .all();
        } finally {
          dbSpan.end();
        }
      });

      return res.json({ sessions: rows });
    } catch (err) {
      span.recordException(err);
      span.setStatus({ code: 2, message: String(err?.message ?? "error") });
      next(err);
    } finally {
      span.end();
    }
  });
}

export function getSession(req, res, next) {
  return tracer.startActiveSpan("sessions.getSession", (span) => {
    try {
      const { id } = req.params;

      const session = tracer.startActiveSpan("db.sessions.get", (dbSpan) => {
        try {
          return db
            .prepare(`
              SELECT id, title, selected_model, created_at, updated_at
              FROM sessions
              WHERE id = ?
            `)
            .get(id);
        } finally {
          dbSpan.end();
        }
      });

      if (!session) {
        return res
          .status(404)
          .json({ error: { message: "Session not found", status: 404 } });
      }

      const messages = tracer.startActiveSpan("db.messages.list", (dbSpan) => {
        try {
          return db
            .prepare(`
              SELECT id, role, content, created_at
              FROM messages
              WHERE session_id = ?
              ORDER BY created_at ASC
            `)
            .all(id);
        } finally {
          dbSpan.end();
        }
      });

      return res.json({ ...session, messages });
    } catch (err) {
      span.recordException(err);
      span.setStatus({ code: 2, message: String(err?.message ?? "error") });
      next(err);
    } finally {
      span.end();
    }
  });
}

/**
 * content opsiyonel; images ile birlikte en az biri şart
 * images: base64 data URL listesi (data:image/...;base64,...)
 */
const postMessageSchema = z
  .object({
    content: z.string().trim().max(8000).optional(),
    model: z.string().trim().min(1).optional(),
    images: z.array(z.string().min(8)).max(6).optional(),
  })
  .refine(
    (v) =>
      (typeof v.content === "string" && v.content.trim().length > 0) ||
      (Array.isArray(v.images) && v.images.length > 0),
    { message: "content veya images zorunlu", path: ["content"] }
  );

export async function postMessage(req, res, next) {
  return tracer.startActiveSpan("sessions.postMessage", async (span) => {
    try {
      const { id: sessionId } = req.params;
      span.setAttribute("session.id", sessionId);

      const session = tracer.startActiveSpan("db.sessions.getForPost", (dbSpan) => {
        try {
          return db
            .prepare(`
              SELECT id, selected_model
              FROM sessions
              WHERE id = ?
            `)
            .get(sessionId);
        } finally {
          dbSpan.end();
        }
      });

      if (!session) {
        return res
          .status(404)
          .json({ error: { message: "Session not found", status: 404 } });
      }

      const parsed = postMessageSchema.parse(req.body ?? {});

      const requestedModel = parsed.model?.trim();
      const resolvedModel =
        (requestedModel && requestedModel.length > 0 ? requestedModel : null) ||
        session.selected_model ||
        (process.env.DEFAULT_MODEL && process.env.DEFAULT_MODEL.trim()) ||
        getDefaultModelId();

      if (!ALLOWED_MODELS.includes(resolvedModel)) {
        return res.status(400).json({
          error: { message: `Model izinli değil: ${resolvedModel}` },
        });
      }

      // deprecated model fallback
      const deprecated = new Set(["openai/gpt-4-vision-preview"]);
      const finalModel = deprecated.has(resolvedModel)
        ? "openai/gpt-4o-mini"
        : resolvedModel;

      span.setAttribute("llm.model", finalModel);

      const hasImages = Array.isArray(parsed.images) && parsed.images.length > 0;
      if (hasImages && !supportsVision(finalModel)) {
        return res.status(400).json({
          error: { message: "Seçili model görsel desteklemiyor." },
        });
      }

      // 1) user mesajını DB'ye yaz
      const userMsgId = genId("msg");
      const ts = nowISO();

      const userContentToStore = hasImages
        ? JSON.stringify({
            v: 1,
            text: parsed.content ?? "",
            images: parsed.images,
          })
        : parsed.content ?? "";

      tracer.startActiveSpan("db.messages.insertUser", (dbSpan) => {
        try {
          db.prepare(`
            INSERT INTO messages (id, session_id, role, content, created_at)
            VALUES (?, ?, 'user', ?, ?)
          `).run(userMsgId, sessionId, userContentToStore, ts);
        } finally {
          dbSpan.end();
        }
      });

      // 2) LLM çağrısı (başarısız olursa rollback)
      let assistant;
      try {
        assistant = await tracer.startActiveSpan("llm.call", async (llmSpan) => {
          try {
            llmSpan.setAttribute("llm.model", finalModel);
            llmSpan.setAttribute("llm.has_images", hasImages);
            llmSpan.setAttribute("llm.images_count", hasImages ? parsed.images.length : 0);

            return await createChatCompletionForSession({
              sessionId,
              model: finalModel,
              lastUserText: parsed.content ?? "",
              lastUserImages: parsed.images ?? [],
            });
          } catch (e) {
            llmSpan.recordException(e);
            llmSpan.setStatus({ code: 2, message: String(e?.message ?? "llm error") });
            throw e;
          } finally {
            llmSpan.end();
          }
        });
      } catch (err) {
        rollbackFailedPost({ sessionId, userMsgId });
        throw err;
      }

      // 3) başarılıysa session model + updated_at güncelle
      tracer.startActiveSpan("db.sessions.updateModel", (dbSpan) => {
        try {
          db.prepare(`
            UPDATE sessions
            SET selected_model = ?, updated_at = ?
            WHERE id = ?
          `).run(finalModel, nowISO(), sessionId);
        } finally {
          dbSpan.end();
        }
      });

      return res.status(201).json({ assistant_message: assistant });
    } catch (err) {
      span.recordException(err);
      span.setStatus({ code: 2, message: String(err?.message ?? "error") });
      next(err);
    } finally {
      span.end();
    }
  });
}

export function deleteSession(req, res, next) {
  return tracer.startActiveSpan("sessions.deleteSession", (span) => {
    try {
      const { id: sessionId } = req.params;

      const session = tracer.startActiveSpan("db.sessions.exists", (dbSpan) => {
        try {
          return db
            .prepare(`SELECT id FROM sessions WHERE id = ?`)
            .get(sessionId);
        } finally {
          dbSpan.end();
        }
      });

      if (!session) {
        return res
          .status(404)
          .json({ error: { message: "Session not found", status: 404 } });
      }

      tracer.startActiveSpan("db.messages.deleteBySession", (dbSpan) => {
        try {
          db.prepare(`DELETE FROM messages WHERE session_id = ?`).run(sessionId);
        } finally {
          dbSpan.end();
        }
      });

      tracer.startActiveSpan("db.sessions.delete", (dbSpan) => {
        try {
          db.prepare(`DELETE FROM sessions WHERE id = ?`).run(sessionId);
        } finally {
          dbSpan.end();
        }
      });

      return res.status(204).send();
    } catch (err) {
      span.recordException(err);
      span.setStatus({ code: 2, message: String(err?.message ?? "error") });
      next(err);
    } finally {
      span.end();
    }
  });
}
