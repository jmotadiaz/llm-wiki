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
import { getLLMConfig, ModelAlias } from "./config.js";
import { z } from "zod";

export const config = getLLMConfig();

interface GenerateOptions {
  system?: string;
  messages: ModelMessage[];
  temperature?: number;
  topP?: number;
  maxOutputTokens?: number;
  /** Model alias: "pro" (heavy reasoning) or "flash" (fast/cheap). Default: "pro". */
  model?: ModelAlias;
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
  /** Model alias: "pro" (heavy reasoning) or "flash" (fast/cheap). Default: "pro". */
  model?: ModelAlias;
  schema: T;
}

interface StreamOptions extends GenerateOptions {
  onChunk?: (chunk: string) => void;
}

export class LLMClient {
  private defaultModel: ModelAlias = "pro";

  private resolveModel(alias?: ModelAlias): LanguageModel {
    return config.models[alias ?? this.defaultModel];
  }

  private resolveFallbackModel(alias?: ModelAlias): LanguageModel {
    return config.fallbackModels[alias ?? this.defaultModel];
  }

  private createToolLoopAgent(
    model: LanguageModel,
    options: GenerateOptions,
  ): ToolLoopAgent<never, Record<string, any>> {
    return new ToolLoopAgent({
      model,
      instructions: options.system,
      tools: options.tools,
      stopWhen: options.stopWhen ?? stepCountIs(options.maxSteps ?? 20),
      temperature: options.temperature,
      topP: options.topP,
      maxOutputTokens: options.maxOutputTokens,
      onStepFinish: options.onStepFinish,
    });
  }

  async generate(
    options: GenerateOptions,
  ): Promise<GenerateTextResult<any, any>> {
    const alias = options.model ?? this.defaultModel;

    const tryGenerate = (
      model: LanguageModel,
    ): Promise<GenerateTextResult<any, any>> => {

      console.log(`[LLM] Using model: ${model}`);
      if (options.tools) {
        const agent = this.createToolLoopAgent(model, options);
        return agent.generate({ messages: options.messages });
      }
      return generateText({ ...options, model });
    }

    try {
      return tryGenerate(this.resolveModel(alias));
    } catch (primaryError) {
      console.warn(`LLM model "${alias}" failed:`, (primaryError as Error).message);

      // Only fallback from "pro" to "flash"; "flash" has no fallback
      if (alias !== "pro") {
        throw primaryError;
      }

      try {
        return tryGenerate(this.resolveFallbackModel(alias));
      } catch (fallbackError) {
        throw new Error(
          `LLM generation failed on both models: ${(primaryError as Error).message}, ${(fallbackError as Error).message}`,
        );
      }
    }
  }

  async generateStructured<T extends z.ZodType>(
    options: GenerateObjectOptions<T>,
  ): Promise<z.infer<T>> {
    const alias = options.model ?? this.defaultModel;

    const tryStructured = (model: LanguageModel): Promise<z.infer<T>> => {
      console.log(`[LLM] Using model (structured): ${model}`);
      return generateObject({ ...options, model }).then(r => r.object);
    };

    try {
      return tryStructured(this.resolveModel(alias));
    } catch (primaryError) {
      console.warn(
        `LLM structured model "${alias}" failed:`,
        (primaryError as Error).message,
      );

      if (alias !== "pro") {
        throw primaryError;
      }

      try {
        return tryStructured(this.resolveFallbackModel(alias));
      } catch (fallbackError) {
        throw new Error(
          `LLM structured generation failed on both models: ${(primaryError as Error).message}, ${(fallbackError as Error).message}`,
        );
      }
    }
  }

  async stream(options: StreamOptions): Promise<StreamTextResult<any, any>> {
    const alias = options.model ?? this.defaultModel;

    const tryStream = (model: LanguageModel): Promise<StreamTextResult<any, any>> => {
      console.log(`[LLM] Using model (stream): ${model}`);
      if (options.tools) {
        const agent = this.createToolLoopAgent(model, options);
        return agent.stream({ messages: options.messages });
      }
      const streamOptions: Pick<
        GenerateOptions,
        "system" | "messages" | "temperature" | "topP" | "maxOutputTokens"
      > = {
        system: options.system,
        messages: options.messages,
        temperature: options.temperature,
        topP: options.topP,
        maxOutputTokens: options.maxOutputTokens,
      };
      const result = streamText({ ...streamOptions, model });

      if (options.onChunk) {
        this.consumeStream(result, options.onChunk);
      }

      return Promise.resolve(result);
    };

    try {
      return tryStream(this.resolveModel(alias));
    } catch (primaryError) {
      console.warn(
        `LLM stream model "${alias}" failed:`,
        (primaryError as Error).message,
      );

      if (alias !== "pro") {
        throw primaryError;
      }

      try {
        return tryStream(this.resolveFallbackModel(alias));
      } catch (fallbackError) {
        throw new Error(
          `LLM stream failed on both models: ${(primaryError as Error).message}, ${(fallbackError as Error).message}`,
        );
      }
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
