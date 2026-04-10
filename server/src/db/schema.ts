import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, '../../..', 'data', 'llm-wiki.db');

export function initializeDatabase(): Database.Database {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS raw_sources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      author TEXT,
      description TEXT,
      content TEXT NOT NULL,
      checksum TEXT NOT NULL UNIQUE,
      source_url TEXT,
      published_at TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Migration: Add columns to existing tables
  const tableInfo = db.prepare("PRAGMA table_info(raw_sources)").all() as any[];
  const hasDescription = tableInfo.some(col => col.name === 'description');
  const hasPublishedAt = tableInfo.some(col => col.name === 'published_at');

  if (!hasDescription) {
    db.exec('ALTER TABLE raw_sources ADD COLUMN description TEXT');
  }
  if (!hasPublishedAt) {
    db.exec('ALTER TABLE raw_sources ADD COLUMN published_at TEXT');
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS wiki_pages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      type TEXT DEFAULT 'concept',
      tags TEXT,
      status TEXT DEFAULT 'published',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS page_sources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      page_id INTEGER NOT NULL,
      source_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (page_id) REFERENCES wiki_pages(id) ON DELETE CASCADE,
      FOREIGN KEY (source_id) REFERENCES raw_sources(id) ON DELETE CASCADE,
      UNIQUE(page_id, source_id)
    );

    CREATE TABLE IF NOT EXISTS wiki_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_page_id INTEGER NOT NULL,
      to_page_slug TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (from_page_id) REFERENCES wiki_pages(id) ON DELETE CASCADE,
      UNIQUE(from_page_id, to_page_slug)
    );

    CREATE TABLE IF NOT EXISTS lint_warnings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      page_id INTEGER,
      type TEXT NOT NULL,
      message TEXT NOT NULL,
      severity TEXT DEFAULT 'warning',
      resolved BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (page_id) REFERENCES wiki_pages(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_raw_sources_checksum ON raw_sources(checksum);
    CREATE INDEX IF NOT EXISTS idx_wiki_pages_slug ON wiki_pages(slug);
    CREATE INDEX IF NOT EXISTS idx_wiki_links_from ON wiki_links(from_page_id);
    CREATE INDEX IF NOT EXISTS idx_lint_warnings_page ON lint_warnings(page_id);
  `);

  return db;
}

export function getDatabase(): Database.Database {
  return initializeDatabase();
}
