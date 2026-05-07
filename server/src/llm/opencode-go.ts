import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { LanguageModel } from "ai";

let _provider: ReturnType<typeof createOpenAICompatible> | undefined;

function getProvider() {
  if (!_provider) {
    const apiKey = process.env.OPENCODE_ZEN_API_KEY;
    if (!apiKey)
      throw new Error("OPENCODE_ZEN_API_KEY environment variable is required");
    _provider = createOpenAICompatible({
      name: "opencode-zen",
      apiKey,
      baseURL: "https://opencode.ai/zen/v1",
    });
  }
  return _provider;
}

export function opencodeGo(modelId: string): LanguageModel {
  return getProvider()(modelId);
}
