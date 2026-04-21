import Database from "better-sqlite3";
import { reviewComment } from "../llm/review.js";
import { Queries } from "../db/queries.js";
import { debugLog } from "../utils/debug.js";

type JobStatus = "pending" | "running" | "done" | "error";

export interface ReviewJob {
  jobId: string;
  commentId: number;
  status: JobStatus;
  enqueuedAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
}

const HISTORY_LIMIT = 20;

export class ReviewQueue {
  private queue: ReviewJob[] = [];
  private history: ReviewJob[] = [];
  private running = false;
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  enqueue(commentId: number): ReviewJob {
    const job: ReviewJob = {
      jobId: `review-${Date.now()}-${commentId}`,
      commentId,
      status: "pending",
      enqueuedAt: new Date(),
    };
    this.queue.push(job);
    debugLog(
      `[REVIEW-QUEUE] Enqueued comment-${commentId} as ${job.jobId} (queue size: ${this.queue.length})`,
    );
    this.drain();
    return job;
  }

  getStatus(): {
    running: ReviewJob | null;
    pending: ReviewJob[];
    history: ReviewJob[];
  } {
    const runningJob =
      this.queue.find((j) => j.status === "running") ?? null;
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
    debugLog(
      `[REVIEW-QUEUE] Processing ${next.jobId} (comment-${next.commentId})`,
    );

    this.processJob(next)
      .catch((err) => {
        console.error(
          `[REVIEW-QUEUE] Unhandled error in processJob for ${next.jobId}:`,
          err,
        );
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

  private async processJob(job: ReviewJob): Promise<void> {
    const queries = new Queries(this.db);

    try {
      // Set comment status to processing
      queries.updateCommentStatus(job.commentId, "processing");

      // Run the review agent
      await reviewComment(this.db, job.commentId);

      job.status = "done";
      job.completedAt = new Date();
      debugLog(`[REVIEW-QUEUE] Completed ${job.jobId}`);
    } catch (error: any) {
      job.status = "error";
      job.error = error.message;
      job.completedAt = new Date();
      console.error(
        `[REVIEW-QUEUE] Failed ${job.jobId}:`,
        error.stack || error.message,
      );
      queries.setCommentFailed(job.commentId, error.message);
    }
  }
}
