import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import Database from "better-sqlite3";
import { llmClient } from "./client.js";
import { createIndexTools, IndexAgentResult } from "./index-tools.js";
import {
  DomainCluster,
  PageMeta,
  assignLearningStages,
  discoverDomains,
  domainSlug,
  loadPageMeta,
} from "./domain-discovery.js";
import { debugLog, isDebugEnabled } from "../utils/debug.js";
import { deepseek } from "@ai-sdk/deepseek";

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

function interpolate(template: string, vars: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replaceAll(`{${key}}`, () => value);
  }
  return result;
}

function formatPageBullet(page: PageMeta): string {
  const summary = page.summary ? ` — ${page.summary}` : "";
  const tags = page.tags.length > 0 ? ` | tags: ${page.tags.join(", ")}` : "";
  return `- /wiki/${page.slug} (type: ${page.type}, inbound: ${page.inboundLinks})${tags}${summary ? "\n    " + summary.trim() : ""}`;
}

function formatPageList(pages: PageMeta[]): string {
  if (pages.length === 0) return "(ninguna)";
  return pages.map(formatPageBullet).join("\n");
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

async function generateDomainIndex(
  db: Database.Database,
  cluster: DomainCluster,
  domainName: string,
): Promise<string | null> {
  const debugEnabled = isDebugEnabled();
  const kebab = domainSlug(cluster.tag);
  const targetSlug = `domain-index-${kebab}`;

  const relatedPages = cluster.relatedSlugs
    .map((slug) => {
      const p = loadPageMeta(db).find((page) => page.slug === slug);
      return p ? formatPageBullet(p) : null;
    })
    .filter(Boolean)
    .join("\n");

  const vars: Record<string, string> = {
    DOMAIN_NAME: domainName,
    DOMAIN_KEBAB: kebab,
    TARGET_SLUG: targetSlug,
    DOMAIN_PAGES: formatPageList(cluster.pages),
    RELATED_PAGES: relatedPages || "(ninguna)",
    L1_SCHEMA: loadSchema(),
  };

  const systemPrompt = interpolate(loadPromptTemplate("index-domain.md"), vars);

  const result: IndexAgentResult = { writtenSlugs: [] };
  const tools = createIndexTools(db, "domain-index", targetSlug, result);

  debugLog(`[INDEX] Domain-index agent starting for ${targetSlug}`);

  try {
    await llmClient.generate({
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: `Genera el domain-index para el dominio "${domainName}" (slug objetivo: ${targetSlug}). Llama a add_wiki_page una vez con el markdown final.`,
        },
      ],
      tools,
      model: deepseek("deepseek-v4-pro"),
      maxSteps: 8,
      temperature: 0.4,
      onStepFinish: debugEnabled
        ? (event: any) =>
            debugLog(
              `[INDEX] Domain-index step for ${targetSlug}`,
              summarizeStep(event),
            )
        : undefined,
    });
  } catch (error: any) {
    console.error(
      `[INDEX] Domain-index agent failed for ${targetSlug}: ${error.message}`,
    );
    return null;
  }

  if (result.writtenSlugs.length === 0) {
    console.warn(`[INDEX] Domain-index agent did not write ${targetSlug}`);
    return null;
  }

  return targetSlug;
}

async function generateLearningPath(
  db: Database.Database,
  cluster: DomainCluster,
  domainName: string,
): Promise<string | null> {
  const debugEnabled = isDebugEnabled();
  const kebab = domainSlug(cluster.tag);
  const targetSlug = `learning-path-${kebab}`;

  const { fundamentals, intermediate, advanced } = assignLearningStages(
    cluster.pages,
  );

  const prereqCandidates = cluster.relatedSlugs
    .map((slug) => {
      const p = loadPageMeta(db).find((page) => page.slug === slug);
      return p ? formatPageBullet(p) : null;
    })
    .filter(Boolean)
    .join("\n");

  const vars: Record<string, string> = {
    DOMAIN_NAME: domainName,
    DOMAIN_KEBAB: kebab,
    TARGET_SLUG: targetSlug,
    STAGE_FUNDAMENTALS: formatPageList(fundamentals),
    STAGE_INTERMEDIATE: formatPageList(intermediate),
    STAGE_ADVANCED: formatPageList(advanced),
    PREREQ_CANDIDATES: prereqCandidates || "(ninguna)",
    L1_SCHEMA: loadSchema(),
  };

  const systemPrompt = interpolate(
    loadPromptTemplate("index-learning-path.md"),
    vars,
  );

  const result: IndexAgentResult = { writtenSlugs: [] };
  const tools = createIndexTools(db, "learning-path", targetSlug, result);

  debugLog(`[INDEX] Learning-path agent starting for ${targetSlug}`);

  try {
    await llmClient.generate({
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: `Genera el learning-path para el dominio "${domainName}" (slug objetivo: ${targetSlug}). Llama a add_wiki_page una vez con el markdown final.`,
        },
      ],
      tools,
      model: deepseek("deepseek-reasoner"),
      maxSteps: 8,
      temperature: 0.4,
      onStepFinish: debugEnabled
        ? (event: any) =>
            debugLog(
              `[INDEX] Learning-path step for ${targetSlug}`,
              summarizeStep(event),
            )
        : undefined,
    });
  } catch (error: any) {
    console.error(
      `[INDEX] Learning-path agent failed for ${targetSlug}: ${error.message}`,
    );
    return null;
  }

  if (result.writtenSlugs.length === 0) {
    console.warn(`[INDEX] Learning-path agent did not write ${targetSlug}`);
    return null;
  }

  return targetSlug;
}

export interface IndexRunSummary {
  domainsProcessed: string[];
  pagesWritten: string[];
  skipped: string[];
}

export async function runIndexAgent(
  db: Database.Database,
  opts: { domain?: string } = {},
): Promise<IndexRunSummary> {
  const pages = loadPageMeta(db);
  const allClusters = discoverDomains(pages);

  let targetClusters: DomainCluster[];
  if (opts.domain) {
    const wanted = opts.domain.toLowerCase();
    targetClusters = allClusters.filter(
      (c) => domainSlug(c.tag) === wanted || c.tag === wanted,
    );
    if (targetClusters.length === 0) {
      console.warn(
        `[INDEX] No cluster matches requested domain "${opts.domain}"`,
      );
      return {
        domainsProcessed: [],
        pagesWritten: [],
        skipped: [opts.domain],
      };
    }
  } else {
    targetClusters = allClusters;
  }

  const summary: IndexRunSummary = {
    domainsProcessed: [],
    pagesWritten: [],
    skipped: [],
  };

  for (const cluster of targetClusters) {
    const kebab = domainSlug(cluster.tag);
    const domainName = cluster.tag
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");

    console.log(
      `[INDEX] Generating pages for domain "${domainName}" (${cluster.pages.length} pages)`,
    );

    const domainIndexSlug = await generateDomainIndex(db, cluster, domainName);
    if (domainIndexSlug) summary.pagesWritten.push(domainIndexSlug);
    else summary.skipped.push(`domain-index-${kebab}`);

    const learningPathSlug = await generateLearningPath(
      db,
      cluster,
      domainName,
    );
    if (learningPathSlug) summary.pagesWritten.push(learningPathSlug);
    else summary.skipped.push(`learning-path-${kebab}`);

    summary.domainsProcessed.push(kebab);
  }

  console.log(
    `[INDEX] Run complete: ${summary.pagesWritten.length} pages written across ${summary.domainsProcessed.length} domain(s)`,
  );

  return summary;
}
