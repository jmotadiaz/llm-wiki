import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ModelMessage } from "ai";
import { llmClient } from "./client.js";
import { createTools } from "./tools.js";
import {
  createChatTraceSession,
  createChatStepLogger,
  type ChatTraceSession,
  type StepLogger,
} from "../utils/trace.js";
import { Queries } from "../db/queries.js";
import Database from "better-sqlite3";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Loads the current wiki index for L1 context.
 */
function loadL1Index(queries: Queries): string {
  const pages = queries
    .getAllWikiPages()
    .filter(
      (page: any) =>
        page.type !== "domain-index" && page.type !== "learning-path",
    );
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

function summarizeChatStep(event: any) {
  return {
    stepNumber: event.stepNumber,
    finishReason: event.finishReason,
    text: event.text || undefined,
    toolCalls: (event.toolCalls || []).map((tc: any) => ({
      toolName: tc.toolName,
      input: tc.input ?? tc.args ?? tc.arguments ?? tc.parameters,
    })),
    toolResults: (event.toolResults || []).map((tr: any) => ({
      toolName: tr.toolName,
      output: tr.output ?? tr.result,
    })),
    usage: event.usage,
  };
}

/**
 * Initiates a streamed chat session with the wiki agent.
 * @param db The SQLite database instance.
 * @param messages The conversation history.
 * @param sessionId Optional session ID for trace grouping.
 */
export async function streamChat(
  db: Database.Database,
  messages: ModelMessage[],
  sessionId?: string,
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

  // Create trace session for this chat
  const chatSessionId = sessionId || `anon-${Date.now().toString(36).slice(-6)}`;
  const traceSession = createChatTraceSession(chatSessionId);
  const stepLogger = createChatStepLogger(traceSession);

  // Store trace session dir in the stream result for reference
  const stream = llmClient.stream({
    system: systemPrompt,
    messages,
    tools,
    model: "flash",
    maxSteps: 10,
    onStepFinish: (event: any) => {
      stepLogger(summarizeChatStep(event));
    },
  });

  // Attach trace metadata to the stream for downstream use
  (stream as any).__traceDir = traceSession.dir;
  return stream;
}
