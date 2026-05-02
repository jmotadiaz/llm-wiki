import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { deepseek } from "@ai-sdk/deepseek";
import { llmClient } from "./client.js";
import { createReviewTools, ReviewAgentKind } from "./review-tools.js";
import { Queries } from "../db/queries.js";
import Database from "better-sqlite3";
import { debugLog, isDebugEnabled } from "../utils/debug.js";

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

function loadL1Index(queries: Queries): string {
  const pages = queries.getAllWikiPages();
  if (pages.length === 0) {
    return "(No pages in wiki yet)";
  }

  const entries = pages
    .map((page) => {
      const tags = page.tags || "untagged";
      const summary = page.summary ? ` | summary: ${page.summary}` : "";
      return `- /wiki/${page.slug}: ${page.title} | tags: ${tags}${summary}`;
    })
    .join("\n");

  return entries;
}

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

type ConversationTurn = { role: string; content: string };

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
  const feedbackText = comment.content;

  debugLog(
    `[REVIEW] Comment ${commentId} is for page "${pageSlug}": "${feedbackText.substring(0, 50)}..."`,
  );

  // Load parent conversation history if this is a reply
  const parentHistory: ConversationTurn[] = [];
  if (comment.parent_comment_id) {
    const parentStmt = db.prepare(
      "SELECT conversation_history FROM page_comments WHERE id = ?",
    );
    const parent = parentStmt.get(comment.parent_comment_id) as any;
    if (parent?.conversation_history) {
      parentHistory.push(...JSON.parse(parent.conversation_history));
    }
    debugLog(
      `[REVIEW] Loaded ${parentHistory.length} turns from parent comment ${comment.parent_comment_id}`,
    );
  }

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
  const l1Index = loadL1Index(queries);
  const l1Schema = loadSchema();

  const vars: Record<string, string> = {
    FEEDBACK: feedbackText,
    PAGE_CONTENT: pageContent,
    L1_INDEX: l1Index,
    L1_SCHEMA: l1Schema,
  };

  const { promptFile, kind } = resolveReviewConfig(page.type);

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

  const currentUserMessage = `Por favor, revisa la siguiente retroalimentación sobre la página wiki y toma acciones si es necesario:\n\nRetroalimentación: ${feedbackText}\n\nPágina: /wiki/${pageSlug}`;

  // Build messages: parent history (compacted, no tool results) + current user message
  const messages = [
    ...parentHistory.map((turn) => ({
      role: turn.role as "user" | "assistant",
      content: turn.content,
    })),
    { role: "user" as const, content: currentUserMessage },
  ];

  try {
    const result = await llmClient.generate({
      system: reviewerPrompt,
      messages,
      tools,
      model: deepseek("deepseek-v4-flash"),
      maxSteps: 15,
      onStepFinish: debugEnabled
        ? (event: any) => {
            debugLog(
              `[REVIEW] Step finished for comment ${commentId}`,
              summarizeStep(event),
            );
          }
        : undefined,
    });

    // Check if reply_to_comment was called
    const toolCalls = result.steps.flatMap((s) => s.toolCalls || []);
    const replyCall = toolCalls.find((tc) => tc.toolName === "reply_to_comment");

    let assistantReasoning: string;
    if (!replyCall) {
      debugLog(
        `[REVIEW] Agent did not call reply_to_comment, using fallback for comment ${commentId}`,
      );
      assistantReasoning =
        "El agente de revisión no respondió correctamente. Por favor, intenta enviar tu retroalimentación nuevamente.";
      queries.setCommentAnswered(commentId, assistantReasoning, []);
    } else {
      const args = (replyCall as any).args ?? (replyCall as any).input ?? {};
      assistantReasoning = args.reasoning ?? "";
    }

    // Save compacted conversation history (user + assistant text only, no tool results)
    const updatedHistory: ConversationTurn[] = [
      ...parentHistory,
      { role: "user", content: currentUserMessage },
      { role: "assistant", content: assistantReasoning },
    ];
    queries.updateCommentHistory(commentId, updatedHistory);

    debugLog(`[REVIEW] Complete for comment ${commentId}`, {
      finishReason: (result as any).finishReason,
      steps: result.steps?.length ?? 0,
      toolCalls: toolCalls.map((tc) => ({
        toolName: tc.toolName,
        input: (tc as any).args ?? (tc as any).input,
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
