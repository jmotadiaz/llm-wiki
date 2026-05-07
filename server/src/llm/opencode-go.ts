import { createOpenAI } from "@ai-sdk/openai";
import { LanguageModel } from "ai";

let _provider: ReturnType<typeof createOpenAI> | undefined;

function getProvider() {
  if (!_provider) {
    const apiKey = process.env.OPENCODE_GO_API_KEY;
    if (!apiKey)
      throw new Error("OPENCODE_GO_API_KEY environment variable is required");
    _provider = createOpenAI({
      apiKey,
      baseURL: "https://opencode.ai/zen/go/v1",
    });
  }
  return _provider;
}

export function opencodeGo(modelId: string): LanguageModel {
  return getProvider()(modelId);
}
