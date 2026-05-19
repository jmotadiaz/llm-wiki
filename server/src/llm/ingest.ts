import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { z } from "zod";
import { llmClient } from "./client.js";
import { createIngestPlannerTools, createIngestTools } from "./ingest-tools.js";
import { Queries } from "../db/queries.js";
import Database from "better-sqlite3";
import { buildRawHeadingIndex } from "./raw-headings.js";
import { debugLog, isDebugEnabled } from "../utils/debug.js";
import {
  createTraceSession,
  createStepLogger,
  type TraceSession,
} from "../utils/trace.js";
import {
  node,
  chain,
  parallel,
  type WorkflowNode,
  type ParallelAggregatorInput,
} from "../workflows/index.js";
import { buildIngestIndex } from "./wiki-index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Zod schemas for planner output ────────────────────────────────────

const PlanItemSchema = z.object({
  slug: z.string().min(1).max(60),
  action: z.enum(["new", "update"]),
  title: z.string(),
  type: z.enum(["concept", "technique", "reference"]),
  tags: z.array(z.string()),
  keyClaims: z.array(z.string()),
  citations: z.array(z.string()),
  summary: z.string(),
  contradiction: z.boolean().optional(),
});

const IngestPlanSchema = z.object({
  pages: z.array(PlanItemSchema),
  inlineMentions: z
    .array(
      z.object({
        mention: z.string(),
        targetPage: z.string(),
        treatment: z.string(),
      }),
    )
    .optional()
    .default([]),
  inboundLinkUpdates: z
    .array(
      z.object({
        targetSlug: z.string(),
        addLinkTo: z.string(),
        reason: z.string(),
      }),
    )
    .optional()
    .default([]),
  tagLandscapeUpdates: z
    .object({
      targetSlugUpdates: z
        .array(
          z.object({
            targetSlug: z.string(),
            currentTags: z.array(z.string()),
            newTags: z.array(z.string()),
            reason: z.string(),
          }),
        )
        .optional()
        .default([]),
      newTags: z
        .array(
          z.object({
            newTag: z.string(),
            kind: z.enum(["discipline", "topic"]),
            rationale: z.string(),
            initialPages: z.array(z.string()),
          }),
        )
        .optional()
        .default([]),
    })
    .nullable()
    .optional()
    .default(null),
  warnings: z
    .array(
      z.object({
        type: z.string(),
        message: z.string(),
      }),
    )
    .optional()
    .default([]),
});

type PlanItem = z.infer<typeof PlanItemSchema>;
type IngestPlan = z.infer<typeof IngestPlanSchema>;

interface SiblingRef {
  slug: string;
  title: string;
}

interface EnrichedPlanItem extends PlanItem {
  siblings: SiblingRef[];
}

interface EnrichedIngestPlan extends IngestPlan {
  tasks: EnrichedPlanItem[];
}

interface IngestInput {
  rawSourceId: number;
  rawContent: string;
}

interface PageResult {
  slug: string;
  success: boolean;
  action: string;
  warnings: number;
  error?: string;
}

interface IngestResult {
  pagesWritten: number;
  warnings: number;
  partial: boolean;
}

// ── Shared helpers ─────────────────────────────────────────────────────


