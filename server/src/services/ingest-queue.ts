import Database from "better-sqlite3";
import { ingestRawSource } from "../llm/ingest.js";
import { postIngestCleanup } from "../llm/post-process.js";
import { Queries } from "../db/queries.js";
import { debugLog } from "../utils/debug.js";

type JobStatus = "pending" | "running" | "done" | "error";

export interface IngestJob {
  jobId: string;
  sourceId: number;
  status: JobStatus;
  enqueuedAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  pagesWritten?: number;
  warnings?: number;
  error?: string;
}

const HISTORY_LIMIT = 20;

export class IngestQueue {
  private queue: IngestJob[] = [];
  private history: IngestJob[] = [];
  private running = false;
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  enqueue(sourceId: number): IngestJob {
    const job: IngestJob = {
      jobId: `job-${Date.now()}-${sourceId}`,
      sourceId,
      status: "pending",
      enqueuedAt: new Date(),
    };
    this.queue.push(job);
    debugLog(`[QUEUE] Enqueued raw-${sourceId} as ${job.jobId} (queue size: ${this.queue.length})`);
    this.drain();
    return job;
  }

  getStatus(): { running: IngestJob | null; pending: IngestJob[]; history: IngestJob[] } {
    const runningJob = this.queue.find((j) => j.status === "running") ?? null;
    const pending = this.queue.filter((j) => j.status === "pending");
    return { running: runningJob, pending, history: this.history };
  }

  private drain(): void {
    if (this.running) return;
    const next = this.queue.find((j) => j.status === "pending");
    if (!next) return;

    this.running = true;
    next.status = "running";
    next.startedAt = new Date();
    debugLog(`[QUEUE] Processing ${next.jobId} (raw-${next.sourceId})`);

    this.processJob(next)
      .catch((err) => {
        console.error(`[QUEUE] Unhandled error in processJob for ${next.jobId}:`, err);
      })
      .finally(() => {
        this.queue = this.queue.filter((j) => j.jobId !== next.jobId);
        this.history.unshift(next);
        if (this.history.length > HISTORY_LIMIT) {
          this.history.length = HISTORY_LIMIT;
        }
        this.running = false;
        this.drain();
      });
  }

  private async processJob(job: IngestJob): Promise<void> {
    const queries = new Queries(this.db);
    const source = queries.getRawSourceById(job.sourceId);
    if (!source) {
      job.status = "error";
      job.error = `Raw source ${job.sourceId} not found in DB`;
      job.completedAt = new Date();
      console.error(`[QUEUE] ${job.error}`);
      return;
    }

    try {
      const { pagesWritten, warnings } = await ingestRawSource(
        this.db,
        job.sourceId,
        source.content,
      );
      await postIngestCleanup(this.db, job.sourceId, pagesWritten);
      job.status = "done";
      job.pagesWritten = pagesWritten;
      job.warnings = warnings;
      job.completedAt = new Date();
      debugLog(
        `[QUEUE] Completed ${job.jobId}: ${pagesWritten} pages written, ${warnings} warnings`,
      );
    } catch (error: any) {
      job.status = "error";
      job.error = error.message;
      job.completedAt = new Date();
      console.error(`[QUEUE] Failed ${job.jobId}:`, error.stack || error.message);
      queries.insertLintWarning(
        null,
        "ingest_error",
        `Failed to process raw source ${job.sourceId}: ${error.message}`,
        "error",
      );
    }
  }
}
