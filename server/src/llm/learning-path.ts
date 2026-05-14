import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { z } from "zod";
import Database from "better-sqlite3";
import { llmClient } from "./client.js";
import {
  createLearningPathWriterTools,
  type LearningPathWriterResult,
} from "./learning-path-tools.js";
import { ensureWikiDirectory } from "./wiki-tools.js";
import { Queries } from "../db/queries.js";
import { debugLog, isDebugEnabled } from "../utils/debug.js";
import {
  node,
  chain,
  parallel,
  type WorkflowNode,
  type ParallelAggregatorInput,
} from "../workflows/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export type LearningPathMode = "regenerate-all" | "review";

const WRITER_MAX_STEPS = 30;
const MAX_PARALLEL_WRITERS = 3;

// ── Zod schema for planner output ─────────────────────────────────────

const PathPlanItemSchema = z.object({
  slug: z.string().min(1).max(60),
  action: z.enum(["new", "revise"]),
  title: z.string().min(1),
  summary: z.string().min(1),
  framing: z.string().min(1),
  dominantDomain: z.string().min(1),
  topicTags: z.array(z.string().min(1)).default([]),
  seedPages: z.array(z.string().min(1)).min(1),
});

const LearningPathPlanSchema = z.object({
  paths: z.array(PathPlanItemSchema).default([]),
});

type PathPlanItem = z.infer<typeof PathPlanItemSchema>;
type LearningPathPlan = z.infer<typeof LearningPathPlanSchema>;
type LearningPathPlanWithTasks = LearningPathPlan & { tasks: PathPlanItem[] };

// ── Workflow input/output types ───────────────────────────────────────

interface PlannerInput {
  mode: LearningPathMode;
  indexMd: string;
  existingPaths: string;
}

interface WriterResult {
  slug: string;
  action: "new" | "revise";
  success: boolean;
  error?: string;
}

