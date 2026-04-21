import { Router, Request, Response } from "express";
import { Queries } from "../../db/queries.js";
import { ReviewQueue } from "../../services/review-queue.js";
import Database from "better-sqlite3";

export function createCommentRoutes(
  db: Database.Database,
  reviewQueue: ReviewQueue,
): Router {
  const router = Router();
  const queries = new Queries(db);

  // GET /api/wiki/:slug/comments - Fetch all non-archived comments for a page
  router.get("/:slug/comments", (req: Request, res: Response) => {
    try {
      const slug = req.params.slug as string;
      const page = queries.getWikiPageBySlug(slug);

      if (!page) {
        res.status(404).json({ error: "Page not found" });
        return;
      }

      const comments = queries.getCommentsByPageId(page.id);

      res.json({
        success: true,
        comments: comments.map((c: any) => ({
          id: c.id,
          content: c.content,
          reply: c.reply,
          status: c.status,
          pages_edited: c.pages_edited ? JSON.parse(c.pages_edited) : [],
          error: c.error,
          created_at: c.created_at,
          answered_at: c.answered_at,
        })),
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/wiki/:slug/comments - Submit a new comment
  router.post("/:slug/comments", (req: Request, res: Response) => {
    try {
      const slug = req.params.slug as string;
      const { content } = req.body;

      // Validate content
      if (!content || typeof content !== "string" || content.trim().length === 0) {
        res.status(400).json({ error: "Comment content is required and must not be empty" });
        return;
      }

      // Resolve page_id from slug
      const page = queries.getWikiPageBySlug(slug);
      if (!page) {
        res.status(404).json({ error: "Page not found" });
        return;
      }

      // Insert comment
      const commentId = queries.insertComment(page.id, content.trim());

      // Enqueue review job
      reviewQueue.enqueue(commentId);

      // Return 201 with comment record
      const comment = {
        id: commentId,
        page_id: page.id,
        content: content.trim(),
        reply: null,
        status: "pending",
        pages_edited: [],
        error: null,
        created_at: new Date().toISOString(),
        answered_at: null,
      };

      res.status(201).json({
        success: true,
        comment,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // PATCH /api/wiki/:slug/comments/:id - Archive a comment
  router.patch("/:slug/comments/:id", (req: Request, res: Response) => {
    try {
      const commentId = parseInt(req.params.id as string, 10);
      const { action } = req.body;

      if (action !== "archive") {
        res.status(400).json({ error: "Invalid action. Only 'archive' is supported." });
        return;
      }

      // Fetch comment
      const stmt = db.prepare("SELECT * FROM page_comments WHERE id = ?");
      const comment = stmt.get(commentId) as any;

      if (!comment) {
        res.status(404).json({ error: "Comment not found" });
        return;
      }

      // Validate status
      if (comment.status !== "answered" && comment.status !== "failed") {
        res.status(400).json({
          error: `Cannot archive comment in "${comment.status}" status. Only "answered" or "failed" comments can be archived.`,
        });
        return;
      }

      // Archive the comment
      queries.archiveComment(commentId);

      // Return updated record
      const updatedStmt = db.prepare("SELECT * FROM page_comments WHERE id = ?");
      const updated = updatedStmt.get(commentId) as any;

      res.json({
        success: true,
        comment: {
          id: updated.id,
          content: updated.content,
          reply: updated.reply,
          status: updated.status,
          pages_edited: updated.pages_edited
            ? JSON.parse(updated.pages_edited)
            : [],
          error: updated.error,
          created_at: updated.created_at,
          answered_at: updated.answered_at,
        },
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
