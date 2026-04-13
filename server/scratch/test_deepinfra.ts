import "dotenv/config";
import { deepinfra } from "@ai-sdk/deepinfra";
import { generateText, generateObject } from "ai";
import { z } from "zod";

async function testModel(modelId: string) {
  console.log(`\n--- Testing model: ${modelId} ---`);
  
  // Test text generation
  try {
    console.log("Testing text generation...");
    const { text } = await generateText({
      model: deepinfra(modelId),
      prompt: "Say hello",
    });
    console.log("Text success:", text);
  } catch (error: any) {
    console.error("Text failed:", error.message);
  }

  // Test structured output
  try {
    console.log("Testing structured output...");
    const { object } = await generateObject({
      model: deepinfra(modelId),
      schema: z.object({
        greeting: z.string(),
        language: z.string(),
      }),
      prompt: "Say hello in Spanish",
    });
    console.log("Structured success:", JSON.stringify(object));
  } catch (error: any) {
    console.error("Structured failed:", error.message);
    if (error.data) {
       console.error("Error data:", JSON.stringify(error.data, null, 2));
    }
  }
}

async function testToolCalling(modelId: string) {
  console.log(`\n--- Testing tool calling: ${modelId} ---`);
  try {
    const { text, toolCalls } = await generateText({
      model: deepinfra(modelId),
      tools: {
        getWeather: {
          description: "Get the weather in a city",
          parameters: z.object({
            city: z.string(),
          }),
          execute: async ({ city }) => ({ city, weather: "sunny" }),
        },
      },
      prompt: "What is the weather in Paris?",
    });
    console.log("Tool calling success:", text);
    console.log("Tool calls:", JSON.stringify(toolCalls));
  } catch (error: any) {
    console.error("Tool calling failed:", error.message);
    if (error.data) {
       console.error("Error data:", JSON.stringify(error.data, null, 2));
    }
  }
}

async function runTests() {
  const models = [
    "stepfun-ai/Step-3.5-Flash",
    "meta-llama/Llama-3.3-70B-Instruct-Turbo",
    "Qwen/Qwen2.5-72B-Instruct"
  ];

  for (const model of models) {
    await testModel(model);
    await testToolCalling(model);
  }
}

runTests();
