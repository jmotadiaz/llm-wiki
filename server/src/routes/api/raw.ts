import { Router, Request, Response } from 'express';
import { Queries } from '../../db/queries.js';
import Database from 'better-sqlite3';

export function createRawRoutes(db: Database.Database): Router {
  const router = Router();
  const queries = new Queries(db);

  // 8.3 GET /api/raw/:id - Return raw source content + metadata
  router.get('/:id', (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const sourceId = parseInt(id, 10);

      const allSources = queries.getAllRawSources();
      const source = allSources.find(s => s.id === sourceId);

      if (!source) {
        res.status(404).json({ error: 'Raw source not found' });
        return;
      }

      res.json({
        success: true,
        source: {
          id: source.id,
          title: source.title,
          author: source.author,
          content: source.content,
          source_url: source.source_url,
          checksum: source.checksum,
          created_at: source.created_at,
          updated_at: source.updated_at,
        },
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
