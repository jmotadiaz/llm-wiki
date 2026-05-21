import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { llmClient } from "./client.js";
import { createReviewTools, ReviewAgentKind } from "./review-tools.js";
import { Queries } from "../db/queries.js";
import {
  createReviewTraceSession,
  createReviewStepLogger,
} from "../utils/trace.js";
import Database from "better-sqlite3";
import { debugLog, isDebugEnabled } from "../utils/debug.js";
import { buildIngestIndex } from "./wiki-index.js";

const KNOWN_TYPES = new Set([
  "concept",
  "technique",
  "reference",
  "index",
  "domain-index",
  "learning-path",
]);

export function isReviewableType(type: string): boolean {
  return KNOWN_TYPES.has(type);
}

function resolveReviewConfig(pageType: string): {
  promptFile: string;
  kind: ReviewAgentKind;
} {
  if (pageType === "domain-index") {
    return { promptFile: "review-domain-index.md", kind: "domain-index" };
  }
  if (pageType === "learning-path") {
    return { promptFile: "review-learning-path.md", kind: "learning-path" };
  }
  return { promptFile: "reviewer.md", kind: "standard" };
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


function loadSchema(): string {
  const schemaPath = path.join(__dirname, "prompts", "schema.md");
  return fs.readFileSync(schemaPath, "utf-8");
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

function summarizeStep(event: any) {
  return {
    stepNumber: event.stepNumber,
    finishReason: event.finishReason,
    text: event.text || undefined,
    toolCalls: (event.toolCalls || []).map((tc: any) => ({
      toolName: tc.toolName,
      input: tc.input ?? tc.args ?? tc.arguments ?? tc.parameters,
    })),
    usage: event.usage,
  };
}

export async function reviewComment(
  db: Database.Database,
  commentId: number,
): Promise<void> {
  const debugEnabled = isDebugEnabled();
  const queries = new Queries(db);

  debugLog(`[REVIEW] Starting review for comment ${commentId}`);

  // Load comment
  const stmt = db.prepare(
    "SELECT pc.*, wp.slug FROM page_comments pc JOIN wiki_pages wp ON pc.page_id = wp.id WHERE pc.id = ?",
  );
  const comment = stmt.get(commentId) as any;

  if (!comment) {
    throw new Error(`Comment ${commentId} not found`);
  }

  const pageSlug = comment.slug;

  // Resolve feedback text from thread (for threaded conversations) or from content (single-shot)
  let feedbackText = comment.content;
  let threadMessages: Array<{ role: "user" | "assistant"; content: string }> | null = null;

  if (comment.thread) {
    try {
      const parsed = JSON.parse(comment.thread);
      if (Array.isArray(parsed) && parsed.length > 0) {
        threadMessages = parsed;
        // Use the latest user message as the feedback for the system prompt
        const lastUserMsg = [...parsed].reverse().find((m: any) => m.role === "user");
        if (lastUserMsg) {
          feedbackText = lastUserMsg.content;
        }
      }
    } catch {
      // invalid JSON, fall back to comment.content
    }
  }

  debugLog(
    `[REVIEW] Comment ${commentId} is for page "${pageSlug}": "${feedbackText.substring(0, 50)}..."`,
  );

  // Load page content
  const page = queries.getWikiPageBySlug(pageSlug);
  if (!page) {
    throw new Error(`Page "${pageSlug}" not found`);
  }

  const pageContent = [
    `slug: ${page.slug}`,
    `title: ${page.title}`,
    `type: ${page.type}`,
    `tags: ${page.tags || ""}`,
    `---`,
    page.content,
  ].join("\n");

  // Load shared context
  const l1Index = buildIngestIndex(queries);
  const l1Schema = loadSchema();

  const vars: Record<string, string> = {
    FEEDBACK: feedbackText,
    PAGE_CONTENT: pageContent,
    L1_INDEX: l1Index,
    L1_SCHEMA: l1Schema,
  };

  const { promptFile, kind } = resolveReviewConfig(page.type);

  // Create trace session
  const session = createReviewTraceSession(commentId, pageSlug);
  const stepLogger = createReviewStepLogger(session);

  const reviewerPrompt = interpolatePrompt(
    loadPromptTemplate(promptFile),
    vars,
  );

  debugLog(
    `[REVIEW] Reviewer agent starting for comment ${commentId} on page "${pageSlug}" (type=${page.type}, kind=${kind})`,
  );
  debugLog(
    `[REVIEW] Reviewer system prompt for comment ${commentId}`,
    reviewerPrompt,
  );

  // Create tools with closure to track pagesEdited
  const tools = createReviewTools(db, commentId, pageSlug, kind);

  // Build messages: use thread history if available (multi-turn conversation),
  // otherwise a single user message with the feedback wrapper
  const messages = threadMessages && threadMessages.length > 1
    ? threadMessages
    : [
        {
          role: "user" as const,
          content: `Por favor, revisa la siguiente retroalimentación sobre la página wiki y toma acciones si es necesario:\n\nRetroalimentación: ${feedbackText}\n\nPágina: /wiki/${pageSlug}`,
        },
      ];

  try {
    const result = await llmClient.generate({
      system: reviewerPrompt,
      messages,
      tools,
      model: "pro",
      maxSteps: 15,
      providerOptions: {
        opencodeZenGo: { reasoningEffort: "max" },
      },
      onStepFinish: (event: any) => {
        stepLogger(summarizeStep(event));
        if (debugEnabled) {
          debugLog(
            `[REVIEW] Step finished for comment ${commentId}`,
            summarizeStep(event),
          );
        }
      },
    });

    // Check if reply_to_comment was called
    const toolCalls = result.steps.flatMap((s) => s.toolCalls || []);
    const replyCalled = toolCalls.some(
      (tc) => tc.toolName === "reply_to_comment",
    );

    if (!replyCalled) {
      debugLog(
        `[REVIEW] Agent did not call reply_to_comment, using fallback for comment ${commentId}`,
      );
      const fallbackReasoning =
        "El agente de revisión no respondió correctamente. Por favor, intenta enviar tu retroalimentación nuevamente.";
      queries.setCommentAnswered(commentId, fallbackReasoning, []);
    }

    debugLog(`[REVIEW] Complete for comment ${commentId}`, {
      finishReason: (result as any).finishReason,
      steps: result.steps?.length ?? 0,
      toolCalls: toolCalls.map((tc) => ({
        toolName: tc.toolName,
        input: tc.input,
      })),
    });

    console.log(
      `[REVIEW] Review complete for comment ${commentId} on page "${pageSlug}"`,
    );
  } catch (error: any) {
    console.error(
      `[REVIEW] Review failed for comment ${commentId}: ${error.message}`,
    );
    queries.setCommentFailed(commentId, error.message);
    throw new Error(`Review failed: ${error.message}`);
  }
}
