import { Router, Request, Response } from "express";
import Database from "better-sqlite3";
import { runIndexAgent, IndexCategory, IndexMode } from "../llm/index.js";

const VALID_MODES: IndexMode[] = ["regenerate-all", "review"];
const VALID_CATEGORIES: Array<IndexCategory | "both"> = [
  "domain-index",
  "learning-path",
  "both",
];

export function createIndexAgentRoutes(db: Database.Database): Router {
  const router = Router();

  router.post("/generate", async (req: Request, res: Response) => {
    try {
      const rawMode = typeof req.body?.mode === "string" ? req.body.mode : "review";
      const rawCategory =
        typeof req.body?.category === "string" ? req.body.category : "both";

      if (!VALID_MODES.includes(rawMode as IndexMode)) {
        return res
          .status(400)
          .json({ error: `Invalid mode "${rawMode}". Expected one of: ${VALID_MODES.join(", ")}` });
      }
      if (!VALID_CATEGORIES.includes(rawCategory as IndexCategory | "both")) {
        return res.status(400).json({
          error: `Invalid category "${rawCategory}". Expected one of: ${VALID_CATEGORIES.join(", ")}`,
        });
      }

      const summary = await runIndexAgent(db, {
        mode: rawMode as IndexMode,
        category: rawCategory as IndexCategory | "both",
      });

      res.json({
        success: true,
        mode: summary.mode,
        categoriesProcessed: summary.categoriesProcessed,
        pagesWritten: summary.pagesWritten,
        pagesDeleted: summary.pagesDeleted,
      });
    } catch (error: any) {
      console.error(`[INDEX] /api/index/generate failed: ${error.message}`);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
