import { Router, Request, Response } from "express";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { JinaReader } from "../services/jina.js";
import { Queries } from "../db/queries.js";
import { IngestQueue } from "../services/ingest-queue.js";
import Database from "better-sqlite3";
import multer from "multer";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const jina = new JinaReader();
const upload = multer({ storage: multer.memoryStorage() });

export function createIngestRoutes(db: Database.Database): Router {
  const router = Router();
  const queries = new Queries(db);
  const ingestQueue = new IngestQueue(db);
  const dataDir = path.join(__dirname, "../../..", "data");
  const rawDir = path.join(dataDir, "raw");

  // Ensure raw directory exists
  if (!fs.existsSync(rawDir)) {
    fs.mkdirSync(rawDir, { recursive: true });
  }

  // GET /api/ingest/queue - Queue status
  router.get("/queue", (_req: Request, res: Response) => {
    res.json(ingestQueue.getStatus());
  });

  // POST /api/ingest/url - Extract URL to markdown and return preview
  router.post("/url", async (req: Request, res: Response) => {
    try {
      const { url, targetSelector } = req.body;

      if (!url) {
        res.status(400).json({ error: "URL is required" });
        return;
      }

      // Extract data from URL
      const data = await jina.extractUrl(url, { targetSelector });
      const { title, description, content, publishedTime, author } = data;

      // Return preview
      res.json({
        success: true,
        preview: {
          title,
          description,
          contentLength: content.length,
          preview: content.substring(0, 500),
          fullContent: content,
          publishedTime,
          author,
        },
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // POST /api/ingest/save - Save markdown to raw/ and insert into DB
  router.post("/save", async (req: Request, res: Response) => {
    try {
      const { title, author, content, description, publishedAt, sourceUrl } =
        req.body;

      if (!title || !content) {
        res.status(400).json({ error: "Title and content are required" });
        return;
      }

      // Calculate checksum for duplicate detection
      const checksum = crypto
        .createHash("sha256")
        .update(content)
        .digest("hex");

      // Check for duplicates
      const existing = queries.getRawSourceByChecksum(checksum);
      if (existing) {
        res.status(409).json({
          error: "Duplicate source detected",
          existingId: existing.id,
        });
        return;
      }

      // Insert into database
      const sourceId = queries.insertRawSource(
        title,
        author || null,
        content,
        checksum,
        sourceUrl || null,
        description || null,
        publishedAt || null,
      );

      // Write to filesystem
      const filename = `${sourceId}-${title.toLowerCase().replace(/\s+/g, "-").substring(0, 30)}.md`;
      const filepath = path.join(rawDir, filename);
      fs.writeFileSync(filepath, content);

      // Enqueue ingest pipeline (sequential, non-blocking)
      const job = ingestQueue.enqueue(sourceId);

      res.json({
        success: true,
        sourceId,
        filename,
        jobId: job.jobId,
        message: "Raw source saved. Ingest pipeline queued for processing.",
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/ingest/upload - Upload .md file with metadata
  router.post(
    "/upload",
    upload.single("file"),
    async (req: Request, res: Response) => {
      try {
        const { title, author } = req.body;
        const file = req.file;

        if (!file || !title) {
          res.status(400).json({ error: "File and title are required" });
          return;
        }

        const content = file.buffer.toString("utf-8");
        const checksum = crypto
          .createHash("sha256")
          .update(content)
          .digest("hex");

        // Check for duplicates
        const existing = queries.getRawSourceByChecksum(checksum);
        if (existing) {
          res.status(409).json({
            error: "Duplicate source detected",
            existingId: existing.id,
          });
          return;
        }

        // Insert into database
        const sourceId = queries.insertRawSource(
          title,
          author || null,
          content,
          checksum,
          null,
          null,
          null,
        );

        // Write to filesystem
        const filename = `${sourceId}-${title.toLowerCase().replace(/\s+/g, "-").substring(0, 30)}.md`;
        const filepath = path.join(rawDir, filename);
        fs.writeFileSync(filepath, content);

        // Enqueue ingest pipeline (sequential, non-blocking)
        const job = ingestQueue.enqueue(sourceId);

        res.json({
          success: true,
          sourceId,
          filename,
          jobId: job.jobId,
          message: "Raw source uploaded. Ingest pipeline queued for processing.",
        });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    },
  );

  return router;
}
