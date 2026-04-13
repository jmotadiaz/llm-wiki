import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { llmClient } from "./client.js";
import { createIngestTools } from "./ingest-tools.js";
import { Queries } from "../db/queries.js";
import Database from "better-sqlite3";
import { buildRawHeadingIndex } from "./raw-headings.js";
import { debugLog, isDebugEnabled } from "../utils/debug.js";

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

  // Load L1 context
  const l1Index = loadL1Index(queries);
  const l1Schema = loadSchema();
  const rawHeadingIndex = buildRawHeadingIndex(rawContent, rawSourceId);

  debugLog(
    `[INGEST] L1 context loaded: pages=${queries.getAllWikiPages().length}, schema length=${l1Schema.length}`,
  );

  // Load and prepare system prompt
  const systemPromptPath = path.join(__dirname, "prompts", "ingest-system.md");
  let systemPrompt = fs.readFileSync(systemPromptPath, "utf-8");
  systemPrompt = systemPrompt.replaceAll("{L1_INDEX}", () => l1Index);
  systemPrompt = systemPrompt.replaceAll("{L1_SCHEMA}", () => l1Schema);
  systemPrompt = systemPrompt.replaceAll(
    "{RAW_HEADING_INDEX}",
    () => rawHeadingIndex,
  );
  systemPrompt = systemPrompt.replaceAll("{RAW_ID}", () =>
    rawSourceId.toString(),
  );

  // Create tools
  const tools = createIngestTools(db, rawSourceId);

  try {
    debugLog(`[INGEST] Agent loop starting for raw-${rawSourceId}`);
    debugLog(
      `[INGEST] Raw heading index for raw-${rawSourceId}`,
      rawHeadingIndex,
    );
    debugLog(`[INGEST] System prompt for raw-${rawSourceId}`, systemPrompt);

    const result = await llmClient.generate({
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: `Procesa este documento fuente (raw source ID: ${rawSourceId}):\n\n${rawContent}`,
        },
      ],
      tools,
      maxSteps: 15,
      temperature: 0.5,
      onStepFinish: debugEnabled
        ? (event: any) => {
            debugLog(
              `[INGEST] Step finished for raw-${rawSourceId}`,
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
      `[INGEST] Agent loop complete for raw-${rawSourceId}: ${pagesWritten} pages written, ${warnings} warnings`,
    );

    return { pagesWritten, warnings };
  } catch (error: any) {
    console.error(
      `[INGEST] Ingest agent failed for raw-${rawSourceId}: ${error.message}`,
    );
    throw new Error(`Ingest agent failed: ${error.message}`);
  }
}
