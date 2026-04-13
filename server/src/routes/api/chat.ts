import { Router, Request, Response } from "express";
import { streamChat } from "../../llm/query.js";
import Database from "better-sqlite3";
import { convertToModelMessages } from "ai";

/**
 * Creates the chat routes.
 * @param db The SQLite database instance.
 */
export function createChatRoutes(db: Database.Database): Router {
  const router = Router();

  /**
   * POST /api/chat
   * Standard chat endpoint for Vercel AI SDK useChat hook.
   */
  router.post("/", async (req: Request, res: Response) => {
    try {
      const { messages } = req.body;

      if (!messages || !Array.isArray(messages)) {
        res.status(400).json({ error: "Messages array is required" });
        return;
      }

      // Vercel AI SDK UI payload 'messages' uses 'parts'.
      // We must convert it to ModelMessage[] format for validation.
      const modelMessages = await convertToModelMessages(messages);

      // Initiates the agent loop and streaming
      const result = await streamChat(db, modelMessages);

      // Pipes the stream directly to the Express response
      // This handles necessary headers (SSE) and data formatting in the Vercel AI Data Stream Protocol
      result.pipeUIMessageStreamToResponse(res);
    } catch (error: any) {
      console.error("Chat route error:", error);

      // If we haven't started streaming yet, send a JSON error
      if (!res.headersSent) {
        res.status(500).json({ error: error.message });
      } else {
        // If streaming already started, just end it
        res.end();
      }
    }
  });

  return router;
}
