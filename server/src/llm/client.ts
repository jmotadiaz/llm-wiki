import {
  generateText,
  streamText,
  generateObject,
  ModelMessage,
  GenerateTextResult,
  StreamTextResult,
  ToolLoopAgent,
  stepCountIs,
  LanguageModel,
} from "ai";
import { getLLMConfig } from "./config.js";
import { z } from "zod";

export const config = getLLMConfig();

interface GenerateOptions {
  system?: string;
  messages: ModelMessage[];
  temperature?: number;
  maxOutputTokens?: number;
  model?: LanguageModel;
  tools?: Record<string, any>;
  maxSteps?: number;
  stopWhen?: (event: any) => boolean;
  onStepFinish?: (event: any) => Promise<void> | void;
}

interface GenerateObjectOptions<T extends z.ZodType> {
  system?: string;
  messages: ModelMessage[];
  temperature?: number;
  maxOutputTokens?: number;
  model?: LanguageModel;
  schema: T;
}

interface StreamOptions extends GenerateOptions {
  onChunk?: (chunk: string) => void;
}

export class LLMClient {
  private createToolLoopAgent(
    model: LanguageModel,
    options: GenerateOptions,
  ): ToolLoopAgent<never, Record<string, any>> {
    return new ToolLoopAgent({
      model,
      instructions: options.system,
      tools: options.tools,
      stopWhen: options.stopWhen ?? stepCountIs(options.maxSteps ?? 20),
      temperature: options.temperature ?? 0.7,
      maxOutputTokens: options.maxOutputTokens,
      onStepFinish: options.onStepFinish,
    });
  }

  async generate(
    options: GenerateOptions,
  ): Promise<GenerateTextResult<any, any>> {
    let lastError: Error | null = null;

    const primary = options.model ?? config.primaryModel;
    const commonOptions = {
      system: options.system,
      messages: options.messages,
      temperature: options.temperature ?? 0.7,
      maxOutputTokens: options.maxOutputTokens,
    };

    // Try primary model first
    try {
      console.log(`[LLM] Using primary model: ${primary}`);
      if (options.tools) {
        const agent = this.createToolLoopAgent(primary, options);
        return await agent.generate({ messages: options.messages });
      }
      return await generateText({
        model: primary,
        ...commonOptions,
      });
    } catch (error) {
      lastError = error as Error;
      console.warn(
        `Primary model (${primary}) failed:`,
        lastError.message,
      );
    }

    // Try fallback model
    try {
      console.log(`[LLM] Using fallback model: ${config.fallbackModel}`);
      if (options.tools) {
        const agent = this.createToolLoopAgent(config.fallbackModel, options);
        return await agent.generate({ messages: options.messages });
      }
      return await generateText({
        model: config.fallbackModel,
        ...commonOptions,
      });
    } catch (error) {
      throw new Error(
        `LLM generation failed on both models: ${lastError?.message}, ${(error as Error).message}`,
      );
    }
  }

  async generateStructured<T extends z.ZodType>(
    options: GenerateObjectOptions<T>,
  ): Promise<z.infer<T>> {
    let lastError: Error | null = null;

    const primary = options.model ?? config.primaryModel;
    const commonOptions = {
      schema: options.schema,
      system: options.system,
      messages: options.messages,
      temperature: options.temperature ?? 0.7,
      maxOutputTokens: options.maxOutputTokens,
    };

    // Try primary model first
    try {
      console.log(`[LLM] Using primary model (structured): ${primary}`);
      const { object } = await generateObject({
        model: primary,
        ...commonOptions,
      });
      return object;
    } catch (error) {
      lastError = error as Error;
      console.warn(
        `Primary model structured (${primary}) failed:`,
        lastError.message,
      );
    }

    // Try fallback model
    try {
      console.log(
        `[LLM] Using fallback model (structured): ${config.fallbackModel}`,
      );
      const { object } = await generateObject({
        model: config.fallbackModel,
        ...commonOptions,
      });
      return object;
    } catch (error) {
      throw new Error(
        `LLM structured generation failed on both models: ${lastError?.message}, ${(error as Error).message}`,
      );
    }
  }

  async stream(options: StreamOptions): Promise<StreamTextResult<any, any>> {
    let lastError: Error | null = null;

    const primary = options.model ?? config.primaryModel;
    const commonOptions = {
      system: options.system,
      messages: options.messages,
      temperature: options.temperature ?? 0.7,
      maxOutputTokens: options.maxOutputTokens,
    };

    // Try primary model first
    try {
      console.log(`[LLM] Using primary model (stream): ${primary}`);
      if (options.tools) {
        const agent = this.createToolLoopAgent(primary, options);
        return await agent.stream({ messages: options.messages });
      }
      const result = streamText({
        model: primary,
        ...commonOptions,
      });

      // We need to iterate over the text stream if onChunk is provided
      if (options.onChunk) {
        this.consumeStream(result, options.onChunk);
      }

      return result;
    } catch (error) {
      lastError = error as Error;
      console.warn(
        `Primary model stream (${primary}) failed:`,
        lastError.message,
      );
    }

    // Try fallback model
    try {
      console.log(
        `[LLM] Using fallback model (stream): ${config.fallbackModel}`,
      );
      if (options.tools) {
        const agent = this.createToolLoopAgent(config.fallbackModel, options);
        return await agent.stream({ messages: options.messages });
      }
      const result = streamText({
        model: config.fallbackModel,
        ...commonOptions,
      });

      if (options.onChunk) {
        this.consumeStream(result, options.onChunk);
      }

      return result;
    } catch (error) {
      throw new Error(
        `LLM stream failed on both models: ${lastError?.message}, ${(error as Error).message}`,
      );
    }
  }

  private async consumeStream(
    result: StreamTextResult<any, any>,
    onChunk: (chunk: string) => void,
  ) {
    try {
      for await (const chunk of result.textStream) {
        onChunk(chunk);
      }
    } catch (error) {
      console.error("[LLM] Error consuming text stream:", error);
    }
  }
}

export const llmClient = new LLMClient();
