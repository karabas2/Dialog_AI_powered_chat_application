// models exposed to the frontend dropdown
export const ALLOWED_MODELS = [
    "xiaomi/mimo-v2-flash:free",
    "mistralai/mistral-7b-instruct:free",
    "nex-agi/deepseek-v3.1-nex-n1:free",
  "1nvidia/nemotron-3-nano-30b-a3b:free",
  "meta-llama/llama-3.2-11b-vision-instruct",
  "openai/gpt-4o-mini",
];

// models that accept image inputs
export const VISION_MODELS = new Set([
  "meta-llama/llama-3.2-11b-vision-instruct",
  "openai/gpt-4o-mini",
]);

export function supportsVision(modelId) {
  return VISION_MODELS.has(modelId);
}

export function getDefaultModelId() {
  // prefer env default if it's allowed
  const env = (process.env.DEFAULT_MODEL || "").trim();
  if (env && ALLOWED_MODELS.includes(env)) return env;

  // fallback must be in allowlist
  return ALLOWED_MODELS[0];
}
