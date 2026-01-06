import { ALLOWED_MODELS, supportsVision, getDefaultModelId } from "../constants/models.js";
import { trace } from "@opentelemetry/api";

// mapping for the model dropdown
const MODEL_META = {
  "xiaomi/mimo-v2-flash:free":"Mimo V2 Flash (Hızlı)",
  "nex-agi/deepseek-v3.1-nex-n1:free": "DeepSeek-v3.1 (Önerilen)",
  "mistralai/mistral-7b-instruct:free": "Mistral 7B (Hızlı)",
  "openai/gpt-4o-mini": "GPT-4o Mini (Hızlı, Görsel)",
  "meta-llama/llama-3.2-11b-vision-instruct": "Llama 3.2 11B Vision (Beta)",
  
};

export function getModels(_req, res) {
  const tracer = trace.getTracer("madlen.controllers");
  return tracer.startActiveSpan("models.getModels", (span) => {
    try {
      const models = ALLOWED_MODELS.map((id) => ({
        id,
        label: MODEL_META[id] || id,
        capabilities: { vision: supportsVision(id) }, // computed from allowlist
      }));

      span.setAttribute("models.count", models.length);

      res.json({
        models,
        default_model: getDefaultModelId(), // validated against allowlist
      });
    } finally {
      span.end();
    }
  });
}
