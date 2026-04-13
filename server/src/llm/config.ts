export interface LLMConfig {
  apiKey: string;
  primaryModel: string;
  fallbackModel: string;
  maxRetries: number;
}

export function getLLMConfig(): LLMConfig {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY environment variable is required");
  }

  return {
    apiKey,
    primaryModel: process.env.PRIMARY_MODEL || "google/gemini-3-flash-preview",
    fallbackModel: process.env.FALLBACK_MODEL || "z-ai/glm-4.7-flash",
    maxRetries: parseInt(process.env.MAX_RETRIES || "2", 10),
  };
}
