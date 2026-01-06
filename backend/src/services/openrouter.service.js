import { trace } from "@opentelemetry/api";

const tracer = trace.getTracer("madlen-backend");

export async function chatCompletion({ model, messages }) {
  return await tracer.startActiveSpan("openrouter.chat_completion", async (span) => {
    try {
      span.setAttribute("ai.model", model);

      const key = process.env.OPENROUTER_API_KEY;
      if (!key) throw new Error("OPENROUTER_API_KEY is missing");

      const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ model, messages, temperature: 0.7 })
      });

      span.setAttribute("http.status_code", resp.status);

      if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        throw new Error(`OpenRouter error: ${resp.status} ${resp.statusText} ${text}`.slice(0, 600));
      }

      return await resp.json();
    } catch (e) {
      span.recordException(e);
      span.setStatus({ code: 2, message: e.message }); // 2 error
      throw e;
    } finally {
      span.end();
    }
  });
}
