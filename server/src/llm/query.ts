import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ModelMessage } from "ai";
import { llmClient } from "./client.js";
import { createTools } from "./tools.js";
import { Queries } from "../db/queries.js";
import Database from "better-sqlite3";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Loads the current wiki index for L1 context.
 */
function loadL1Index(queries: Queries): string {
  const pages = queries.getAllWikiPages();
  if (pages.length === 0) {
    return "(No pages in wiki yet)";
  }

  return pages
    .map((page) => {
      return `- \`${page.slug}\`: ${page.title} | ${page.tags || "untagged"}`;
    })
    .join("\n");
}

/**
 * Loads the wiki schema for L1 context.
 */
function loadSchema(): string {
  const schemaPath = path.join(__dirname, "prompts", "schema.md");
  if (!fs.existsSync(schemaPath)) return "(Schema not found)";
  return fs.readFileSync(schemaPath, "utf-8");
}

/**
 * Initiates a streamed chat session with the wiki agent.
 * @param db The SQLite database instance.
 * @param messages The conversation history.
 */
export async function streamChat(
  db: Database.Database,
  messages: ModelMessage[],
) {
  const queries = new Queries(db);
  const l1Index = loadL1Index(queries);
  const l1Schema = loadSchema();

  const systemPromptPath = path.join(__dirname, "prompts", "query-system.md");
  let systemPrompt = fs.readFileSync(systemPromptPath, "utf-8");

  // Inject L1 context into system prompt
  systemPrompt = systemPrompt.replaceAll("{L1_INDEX}", () => l1Index);
  systemPrompt = systemPrompt.replaceAll("{L1_SCHEMA}", () => l1Schema);

  const tools = createTools(db);

  return llmClient.stream({
    system: systemPrompt,
    messages,
    tools,
    maxSteps: 10,
    temperature: 0.2, // Keep it focused and deterministic
  });
}