function loadDomainTagsCount(queries: Queries): string {
  const pages = queries.getAllWikiPages();
  const counts: Record<string, number> = {};
  for (const page of pages) {
    if (!page.tags) continue;
    const tags = page.tags.split(",").map((t: string) => t.trim());
    for (const t of tags) {
      if (t.startsWith("d:")) {
        counts[t] = (counts[t] || 0) + 1;
      }
    }
  }
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return "(No domain tags yet)";
  return entries.map(([tag, count]) => `- ${tag} (${count} pages)`).join("\n");
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

function summarizeToolCalls(toolCalls: any[] = []): any[] {
  return toolCalls.map((tc) => ({
    toolCallId: tc.toolCallId,
    toolName: tc.toolName,
    input:
      tc.input ?? tc.args ?? tc.arguments ?? tc.parameters,
  }));
}

function summarizeToolResults(toolResults: any[] = []): any[] {
  return toolResults.map((tr) => ({
    toolCallId: tr.toolCallId,
    toolName: tr.toolName,
    output: tr.output ?? tr.result,
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

function buildSharedVars(
  queries: Queries,
  rawSourceId: number,
  rawContent: string,
): Record<string, string> {
  return {
    L1_INDEX: buildIngestIndex(queries),
    DOMAIN_TAGS_INDEX: loadDomainTagsCount(queries),
    L1_SCHEMA: loadSchema(),
    RAW_HEADING_INDEX: buildRawHeadingIndex(rawContent, rawSourceId),
    RAW_ID: rawSourceId.toString(),
  };
}

/** Extract and parse a JSON object from LLM text output. */
function parsePlanJson(text: string): IngestPlan {
  try {
    return IngestPlanSchema.parse(JSON.parse(text.trim()));
  } catch {
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      return IngestPlanSchema.parse(JSON.parse(jsonMatch[1].trim()));
    }
    const braceMatch = text.match(/\{[\s\S]*\}/);
    if (braceMatch) {
      return IngestPlanSchema.parse(JSON.parse(braceMatch[0]));
    }
    throw new Error(
      `Planner output is not valid JSON. Raw text: ${text.substring(0, 500)}`,
    );
  }
}

function formatSiblings(siblings: SiblingRef[]): string {
  if (siblings.length === 0) return "(none — this is the only page being written from this raw source)";
  return siblings.map((s) => `- ${s.slug}: ${s.title}`).join("\n");
}

// ── Enrich Siblings Node ───────────────────────────────────────────────

function createEnrichSiblingsNode(): WorkflowNode<
  IngestPlan,
  EnrichedIngestPlan
> {
  return node(async (plan: IngestPlan): Promise<EnrichedIngestPlan> => {
    const tasks: EnrichedPlanItem[] = plan.pages.map((page) => ({
      ...page,
      siblings: plan.pages
        .filter((other) => other.slug !== page.slug)
        .map((other) => ({ slug: other.slug, title: other.title })),
    }));
    return { ...plan, tasks };
  });
}

// ── Planner Node ───────────────────────────────────────────────────────

function createPlannerNode(
  db: Database.Database,
  sharedVars: Record<string, string>,
  session: TraceSession,
): WorkflowNode<IngestInput, IngestPlan> {
  const debugEnabled = isDebugEnabled();
  const stepLogger = createStepLogger(session, "planner");

  return node(async (input): Promise<IngestPlan> => {
    debugLog(`[INGEST] Planner starting for raw-${input.rawSourceId}`);

    const plannerPrompt = interpolatePrompt(
      loadPromptTemplate("ingest-planner.md"),
      { ...sharedVars, RAW_ID: input.rawSourceId.toString() },
    );

    const plannerTools = createIngestPlannerTools(db);

    const plannerResult = await llmClient.generate({
      system: plannerPrompt,
      messages: [
        {
          role: "user",
          content: `Analiza este documento fuente (raw source ID: ${input.rawSourceId}) y genera el plan de ingesta como JSON:\n\n${input.rawContent}`,
        },
      ],
      model: "flash",
      tools: plannerTools,
      maxSteps: 20,
      providerOptions: {
        opencodeZenGo: { reasoningEffort: "max" },
      },
      onStepFinish: (event: any) => {
        const summary = summarizeStep(event);
        stepLogger(summary);
        if (debugEnabled) {
          debugLog(
            `[INGEST] Planner step for raw-${input.rawSourceId}`,
            summary,
          );
        }
      },
    });

    const planText = plannerResult.text;
    if (!planText || planText.trim().length === 0) {
      throw new Error("Planner agent returned empty output");
    }

    const plan = parsePlanJson(planText);

    console.log(
      `[INGEST] Planner complete for raw-${input.rawSourceId}: ${plan.pages.length} pages planned`,
    );
    debugLog(`[INGEST] Plan for raw-${input.rawSourceId}`, plan);

    return plan;
  });
}

// ── Writer Node ─────────────────────────────────────────────────────────

function createWriterNode(
  db: Database.Database,
  rawSourceId: number,
  rawContent: string,
  sharedVars: Record<string, string>,
  session: TraceSession,
): WorkflowNode<EnrichedPlanItem, PageResult> {
  return node(async (item: EnrichedPlanItem): Promise<PageResult> => {
    const debugEnabled = isDebugEnabled();
    const slug = item.slug;
    const stepLogger = createStepLogger(session, `writer-${slug}`);

    const { siblings, ...planItemForPrompt } = item;

    const writerPrompt = interpolatePrompt(
      loadPromptTemplate("ingest-writer-single.md"),
      {
        ...sharedVars,
        PLAN_ITEM: JSON.stringify(planItemForPrompt, null, 2),
        SIBLING_SLUGS: formatSiblings(siblings),
        RAW_CONTENT: rawContent,
      },
    );

    const tools = createIngestTools(db, rawSourceId);

    debugLog(`[INGEST] Writer starting for "${slug}" (action=${item.action})`);

    try {
      const result = await llmClient.generate({
        system: writerPrompt,
        messages: [
          {
            role: "user",
            content: `Escribe la página wiki para el concepto "${item.title}" (slug: ${slug}) basándote en el documento fuente.`,
          },
        ],
        tools,
        model: "flash",
        maxSteps: 15,
        onStepFinish: (event: any) => {
          const summary = summarizeStep(event);
          stepLogger(summary);
          if (debugEnabled) {
            debugLog(`[INGEST] Writer step for "${slug}"`, summary);
          }
        },
      });

      const toolCalls = result.steps.flatMap((s) => s.toolCalls || []);
      const written = toolCalls.filter(
        (tc) =>
          tc.toolName === "add_wiki_page" || tc.toolName === "edit_wiki_page",
      );
      const warnCount = toolCalls.filter(
        (tc) => tc.toolName === "report_warning",
      ).length;
      const action = written.length > 0 ? (written[0] as any).input?.action ?? item.action : "none";

      console.log(
        `[INGEST] Writer complete for "${slug}": action=${action}, warnings=${warnCount}`,
      );

      return {
        slug,
        success: written.length > 0,
        action,
        warnings: warnCount,
      };
    } catch (error: any) {
      console.error(
        `[INGEST] Writer failed for "${slug}": ${error.message}`,
      );
      return {
        slug,
        success: false,
        action: "none",
        warnings: 0,
        error: error.message,
      };
    }
  });
}

// ── Meta Node (Aggregator) ──────────────────────────────────────────────

function createMetaNode(
  db: Database.Database,
  rawSourceId: number,
  session: TraceSession,
): WorkflowNode<
  ParallelAggregatorInput<PageResult, EnrichedPlanItem, EnrichedIngestPlan>,
  IngestResult
> {
  const stepLogger = createStepLogger(session, "aggregator");

  return node(async (input): Promise<IngestResult> => {
    const debugEnabled = isDebugEnabled();
    const plan = input.input;

    // Compute total from successful writers
    const successResults = input.results.filter((r) => r.success);
    const totalErrors = input.errors.length + input.results.filter((r) => !r.success).length;
    const pagesWritten = successResults.length;
    const writerWarnings = successResults.reduce(
      (sum, r) => sum + r.warnings,
      0,
    );

    // Build list of written slugs
    const pagesWrittenList = successResults
      .map((r) => `- ${r.slug}: ${r.action}`)
      .join("\n");

    // If there are no meta updates to do, return early
    const hasInlineMentions =
      plan.inlineMentions && plan.inlineMentions.length > 0;
    const hasInboundUpdates =
      plan.inboundLinkUpdates && plan.inboundLinkUpdates.length > 0;
    const hasTagUpdates =
      plan.tagLandscapeUpdates &&
      plan.tagLandscapeUpdates.targetSlugUpdates &&
      plan.tagLandscapeUpdates.targetSlugUpdates.length > 0;
    const hasWarnings = plan.warnings && plan.warnings.length > 0;

    if (
      !hasInlineMentions &&
      !hasInboundUpdates &&
      !hasTagUpdates &&
      !hasWarnings
    ) {
      debugLog(`[INGEST] No meta updates needed for raw-${rawSourceId}`);
      return {
        pagesWritten,
        warnings: writerWarnings + plan.warnings.length,
        partial: totalErrors > 0,
      };
    }

    const schema = loadSchema();

    const aggregatorPrompt = interpolatePrompt(
      loadPromptTemplate("ingest-aggregator.md"),
      {
        RAW_ID: rawSourceId.toString(),
        L1_SCHEMA: schema,
        pagesWritten: pagesWrittenList || "(none)",
        inlineMentions: JSON.stringify(plan.inlineMentions, null, 2),
        inboundLinkUpdates: JSON.stringify(plan.inboundLinkUpdates, null, 2),
        tagLandscapeUpdates: JSON.stringify(
          plan.tagLandscapeUpdates,
          null,
          2,
        ),
        warnings: JSON.stringify(plan.warnings, null, 2),
      },
    );

    const tools = createIngestTools(db, rawSourceId);

    debugLog(
      `[INGEST] Aggregator starting for raw-${rawSourceId}: ${plan.inlineMentions?.length ?? 0} mentions, ${plan.inboundLinkUpdates?.length ?? 0} link updates, ${plan.warnings?.length ?? 0} warnings`,
    );

    try {
      const result = await llmClient.generate({
        system: aggregatorPrompt,
        messages: [
          {
            role: "user",
            content: `Realiza las tareas de post-ingesta para el raw source ${rawSourceId}.`,
          },
        ],
        tools,
        model: "flash",
        maxSteps: 15,
        onStepFinish: (event: any) => {
          const summary = summarizeStep(event);
          stepLogger(summary);
          if (debugEnabled) {
            debugLog(
              `[INGEST] Aggregator step for raw-${rawSourceId}`,
              summary,
            );
          }
        },
      });

      const toolCalls = result.steps.flatMap((s) => s.toolCalls || []);
      const aggWarnings = toolCalls.filter(
        (tc) => tc.toolName === "report_warning",
      ).length;

      console.log(
        `[INGEST] Aggregator complete for raw-${rawSourceId}: ${aggWarnings} warnings reported`,
      );

      return {
        pagesWritten,
        warnings: writerWarnings + aggWarnings,
        partial: totalErrors > 0,
      };
    } catch (error: any) {
      console.error(
        `[INGEST] Aggregator failed for raw-${rawSourceId}: ${error.message}`,
      );
      return {
        pagesWritten,
        warnings: writerWarnings,
        partial: true,
      };
    }
  });
}

// ── Main entry point ────────────────────────────────────────────────────

export async function ingestRawSource(
  db: Database.Database,
  rawSourceId: number,
  rawContent: string,
): Promise<{ pagesWritten: number; warnings: number }> {
  const queries = new Queries(db);
  debugLog(
    `[INGEST] Pipeline starting for raw-${rawSourceId}: content length=${rawContent.length}`,
  );

  const rawSource = queries.getRawSourceById(rawSourceId);
  const rawTitle = rawSource?.title ?? `raw-${rawSourceId}`;
  const session = createTraceSession(rawSourceId, rawTitle);
  console.log(`[INGEST] Trace session for raw-${rawSourceId}: ${session.dir}`);

  const sharedVars = buildSharedVars(queries, rawSourceId, rawContent);

  debugLog(
    `[INGEST] Context loaded: pages=${queries.getAllWikiPages().length}`,
  );

  // ── Compose the workflow ──────────────────────────────────────────
  const workflow = chain(
    createPlannerNode(db, sharedVars, session),
    chain(
      createEnrichSiblingsNode(),
      parallel(
        createWriterNode(db, rawSourceId, rawContent, sharedVars, session),
        createMetaNode(db, rawSourceId, session),
        { maxParallel: 3 },
      ),
    ),
  );

  const ingestInput: IngestInput = { rawSourceId, rawContent };
  const result = await workflow.execute(ingestInput);

  console.log(
    `[INGEST] Pipeline complete for raw-${rawSourceId}: ${result.pagesWritten} pages written, ${result.warnings} warnings` +
      (result.partial ? " (partial)" : ""),
  );

  return {
    pagesWritten: result.pagesWritten,
    warnings: result.warnings,
  };
}
