import { Router, Request, Response } from "express";
import Database from "better-sqlite3";
import { runIndexAgent } from "../llm/index.js";

export function createIndexAgentRoutes(db: Database.Database): Router {
  const router = Router();

  router.post("/generate", async (req: Request, res: Response) => {
    try {
      const domain = typeof req.body?.domain === "string" ? req.body.domain.trim() : undefined;
      const summary = await runIndexAgent(db, { domain: domain || undefined });

      res.json({
        success: true,
        domain: domain || null,
        domainsProcessed: summary.domainsProcessed,
        pagesWritten: summary.pagesWritten,
        skipped: summary.skipped,
      });
    } catch (error: any) {
      console.error(`[INDEX] /api/index/generate failed: ${error.message}`);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
