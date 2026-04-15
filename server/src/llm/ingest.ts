import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { openrouter } from "@openrouter/ai-sdk-provider";
import { llmClient } from "./client.js";
import { createIngestPlannerTools, createIngestTools } from "./ingest-tools.js";
import { Queries } from "../db/queries.js";
import Database from "better-sqlite3";
import { buildRawHeadingIndex } from "./raw-headings.js";
import { debugLog, isDebugEnabled } from "../utils/debug.js";
import { deepseek } from "@ai-sdk/deepseek";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadL1Index(queries: Queries): string {
  const pages = queries.getAllWikiPages();
  if (pages.length === 0) {
    return "(No pages in wiki yet)";
  }

  const entries = pages
    .map((page) => {
      return `- [[${page.slug}]]: ${page.title} | ${page.tags || "untagged"}`;
    })
    .join("\n");

  return entries;
}

function loadSchema(): string {
  const schemaPath = path.join(__dirname, "prompts", "schema.md");
  return fs.readFileSync(schemaPath, "utf-8");
}

function summarizeToolCalls(toolCalls: any[] = []): any[] {
  return toolCalls.map((toolCall) => ({
    toolName: toolCall.toolName,
    input:
      toolCall.input ??
      toolCall.args ??
      toolCall.arguments ??
      toolCall.parameters,
  }));
}

function summarizeToolResults(toolResults: any[] = []): any[] {
  return toolResults.map((toolResult) => ({
    toolName: toolResult.toolName,
    output:
      toolResult.output ?? toolResult.result ?? toolResult.value ?? toolResult,
  }));
}

function summarizeStep(event: any) {
  return {
    stepNumber: event.stepNumber,
    finishReason: event.finishReason,
    text: event.text || undefined,
    toolCalls: summarizeToolCalls(event.toolCalls),
    toolResults: summarizeToolResults(event.toolResults),
    usage: event.usage,
  };
}

function loadPromptTemplate(filename: string): string {
  const promptPath = path.join(__dirname, "prompts", filename);
  return fs.readFileSync(promptPath, "utf-8");
}

function interpolatePrompt(
  template: string,
  vars: Record<string, string>,
): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replaceAll(`{${key}}`, () => value);
  }
  return result;
}

export async function ingestRawSource(
  db: Database.Database,
  rawSourceId: number,
  rawContent: string,
): Promise<{ pagesWritten: number; warnings: number }> {
  const debugEnabled = isDebugEnabled();
  const queries = new Queries(db);
  debugLog(
    `[INGEST] Pipeline starting for raw-${rawSourceId}: content length=${rawContent.length}`,
  );

  // Load shared context
  const l1Index = loadL1Index(queries);
  const l1Schema = loadSchema();
  const rawHeadingIndex = buildRawHeadingIndex(rawContent, rawSourceId);

  debugLog(
    `[INGEST] L1 context loaded: pages=${queries.getAllWikiPages().length}, schema length=${l1Schema.length}`,
  );

  const sharedVars: Record<string, string> = {
    L1_INDEX: l1Index,
    L1_SCHEMA: l1Schema,
    RAW_HEADING_INDEX: rawHeadingIndex,
    RAW_ID: rawSourceId.toString(),
  };

  // ── Agent 1: Planner ─────────────────────────────────────────────────
  const plannerPrompt = interpolatePrompt(
    loadPromptTemplate("ingest-planner.md"),
    sharedVars,
  );

  debugLog(`[INGEST] Planner agent starting for raw-${rawSourceId}`);
  debugLog(
    `[INGEST] Planner system prompt for raw-${rawSourceId}`,
    plannerPrompt,
  );

  const plannerTools = createIngestPlannerTools(db);

  let plan: string;
  try {
    const plannerResult = await llmClient.generate({
      system: plannerPrompt,
      messages: [
        {
          role: "user",
          content: `Analiza este documento fuente (raw source ID: ${rawSourceId}) y genera el plan de ingesta:\n\n${rawContent}`,
        },
      ],
      model: deepseek("deepseek-reasoner"),
      tools: plannerTools,
      maxSteps: 10,
      temperature: 0.3,
      onStepFinish: debugEnabled
        ? (event: any) => {
            debugLog(
              `[INGEST] Planner step finished for raw-${rawSourceId}`,
              summarizeStep(event),
            );
          }
        : undefined,
    });

    plan = plannerResult.text;
    if (!plan || plan.trim().length === 0) {
      throw new Error("Planner agent returned an empty plan");
    }

    debugLog(`[INGEST] Plan generated for raw-${rawSourceId}`, plan);
    console.log(
      `[INGEST] Planner complete for raw-${rawSourceId}: plan length=${plan.length}`,
    );
  } catch (error: any) {
    console.error(
      `[INGEST] Planner agent failed for raw-${rawSourceId}: ${error.message}`,
    );
    throw new Error(`Ingest planner failed: ${error.message}`);
  }

  // ── Agent 2: Writer ───────────────────────────────────────────────────
  const writerPrompt = interpolatePrompt(
    loadPromptTemplate("ingest-writer.md"),
    { ...sharedVars, INGESTION_PLAN: plan },
  );

  const tools = createIngestTools(db, rawSourceId);

  debugLog(`[INGEST] Writer agent starting for raw-${rawSourceId}`);
  debugLog(
    `[INGEST] Writer system prompt for raw-${rawSourceId}`,
    writerPrompt,
  );

  try {
    const result = await llmClient.generate({
      system: writerPrompt,
      messages: [
        {
          role: "user",
          content: `Ejecuta el plan de ingesta para el raw source ID: ${rawSourceId}.\n\nDocumento fuente:\n\n${rawContent}`,
        },
      ],
      tools,
      model: openrouter("xiaomi/mimo-v2-flash"),
      maxSteps: 15,
      temperature: 0.5,
      onStepFinish: debugEnabled
        ? (event: any) => {
            debugLog(
              `[INGEST] Writer step finished for raw-${rawSourceId}`,
              summarizeStep(event),
            );
          }
        : undefined,
    });

    // Count results from tool calls
    const toolCalls = result.steps.flatMap((s) => s.toolCalls || []);
    const pagesWritten = toolCalls.filter(
      (tc) => tc.toolName === "upsert_wiki_page",
    ).length;
    const warnings = toolCalls.filter(
      (tc) => tc.toolName === "report_warning",
    ).length;

    debugLog(`[INGEST] Final result for raw-${rawSourceId}`, {
      finishReason: (result as any).finishReason,
      text: result.text || undefined,
      usage: (result as any).usage,
      steps: result.steps?.length ?? 0,
      toolCalls: summarizeToolCalls(toolCalls),
    });

    console.log(
      `[INGEST] Writer complete for raw-${rawSourceId}: ${pagesWritten} pages written, ${warnings} warnings`,
    );

    return { pagesWritten, warnings };
  } catch (error: any) {
    console.error(
      `[INGEST] Writer agent failed for raw-${rawSourceId}: ${error.message}`,
    );
    throw new Error(`Ingest writer failed: ${error.message}`);
  }
}
