import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import Database from "better-sqlite3";
import { llmClient } from "./client.js";
import { createIndexTools, IndexAgentResult } from "./index-tools.js";
import { ensureWikiDirectory } from "./wiki-tools.js";
import { Queries } from "../db/queries.js";
import { debugLog, isDebugEnabled } from "../utils/debug.js";
import { deepseek } from "@ai-sdk/deepseek";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export type IndexCategory = "domain-index" | "learning-path";
export type IndexMode = "regenerate-all" | "review";

const PROMPT_FILES: Record<IndexCategory, string> = {
  "domain-index": "index-domain.md",
  "learning-path": "index-learning-path.md",
};

const CATEGORY_LABEL: Record<IndexCategory, string> = {
  "domain-index": "domain-index",
  "learning-path": "learning-path",
};

const MAX_STEPS = 40;

function loadSchema(): string {
  return fs.readFileSync(path.join(__dirname, "prompts", "schema.md"), "utf-8");
}

function loadPromptTemplate(filename: string): string {
  return fs.readFileSync(path.join(__dirname, "prompts", filename), "utf-8");
}

function loadIndexMarkdown(): string {
  const indexPath = path.join(__dirname, "../../..", "data", "index.md");
  if (!fs.existsSync(indexPath)) return "(index.md not found — wiki is empty)";
  return fs.readFileSync(indexPath, "utf-8");
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

function deleteCategoryPages(db: Database.Database, category: IndexCategory): string[] {
  const queries = new Queries(db);
  const wikiDir = ensureWikiDirectory();
  const pages = queries.getWikiPagesByType(category);
  const deleteStmt = db.prepare("DELETE FROM wiki_pages WHERE id = ?");
  const deletedSlugs: string[] = [];

  for (const page of pages) {
    queries.deleteWikiLinksForPage(page.id);
    deleteStmt.run(page.id);
    const filepath = path.join(wikiDir, `${page.slug}.md`);
    if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
    deletedSlugs.push(page.slug);
  }

  return deletedSlugs;
}

function listExistingArtifacts(db: Database.Database, category: IndexCategory): string {
  const queries = new Queries(db);
  const pages = queries.getWikiPagesByType(category);
  if (pages.length === 0) return "(none)";
  return pages
    .map((p) => {
      const summary = p.summary ? ` — ${p.summary}` : "";
      const generated = p.generated_at ? ` | generated_at: ${p.generated_at}` : "";
      return `- \`${p.slug}\`: ${p.title}${summary}${generated}`;
    })
    .join("\n");
}

function buildUserMessage(
  category: IndexCategory,
  mode: IndexMode,
  indexMd: string,
  existingArtifacts: string,
): string {
  const label = CATEGORY_LABEL[category];
  const modeBlock =
    mode === "regenerate-all"
      ? `Mode: regenerate-all\n\nAll existing ${label} pages have been wiped. Create the full set from scratch using add_wiki_page (one call per domain you decide to cover).`
      : `Mode: review\n\nExisting ${label} pages remain in place. For each, decide whether to keep it, revise it via edit_wiki_page, or leave it for human deletion. Then create new ${label} pages for any domains that have emerged in the wiki since they were last generated.`;

  return [
    modeBlock,
    "",
    "## Master index (data/index.md)",
    "",
    indexMd.trim(),
    "",
    `## Existing ${label} pages`,
    "",
    existingArtifacts,
    "",
    `Now produce the appropriate ${label} pages following the contract in your system prompt. Output tool calls only.`,
  ].join("\n");
}

async function runCategory(
  db: Database.Database,
  category: IndexCategory,
  mode: IndexMode,
): Promise<{ pagesWritten: string[]; deleted: string[] }> {
  const debugEnabled = isDebugEnabled();
  const deleted = mode === "regenerate-all" ? deleteCategoryPages(db, category) : [];

  const systemPrompt = loadPromptTemplate(PROMPT_FILES[category]).replace(
    "{L1_SCHEMA}",
    loadSchema(),
  );

  const indexMd = loadIndexMarkdown();
  const existingArtifacts = listExistingArtifacts(db, category);
  const userMessage = buildUserMessage(category, mode, indexMd, existingArtifacts);

  const result: IndexAgentResult = { writtenSlugs: [] };
  const tools = createIndexTools(db, category, result);

  console.log(
    `[INDEX] ${category} agent starting (mode=${mode}, deleted=${deleted.length})`,
  );

  try {
    await llmClient.generate({
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
      tools,
      model: deepseek("deepseek-v4-pro"),
      maxSteps: MAX_STEPS,
      onStepFinish: debugEnabled
        ? (event: any) =>
            debugLog(`[INDEX] ${category} step`, summarizeStep(event))
        : undefined,
    });
  } catch (error: any) {
    console.error(`[INDEX] ${category} agent failed: ${error.message}`);
  }

  console.log(
    `[INDEX] ${category} agent finished. Pages written: ${result.writtenSlugs.length}`,
  );

  return { pagesWritten: result.writtenSlugs, deleted };
}

export interface IndexRunSummary {
  mode: IndexMode;
  categoriesProcessed: IndexCategory[];
  pagesWritten: string[];
  pagesDeleted: string[];
}

export interface IndexRunOptions {
  mode?: IndexMode;
  category?: IndexCategory | "both";
}

export async function runIndexAgent(
  db: Database.Database,
  opts: IndexRunOptions = {},
): Promise<IndexRunSummary> {
  const mode: IndexMode = opts.mode ?? "review";
  const targets: IndexCategory[] =
    !opts.category || opts.category === "both"
      ? ["domain-index", "learning-path"]
      : [opts.category];

  const summary: IndexRunSummary = {
    mode,
    categoriesProcessed: [],
    pagesWritten: [],
    pagesDeleted: [],
  };

  for (const category of targets) {
    const { pagesWritten, deleted } = await runCategory(db, category, mode);
    summary.categoriesProcessed.push(category);
    summary.pagesWritten.push(...pagesWritten);
    summary.pagesDeleted.push(...deleted);
  }

  console.log(
    `[INDEX] Run complete (mode=${mode}): ${summary.pagesWritten.length} written, ${summary.pagesDeleted.length} deleted`,
  );

  return summary;
}
