import { openrouter } from "@openrouter/ai-sdk-provider";
import { google } from "@ai-sdk/google";
import { LanguageModel } from "ai";

export interface LLMConfig {
  apiKey: string;
  primaryModel: LanguageModel;
  fallbackModel: LanguageModel;
  maxRetries: number;
}

export function getLLMConfig(): LLMConfig {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY environment variable is required");
  }

  return {
    apiKey,
    primaryModel: openrouter("minimax/minimax-m2.7"),
    fallbackModel: openrouter("z-ai/glm-4.7-flash"),
    maxRetries: parseInt(process.env.MAX_RETRIES || "2", 10),
  };
}
