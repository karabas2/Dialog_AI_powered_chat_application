import { ALLOWED_MODELS, supportsVision, getDefaultModelId } from "../constants/models.js";
import { trace } from "@opentelemetry/api";

// id -> human label mapping for the model dropdown
const MODEL_META = {
  "meta-llama/llama-3.1-8b-instruct:free": "Llama 3.1 8B (Önerilen)",
  "qwen/qwen-2.5-7b-instruct:free": "Qwen 2.5 7B (Analiz)",
  "microsoft/phi-3-mini-128k-instruct:free": "Phi-3 Mini (Çok hızlı)",
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
