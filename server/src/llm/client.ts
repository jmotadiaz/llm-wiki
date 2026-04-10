import { generateText, streamText, generateObject, ModelMessage } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { getLLMConfig } from "./config.js";
import { z } from "zod";

export const config = getLLMConfig();
export const openrouter = createOpenRouter({
  apiKey: config.apiKey,
});

interface GenerateOptions {
  system?: string;
  messages: ModelMessage[];
  temperature?: number;
  maxOutputTokens?: number;
}

interface GenerateObjectOptions<T extends z.ZodType> extends GenerateOptions {
  schema: T;
}

interface StreamOptions extends GenerateOptions {
  onChunk?: (chunk: string) => void;
}

export class LLMClient {
  async generate(options: GenerateOptions): Promise<string> {
    let lastError: Error | null = null;

    // Try primary model first
    try {
      console.log(`[LLM] Using primary model: ${config.primaryModel}`);
      const result = await generateText({
        model: openrouter(config.primaryModel),
        system: options.system,
        messages: options.messages,
        temperature: options.temperature ?? 0.7,
        maxOutputTokens: options.maxOutputTokens ?? 2048,
      });
      return result.text;
    } catch (error) {
      lastError = error as Error;
      console.warn(
        `Primary model (${config.primaryModel}) failed:`,
        lastError.message,
      );
    }

    // Try fallback model
    try {
      const result = await generateText({
        model: openrouter(config.fallbackModel),
        system: options.system,
        messages: options.messages,
        temperature: options.temperature ?? 0.7,
        maxOutputTokens: options.maxOutputTokens ?? 2048,
      });
      return result.text;
    } catch (error) {
      throw new Error(
        `LLM generation failed on both models: ${lastError?.message}, ${(error as Error).message}`,
      );
    }
  }

  async generateStructured<T extends z.ZodType>(options: GenerateObjectOptions<T>): Promise<z.infer<T>> {
    let lastError: Error | null = null;

    // Try primary model first
    try {
      console.log(`[LLM] Using primary model (structured): ${config.primaryModel}`);
      const { object } = await generateObject({
        model: openrouter(config.primaryModel),
        schema: options.schema,
        system: options.system,
        messages: options.messages,
        temperature: options.temperature ?? 0.7,
        maxOutputTokens: options.maxOutputTokens ?? 2048,
      });
      return object;
    } catch (error) {
      lastError = error as Error;
      console.warn(
        `Primary model structured (${config.primaryModel}) failed:`,
        lastError.message,
      );
    }

    // Try fallback model
    try {
      const { object } = await generateObject({
        model: openrouter(config.fallbackModel),
        schema: options.schema,
        system: options.system,
        messages: options.messages,
        temperature: options.temperature ?? 0.7,
        maxOutputTokens: options.maxOutputTokens ?? 2048,
      });
      return object;
    } catch (error) {
      throw new Error(
        `LLM structured generation failed on both models: ${lastError?.message}, ${(error as Error).message}`,
      );
    }
  }

  async stream(options: StreamOptions): Promise<void> {
    let lastError: Error | null = null;

    // Try primary model first
    try {
      const stream = streamText({
        model: openrouter(config.primaryModel),
        system: options.system,
        messages: options.messages,
        temperature: options.temperature ?? 0.7,
        maxOutputTokens: options.maxOutputTokens ?? 2048,
      });

      for await (const chunk of stream.textStream) {
        options.onChunk?.(chunk);
      }
      return;
    } catch (error) {
      lastError = error as Error;
      console.warn(
        `Primary model (${config.primaryModel}) failed:`,
        lastError.message,
      );
    }

    // Try fallback model
    try {
      const stream = streamText({
        model: openrouter(config.fallbackModel),
        system: options.system,
        messages: options.messages,
        temperature: options.temperature ?? 0.7,
        maxOutputTokens: options.maxOutputTokens ?? 2048,
      });

      for await (const chunk of stream.textStream) {
        options.onChunk?.(chunk);
      }
      return;
    } catch (error) {
      throw new Error(
        `LLM stream failed on both models: ${lastError?.message}, ${(error as Error).message}`,
      );
    }
  }
}

export const llmClient = new LLMClient();
