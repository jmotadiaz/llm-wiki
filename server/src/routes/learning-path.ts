import { Router, Request, Response } from "express";
import Database from "better-sqlite3";
import {
  runLearningPathAgent,
  type LearningPathMode,
} from "../llm/learning-path.js";

const VALID_MODES: LearningPathMode[] = ["regenerate-all", "review"];

export function createLearningPathRoutes(db: Database.Database): Router {
  const router = Router();

  router.post("/generate", async (req: Request, res: Response) => {
    try {
      const rawMode =
        typeof req.body?.mode === "string" ? req.body.mode : "review";

      if (!VALID_MODES.includes(rawMode as LearningPathMode)) {
        return res.status(400).json({
          error: `Invalid mode "${rawMode}". Expected one of: ${VALID_MODES.join(", ")}`,
        });
      }

      const summary = await runLearningPathAgent(db, {
        mode: rawMode as LearningPathMode,
      });

      res.json({
        success: true,
        mode: summary.mode,
        pagesWritten: summary.pagesWritten,
        pagesDeleted: summary.pagesDeleted,
        partial: summary.partial,
      });
    } catch (error: any) {
      console.error(
        `[LP] /api/learning-paths/generate failed: ${error.message}`,
      );
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
