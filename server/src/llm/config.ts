import { LanguageModel } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { deepseek } from "@ai-sdk/deepseek";

export type ModelAlias = "pro" | "flash";

const opencodeGo = createOpenAICompatible({
  name: "opencode-zen-go",
  apiKey: process.env.OPENCODE_ZEN_API_KEY,
  baseURL: "https://opencode.ai/zen/go/v1",
})

export interface LLMConfig {
  apiKey: string;
  models: Record<ModelAlias, LanguageModel>;
  fallbackModels: Record<ModelAlias, LanguageModel>;
  maxRetries: number;
}

export function getLLMConfig(): LLMConfig {
  const apiKey = process.env.OPENCODE_ZEN_API_KEY;
  if (!apiKey) {
    throw new Error("OPENCODE_ZEN_API_KEY environment variable is required");
  }

  return {
    apiKey,
    models: {
      pro: opencodeGo("deepseek-v4-pro"),
      flash: opencodeGo("deepseek-v4-flash"),
    },
    fallbackModels: {
      pro: deepseek("deepseek-v4-pro"),
      flash: deepseek("deepseek-v4-flash"),
    },
    maxRetries: parseInt(process.env.MAX_RETRIES || "2", 10),
  };
}
