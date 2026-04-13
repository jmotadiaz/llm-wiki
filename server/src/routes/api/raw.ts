import { Router, Request, Response } from 'express';
import { Queries } from '../../db/queries.js';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createRawRoutes(db: Database.Database): Router {
  const router = Router();
  const queries = new Queries(db);
  const rawDir = path.join(__dirname, '../../..', 'data', 'raw');

  // GET /api/raw - List all raw sources (metadata only)
  router.get('/', (req: Request, res: Response) => {
    try {
      const allSources = queries.getAllRawSources();
      res.json({
        success: true,
        sources: allSources.map(s => ({
          id: s.id,
          title: s.title,
          author: s.author,
          source_url: s.source_url,
          created_at: s.created_at,
          updated_at: s.updated_at,
          checksum: s.checksum
        }))
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // DELETE /api/raw/:id - Delete raw source and its associated file
  router.delete('/:id', (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id as string, 10);
      const source = queries.getRawSourceById(id);

      if (!source) {
        res.status(404).json({ error: 'Raw source not found' });
        return;
      }

      // 1. Delete associated files in data/raw
      if (fs.existsSync(rawDir)) {
        const files = fs.readdirSync(rawDir);
        const prefix = `${id}-`;
        for (const file of files) {
          if (file.startsWith(prefix)) {
            fs.unlinkSync(path.join(rawDir, file));
          }
        }
      }

      // 2. Delete from DB (cascading deletes handle page_sources)
      queries.deleteRawSource(id);

      res.json({
        success: true,
        message: `Raw source #${id} deleted successfully.`
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

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
