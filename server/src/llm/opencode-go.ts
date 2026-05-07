import { createGateway } from "@ai-sdk/gateway";
import { LanguageModel } from "ai";

let _gateway: ReturnType<typeof createGateway> | undefined;

function getGateway() {
  if (!_gateway) {
    const apiKey = process.env.VERCEL_AI_GATEWAY_API_KEY;
    if (!apiKey)
      throw new Error(
        "VERCEL_AI_GATEWAY_API_KEY environment variable is required",
      );
    _gateway = createGateway({ apiKey });
  }
  return _gateway;
}

export function opencodeGo(modelId: string): LanguageModel {
  return getGateway()(modelId);
}
