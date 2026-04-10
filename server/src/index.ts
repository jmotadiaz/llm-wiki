import express, { Express, Request, Response, NextFunction } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDatabase } from './db/schema.js';
import { createIngestRoutes } from './routes/ingest.js';
import { createWikiRoutes } from './routes/api/wiki.js';
import { createRawRoutes } from './routes/api/raw.js';
import { createChatRoutes } from './routes/api/chat.js';
import { initScheduler } from './services/scheduler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app: Express = express();
const PORT = process.env.PORT || 3000;

// Initialize database
const db = getDatabase();

// Initialize scheduler
initScheduler(db);

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// API routes
app.use('/api/ingest', createIngestRoutes(db));
app.use('/api/wiki', createWikiRoutes(db));
app.use('/api/raw', createRawRoutes(db));
app.use('/api/chat', createChatRoutes(db));

// Fallback API route
app.use('/api', (req: Request, res: Response) => {
  res.status(404).json({ error: 'API endpoint not found' });
});

// Serve client build
const clientDistPath = path.join(__dirname, '../../client/dist');
app.use(express.static(clientDistPath));

// SPA fallback - route all unmatched requests to index.html
app.get('{*splat}', (req: Request, res: Response) => {
  res.sendFile(path.join(clientDistPath, 'index.html'));
});

// Error handling (Express 5 requires all 4 params)
app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
