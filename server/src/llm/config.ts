import { LanguageModel } from "ai";
import { opencodeGo } from "./opencode-go.js";

export interface LLMConfig {
  apiKey: string;
  primaryModel: LanguageModel;
  fallbackModel: LanguageModel;
  maxRetries: number;
}

export function getLLMConfig(): LLMConfig {
  const apiKey = process.env.OPENCODE_ZEN_API_KEY;
  if (!apiKey) {
    throw new Error("OPENCODE_ZEN_API_KEY environment variable is required");
  }

  return {
    apiKey,
    primaryModel: opencodeGo("kimi-k2.6"),
    fallbackModel: opencodeGo("qwen3.5-plus"),
    maxRetries: parseInt(process.env.MAX_RETRIES || "2", 10),
  };
}
