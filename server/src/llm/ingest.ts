import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { llmClient, config } from "./client.js";
import { createIngestTools } from "./ingest-tools.js";
import { Queries } from "../db/queries.js";
import Database from "better-sqlite3";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadL1Index(queries: Queries): string {
  const pages = queries.getAllWikiPages();
  if (pages.length === 0) {
    return "(No pages in wiki yet)";
  }

  const entries = pages
    .map((page) => {
      return `- \`${page.slug}\`: ${page.title} | ${page.tags || "untagged"}`;
    })
    .join("\n");

  return entries;
}

function loadSchema(): string {
  const schemaPath = path.join(__dirname, "prompts", "schema.md");
  return fs.readFileSync(schemaPath, "utf-8");
}

export async function ingestRawSource(
  db: Database.Database,
  rawSourceId: number,
  rawContent: string,
): Promise<{ pagesWritten: number; warnings: number }> {
  const queries = new Queries(db);
  console.log(
    `[INGEST] Pipeline starting for raw-${rawSourceId}: content length=${rawContent.length}`,
  );

  // Load L1 context
  const l1Index = loadL1Index(queries);
  const l1Schema = loadSchema();

  console.log(
    `[INGEST] L1 context loaded: pages=${queries.getAllWikiPages().length}, schema length=${l1Schema.length}`,
  );

  // Load and prepare system prompt
  const systemPromptPath = path.join(__dirname, "prompts", "ingest-system.md");
  let systemPrompt = fs.readFileSync(systemPromptPath, "utf-8");
  systemPrompt = systemPrompt.replaceAll("{L1_INDEX}", () => l1Index);
  systemPrompt = systemPrompt.replaceAll("{L1_SCHEMA}", () => l1Schema);
  systemPrompt = systemPrompt.replaceAll("{RAW_ID}", () =>
    rawSourceId.toString(),
  );

  // Create tools
  const tools = createIngestTools(db, rawSourceId);

  try {
    console.log(`[INGEST] Agent loop starting for raw-${rawSourceId}`);

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
      onStepFinish: (event) => {
        const toolCallCount = event.toolCalls?.length || 0;
        const toolResultCount = event.toolResults?.length || 0;
        console.log(
          `[INGEST] onStepFinish raw-${rawSourceId}: finishReason=${event.finishReason || "unknown"} toolCalls=${toolCallCount} toolResults=${toolResultCount} textLength=${event.text?.length || 0}`,
        );
      },
      temperature: 0.7,
      maxOutputTokens: 4096,
    });

    console.log(`[INGEST] === DIAGNOSTIC for raw-${rawSourceId} ===`);
    console.log(`[INGEST] Steps: ${result.steps.length}`);
    console.log(`[INGEST] Finish reason: ${result.finishReason || "unknown"}`);
    console.log(`[INGEST] Final text: "${result.text || ""}"`);
    console.log(`[INGEST] Usage: ${JSON.stringify(result.usage || null)}`);

    // Log each step
    for (let i = 0; i < result.steps.length; i++) {
      const step = result.steps[i];
      const toolNames = step.toolCalls?.map((tc) => tc.toolName) || [];
      const finishReason = step.finishReason || "unknown";
      const toolResultCount = step.toolResults?.length || 0;
      const toolCallDetails = (step.toolCalls || []).map((toolCall) => ({
        name: toolCall.toolName,
        args: "input" in toolCall ? toolCall.input : undefined,
      }));
      const textPreview =
        step.text?.substring(0, 150).replace(/\n/g, " ") || "(no text)";
      console.log(`[INGEST] --- Step ${i + 1} ---`);
      console.log(`[INGEST]   text: "${step.text || "(empty)"}"`);
      console.log(`[INGEST]   finishReason: ${finishReason}`);
      console.log(`[INGEST]   toolCalls: ${JSON.stringify(toolCallDetails)}`);
      console.log(`[INGEST]   toolResults count: ${toolResultCount}`);
      console.log(
        `[INGEST] Step ${i + 1}: finishReason=${finishReason} tools=[${toolNames.join(", ")}] toolResults=${toolResultCount} text="${textPreview}"`,
      );
    }
    console.log(`[INGEST] === END DIAGNOSTIC ===`);

    // Count results from tool calls
    const toolCalls = result.steps.flatMap((s) => s.toolCalls || []);
    const pagesWritten = toolCalls.filter(
      (tc) => tc.toolName === "upsert_wiki_page",
    ).length;
    const warnings = toolCalls.filter(
      (tc) => tc.toolName === "report_warning",
    ).length;

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
