import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Queries } from "../db/queries.js";
import { runTier1Lint } from "../services/lint-deterministic.js";
import Database from "better-sqlite3";
import { debugLog } from "../utils/debug.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Regenerates the master index.md from all pages in the database.
 * This ensures the index is always consistent with the actual wiki state.
 */
function regenerateIndex(db: Database.Database): void {
  const queries = new Queries(db);
  const pages = queries.getAllWikiPages();
  const inboundCounts = queries.getInboundLinkCounts();
  const indexPath = path.join(__dirname, "../../..", "data", "index.md");

  const header = `# Wiki Index

This is the master index of all wiki pages. Each entry lists the slug, title, page type, inbound link count, tags, and summary.

## Format

\`\`\`
- \`slug\` (type, inbound: N): Page title | tags: tag1, tag2 | summary: Short summary text
\`\`\`

## Pages

`;

  const entries = pages
    .map((page) => {
      const tags = page.tags || "untagged";
      const summary = page.summary ? ` | summary: ${page.summary}` : "";
      const inbound = inboundCounts.get(page.slug) ?? 0;
      return `- \`${page.slug}\` (${page.type}, inbound: ${inbound}): ${page.title} | tags: ${tags}${summary}`;
    })
    .join("\n");

  fs.writeFileSync(indexPath, header + entries);
}

/**
 * Performs cleanup tasks after an ingestion agent finish.
 * This includes index regeneration, linting, and logging.
 */
export async function postIngestCleanup(
  db: Database.Database,
  rawSourceId: number,
  pagesWritten: number,
): Promise<void> {
  debugLog(
    `[INGEST] Post-ingest cleanup starting for raw-${rawSourceId}: pagesWritten=${pagesWritten}`,
  );

  // Regenerate index.md from database
  regenerateIndex(db);

  // Run Tier 1 lint after ingest
  const lintIssues = runTier1Lint(db);

  // Log the ingest operation
  const logPath = path.join(__dirname, "../../..", "data", "log.md");
  const timestamp = new Date().toISOString();
  const logEntry = `- [${timestamp}] INGEST raw-${rawSourceId} OK Written ${pagesWritten} pages, ${lintIssues.length} lint issues\n`;
  fs.appendFileSync(logPath, logEntry);

  debugLog(`[INGEST] Post-ingest cleanup complete for raw-${rawSourceId}`);
}
