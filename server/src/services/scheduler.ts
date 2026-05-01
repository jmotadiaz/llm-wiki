import cron from 'node-cron';
import Database from 'better-sqlite3';
import { runTier1Lint } from './lint-deterministic.js';
import { runTier3Audit } from '../llm/lint.js';
import { runIndexAgent } from '../llm/index.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function initScheduler(db: Database.Database) {
  // Nightly at 2 AM: '0 2 * * *'
  // For verification purposes, we might want to change this temporarily.
  const lintSchedule = process.env.NODE_ENV === 'test' ? '* * * * *' : '0 2 * * *';
  // Index agent runs at 4 AM to avoid overlap with Tier 3 audit
  const indexSchedule = process.env.NODE_ENV === 'test' ? '* * * * *' : '0 4 * * *';
  const logPath = path.join(__dirname, '../../..', 'data', 'log.md');

  cron.schedule(lintSchedule, async () => {
    const timestamp = new Date().toISOString();

    console.log(`[SCHEDULER] Starting nightly audit at ${timestamp}`);

    try {
      // Tier 1 deterministic lint
      const t1Issues = runTier1Lint(db);

      // Tier 3 semantic audit (LLM)
      const t3Findings = await runTier3Audit(db);

      const logEntry = `- [${new Date().toISOString()}] LINT-CRON OK Tier1 issues: ${t1Issues.length}, Tier3 findings: ${t3Findings.length}\n`;
      fs.appendFileSync(logPath, logEntry);

      console.log(`[SCHEDULER] Nightly audit complete. T1: ${t1Issues.length}, T3: ${t3Findings.length}`);
    } catch (error: any) {
      const errorEntry = `- [${new Date().toISOString()}] LINT-CRON ERROR ${error.message}\n`;
      fs.appendFileSync(logPath, errorEntry);
      console.error(`[SCHEDULER] Nightly audit failed:`, error);
    }
  });

  cron.schedule(indexSchedule, async () => {
    const timestamp = new Date().toISOString();

    console.log(`[SCHEDULER] Starting nightly index agent at ${timestamp}`);

    try {
      const summary = await runIndexAgent(db, { mode: "review", category: "both" });
      const logEntry = `- [${new Date().toISOString()}] INDEX-CRON OK mode=${summary.mode}, categories: ${summary.categoriesProcessed.length}, pages written: ${summary.pagesWritten.length}, deleted: ${summary.pagesDeleted.length}\n`;
      fs.appendFileSync(logPath, logEntry);

      console.log(`[SCHEDULER] Index agent complete. Categories: ${summary.categoriesProcessed.length}, pages: ${summary.pagesWritten.length}`);
    } catch (error: any) {
      const errorEntry = `- [${new Date().toISOString()}] INDEX-CRON ERROR ${error.message}\n`;
      fs.appendFileSync(logPath, errorEntry);
      console.error(`[SCHEDULER] Index agent failed:`, error);
    }
  });

  console.log(`[SCHEDULER] Initialized: Tier 3 audit (${lintSchedule}), index agent (${indexSchedule})`);
}