export interface LearningPathRunSummary {
  mode: LearningPathMode;
  pagesWritten: string[];
  pagesDeleted: string[];
  partial: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────

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

function listExistingArtifacts(db: Database.Database): string {
  const queries = new Queries(db);
  const pages = queries.getWikiPagesByType("learning-path");
  if (pages.length === 0) return "(none)";
  return pages
    .map((p) => {
      const summary = p.summary ? ` — ${p.summary}` : "";
      const generated = p.generated_at ? ` | generated_at: ${p.generated_at}` : "";
      const outgoing = queries.getOutgoingLinks(p.id);
      const links = outgoing.length > 0
        ? `\n  pages: ${outgoing.join(", ")}`
        : "";
      return `- \`${p.slug}\`: ${p.title}${summary}${generated}${links}`;
    })
    .join("\n");
}

function buildModeBlock(mode: LearningPathMode): string {
  if (mode === "regenerate-all") {
    return [
      "Mode: regenerate-all",
      "",
      'All existing learning-path pages have been wiped. Plan the full set from scratch — every entry in `paths` MUST have action="new".',
    ].join("\n");
  }
  return [
    "Mode: review",
    "",
    'Existing learning-path pages remain. For each one:',
    '- Keep as-is → omit it from `paths`.',
    '- Revise → include it with action="revise".',
    "After triaging, add new journeys that have emerged with action=\"new\".",
  ].join("\n");
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

function parsePlanJson(text: string): LearningPathPlan {
  const trimmed = text.trim();
  try {
    return LearningPathPlanSchema.parse(JSON.parse(trimmed));
  } catch {
    const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) {
      return LearningPathPlanSchema.parse(JSON.parse(fence[1].trim()));
    }
    const brace = trimmed.match(/\{[\s\S]*\}/);
    if (brace) {
      return LearningPathPlanSchema.parse(JSON.parse(brace[0]));
    }
    throw new Error(
      `Planner output is not valid JSON. Raw text: ${trimmed.substring(0, 500)}`,
    );
  }
}

function deleteAllLearningPathPages(db: Database.Database): string[] {
  const queries = new Queries(db);
  const wikiDir = ensureWikiDirectory();
  const pages = queries.getWikiPagesByType("learning-path");
  const deleteStmt = db.prepare("DELETE FROM wiki_pages WHERE id = ?");
  const deleted: string[] = [];

  for (const page of pages) {
    queries.deleteWikiLinksForPage(page.id);
    deleteStmt.run(page.id);
    const filepath = path.join(wikiDir, `${page.slug}.md`);
    if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
    deleted.push(page.slug);
  }

  return deleted;
}

// ── Planner Node (no tools — generateText from index only) ────────────

function createPlannerNode(): WorkflowNode<PlannerInput, LearningPathPlan> {
  return node(async (input): Promise<LearningPathPlan> => {
    debugLog(`[LP] Planner starting (mode=${input.mode})`);

    const plannerPrompt = interpolatePrompt(
      loadPromptTemplate("learning-path-planner.md"),
      {
        INDEX_MD: input.indexMd.trim(),
        EXISTING_PATHS: input.existingPaths,
        MODE_BLOCK: buildModeBlock(input.mode),
      },
    );

    const result = await llmClient.generate({
      system: plannerPrompt,
      messages: [
        {
          role: "user",
          content:
            "Analiza el wiki y emite el plan de learning-paths como JSON, siguiendo el schema y el modo indicado.",
        },
      ],
      model: "pro",
      maxSteps: 1,
    });

    const text = result.text;
    if (!text || text.trim().length === 0) {
      throw new Error("Planner returned empty output");
    }

    const plan = parsePlanJson(text);

    console.log(`[LP] Planner complete: ${plan.paths.length} paths planned`);
    debugLog(`[LP] Plan`, plan);

    return plan;
  });
}

// ── Writer Node (one per path — autonomous exploration) ───────────────

function createWriterNode(
  db: Database.Database,
  result: LearningPathWriterResult,
): WorkflowNode<PathPlanItem, WriterResult> {
  const debugEnabled = isDebugEnabled();

  return node(async (item: PathPlanItem): Promise<WriterResult> => {
    const slug = item.slug;
    debugLog(`[LP] Writer starting for "${slug}" (action=${item.action})`);

    const writerPrompt = interpolatePrompt(
      loadPromptTemplate("learning-path-writer-single.md"),
      {
        L1_SCHEMA: loadSchema(),
        PLAN_ITEM: JSON.stringify(item, null, 2),
      },
    );

    const tools = createLearningPathWriterTools(db, result);

    try {
      const llmResult = await llmClient.generate({
        system: writerPrompt,
        messages: [
          {
            role: "user",
            content: `Explora el wiki y escribe la página learning-path "${item.title}" (slug: ${slug}).`,
          },
        ],
        tools,
        model: "flash",
        maxSteps: WRITER_MAX_STEPS,
        onStepFinish: debugEnabled
          ? (event: any) => {
              debugLog(`[LP] Writer step for "${slug}"`, summarizeStep(event));
            }
          : undefined,
      });

      const toolCalls = llmResult.steps.flatMap((s) => s.toolCalls || []);
      const written = toolCalls.filter(
        (tc) => tc.toolName === "add_wiki_page" || tc.toolName === "edit_wiki_page",
      );

      console.log(`[LP] Writer complete for "${slug}": success=${written.length > 0}`);

      return { slug, action: item.action, success: written.length > 0 };
    } catch (error: any) {
      console.error(`[LP] Writer failed for "${slug}": ${error.message}`);
      return { slug, action: item.action, success: false, error: error.message };
    }
  });
}

// ── Aggregator Node (deterministic) ───────────────────────────────────

interface AggregatedRun {
  successes: WriterResult[];
  failures: { slug: string; error: string }[];
}

function createAggregatorNode(): WorkflowNode<
  ParallelAggregatorInput<WriterResult, PathPlanItem, LearningPathPlanWithTasks>,
  AggregatedRun
> {
  return node(async (input): Promise<AggregatedRun> => {
    const successes = input.results.filter((r) => r.success);
    const writerFailures = input.results
      .filter((r) => !r.success)
      .map((r) => ({ slug: r.slug, error: r.error ?? "writer reported failure" }));
    const errorFailures = input.errors.map((e) => ({
      slug: e.task.slug,
      error: e.error instanceof Error ? e.error.message : String(e.error),
    }));
    return { successes, failures: [...writerFailures, ...errorFailures] };
  });
}

// ── Main entry point ──────────────────────────────────────────────────

export interface LearningPathRunOptions {
  mode?: LearningPathMode;
}

export async function runLearningPathAgent(
  db: Database.Database,
  opts: LearningPathRunOptions = {},
): Promise<LearningPathRunSummary> {
  const mode: LearningPathMode = opts.mode ?? "review";
  const deleted = mode === "regenerate-all" ? deleteAllLearningPathPages(db) : [];

  const indexMd = loadIndexMarkdown();
  const existingPaths = listExistingArtifacts(db);

  console.log(`[LP] Run starting (mode=${mode}, deleted=${deleted.length})`);

  const writerResult: LearningPathWriterResult = { writtenSlugs: [] };

  const workflow = chain(
    createPlannerNode(),
    chain(
      node(async (plan: LearningPathPlan): Promise<LearningPathPlanWithTasks> => ({
        ...plan,
        tasks: plan.paths,
      })),
      parallel(
        createWriterNode(db, writerResult),
        createAggregatorNode(),
        { maxParallel: MAX_PARALLEL_WRITERS },
      ),
    ),
  );

  let aggregated: AggregatedRun;
  try {
    aggregated = await workflow.execute({ mode, indexMd, existingPaths });
  } catch (error: any) {
    console.error(`[LP] Pipeline failed: ${error.message}`);
    return { mode, pagesWritten: [], pagesDeleted: deleted, partial: true };
  }

  const partial = aggregated.failures.length > 0;
  console.log(
    `[LP] Run complete: ${writerResult.writtenSlugs.length} written, ${deleted.length} deleted` +
      (partial
        ? `, ${aggregated.failures.length} failed (${aggregated.failures.map((f) => f.slug).join(", ")})`
        : ""),
  );

  return {
    mode,
    pagesWritten: writerResult.writtenSlugs,
    pagesDeleted: deleted,
    partial,
  };
}
