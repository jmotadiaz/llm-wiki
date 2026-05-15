import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { runTier1Lint } from "../services/lint-deterministic.js";
import Database from "better-sqlite3";
import { debugLog } from "../utils/debug.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

  // Run Tier 1 lint after ingest
  const lintIssues = runTier1Lint(db);

  // Log the ingest operation
  const logPath = path.join(__dirname, "../../..", "data", "log.md");
  const timestamp = new Date().toISOString();
  const logEntry = `- [${timestamp}] INGEST raw-${rawSourceId} OK Written ${pagesWritten} pages, ${lintIssues.length} lint issues\n`;
  fs.appendFileSync(logPath, logEntry);

  debugLog(`[INGEST] Post-ingest cleanup complete for raw-${rawSourceId}`);
}
