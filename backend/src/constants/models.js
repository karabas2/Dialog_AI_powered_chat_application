// src/constants/models.js


export const ALLOWED_MODELS = [
    "meta-llama/llama-3.1-8b-instruct:free",
    "google/gemma-2-9b-it:free",
    "mistralai/mistral-7b-instruct:free",
    "qwen/qwen-2.5-7b-instruct:free",
    "microsoft/phi-3-mini-128k-instruct:free",
    "meta-llama/llama-3.2-11b-vision-instruct",
    "openai/gpt-4o-mini",
  ];
  
 
  export const VISION_MODELS = new Set([
    "meta-llama/llama-3.2-11b-vision-instruct",
    "openai/gpt-4o-mini",
  ]);
  
  export function supportsVision(modelId) {
    return VISION_MODELS.has(modelId);
  }
  
  export function getDefaultModelId() {
    const env = (process.env.DEFAULT_MODEL || "").trim();
    if (env && ALLOWED_MODELS.includes(env)) return env;
    // senin default’un neyse
    return "google/gemma-2-9b-it:free";
  }
  