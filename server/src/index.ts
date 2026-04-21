import "./utils/load-env.js";
import path from "path";
import express, { Express, Request, Response, NextFunction } from "express";
import fs from "fs";
import { fileURLToPath } from "url";
import { getDatabase } from "./db/schema.js";
import { createIngestRoutes } from "./routes/ingest.js";
import { createWikiRoutes } from "./routes/api/wiki.js";
import { createRawRoutes } from "./routes/api/raw.js";
import { createChatRoutes } from "./routes/api/chat.js";
import { createCommentRoutes } from "./routes/api/comments.js";
import { initScheduler } from "./services/scheduler.js";
import { ReviewQueue } from "./services/review-queue.js";
import { Queries } from "./db/queries.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function ensureDataDirectory() {
  const dataDir = path.join(__dirname, "../../data");
  const dirs = [dataDir, path.join(dataDir, "raw"), path.join(dataDir, "wiki")];

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      console.log(`[INIT] Creating directory: ${dir}`);
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  const files = [
    {
      path: path.join(dataDir, "index.md"),
      content:
        "This is the master index of all wiki pages. Pages are listed with their slug, title, summary, and tags.\n\n## Format\n\n```\n- `slug`: Page title | tags: tag1, tag2 | summary: Short summary text\n```\n\n## Pages\n",
    },
    {
      path: path.join(dataDir, "log.md"),
      content:
        "# Operations Log\n\nRecords of all system operations including ingests, lints, and errors.\n\n## Format\n\n- `[TIMESTAMP]` `[OPERATION]` `[STATUS]` Details\n\n## Entries\n\n(Logged operations appear here in reverse chronological order)\n",
    },
    {
      path: path.join(dataDir, "lint-queue.json"),
      content: "[]",
    },
  ];

  for (const file of files) {
    if (!fs.existsSync(file.path)) {
      console.log(`[INIT] Creating file: ${file.path}`);
      fs.writeFileSync(file.path, file.content);
    }
  }
}

// Ensure data existence before anything else
ensureDataDirectory();

const app: Express = express();
const PORT = process.env.PORT || 3005;

// Initialize database
const db = getDatabase();

// Initialize review queue and re-enqueue pending comments
const reviewQueue = new ReviewQueue(db);
const queries = new Queries(db);
const pendingComments = db.prepare("SELECT id FROM page_comments WHERE status = 'pending'").all() as any[];
for (const comment of pendingComments) {
  reviewQueue.enqueue(comment.id);
}

// Initialize scheduler
initScheduler(db);

// Middleware
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// API routes
app.use("/api/ingest", createIngestRoutes(db));
app.use("/api/wiki", createWikiRoutes(db));
app.use("/api/wiki", createCommentRoutes(db, reviewQueue));
app.use("/api/raw", createRawRoutes(db));
app.use("/api/chat", createChatRoutes(db));

// Fallback API route
app.use("/api", (req: Request, res: Response) => {
  res.status(404).json({ error: "API endpoint not found" });
});

// Serve client build
const clientDistPath = path.join(__dirname, "../../client/dist");
app.use(express.static(clientDistPath));

// SPA fallback - route all unmatched requests to index.html
app.get("{*splat}", (req: Request, res: Response) => {
  res.sendFile(path.join(clientDistPath, "index.html"));
});

// Error handling (Express 5 requires all 4 params)
app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
