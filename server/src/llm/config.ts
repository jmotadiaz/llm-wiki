import { LanguageModel } from "ai";
import { opencodeGo } from "./opencode-go.js";

export interface LLMConfig {
  apiKey: string;
  primaryModel: LanguageModel;
  fallbackModel: LanguageModel;
  maxRetries: number;
}

export function getLLMConfig(): LLMConfig {
  const apiKey = process.env.OPENCODE_GO_API_KEY;
  if (!apiKey) {
    throw new Error("OPENCODE_GO_API_KEY environment variable is required");
  }

  return {
    apiKey,
    primaryModel: opencodeGo("deepseek-v4-pro"),
    fallbackModel: opencodeGo("deepseek-v4-flash"),
    maxRetries: parseInt(process.env.MAX_RETRIES || "2", 10),
  };
}
