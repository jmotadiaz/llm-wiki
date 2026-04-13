import { Router, Request, Response } from "express";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { JinaReader } from "../services/jina.js";
import { Queries } from "../db/queries.js";
import { ingestRawSource } from "../llm/ingest.js";
import { postIngestCleanup } from "../llm/post-process.js";
import Database from "better-sqlite3";
import multer from "multer";
import { debugLog } from "../utils/debug.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();
const jina = new JinaReader();
const upload = multer({ storage: multer.memoryStorage() });

// Async ingest process (non-blocking)
async function triggerIngest(
  db: Database.Database,
  sourceId: number,
  content: string,
): Promise<void> {
  debugLog(`[INGEST] Pipeline triggered for raw-${sourceId}`);
  try {
    const { pagesWritten, warnings } = await ingestRawSource(
      db,
      sourceId,
      content,
    );
    await postIngestCleanup(db, sourceId, pagesWritten);
    debugLog(
      `[INGEST] Completed for raw-${sourceId}: ${pagesWritten} pages written, ${warnings} warnings`,
    );
  } catch (error: any) {
    console.error(
      `[INGEST ERROR] raw-${sourceId}:`,
      error.stack || error.message,
    );
    // Log error but don't fail the HTTP request
    const queries = new Queries(db);
    queries.insertLintWarning(
      null,
      "ingest_error",
      `Failed to process raw source: ${error.message}`,
      "error",
    );
  }
}

export function createIngestRoutes(db: Database.Database): Router {
  const queries = new Queries(db);
  const dataDir = path.join(__dirname, "../../..", "data");
  const rawDir = path.join(dataDir, "raw");

  // Ensure raw directory exists
  if (!fs.existsSync(rawDir)) {
    fs.mkdirSync(rawDir, { recursive: true });
  }

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

      // Trigger ingest pipeline asynchronously
      triggerIngest(db, sourceId, content).catch((err) => {
        console.error("Async ingest error:", err);
      });

      res.json({
        success: true,
        sourceId,
        filename,
        message: "Raw source saved. Ingest pipeline is processing...",
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

        // Trigger ingest pipeline asynchronously
        triggerIngest(db, sourceId, content).catch((err) => {
          console.error("Async ingest error:", err);
        });

        res.json({
          success: true,
          sourceId,
          filename,
          message: "Raw source uploaded. Ingest pipeline is processing...",
        });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    },
  );

  return router;
}
