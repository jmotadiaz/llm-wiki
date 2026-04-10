import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Queries } from '../db/queries.js';
import { runTier1Lint } from '../services/lint-deterministic.js';
import Database from 'better-sqlite3';
import { IngestResult } from './ingest.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface PageLinkMatch {
  slug: string;
  position: number;
}

function extractWikiLinks(content: string): string[] {
  const linkRegex = /\[\[([^\]]+)\]\]/g;
  const links: string[] = [];
  let match;

  while ((match = linkRegex.exec(content)) !== null) {
    links.push(match[1]);
  }

  return links;
}

function ensureWikiDirectory(): string {
  const wikiDir = path.join(__dirname, '../../..', 'data', 'wiki');
  if (!fs.existsSync(wikiDir)) {
    fs.mkdirSync(wikiDir, { recursive: true });
  }
  return wikiDir;
}

function updateIndex(db: Database.Database, entries: any[]): void {
  const indexPath = path.join(__dirname, '../../..', 'data', 'index.md');
  let indexContent = fs.readFileSync(indexPath, 'utf-8');

  // Find the "## Pages" section and insert/update entries
  const pagesSectionIndex = indexContent.indexOf('## Pages');
  if (pagesSectionIndex === -1) {
    // Section doesn't exist, add it
    indexContent += '\n\n## Pages\n\n';
  }

  // Build new entries list
  const entryLines = entries.map(entry => {
    const tags = entry.tags.join(', ');
    return `- \`${entry.slug}\`: ${entry.title} | ${entry.summary} | tags: ${tags}`;
  });

  // Simple approach: replace the Pages section
  const newIndexContent = indexContent.split('\n\n## Pages')[0] +
    '\n\n## Pages\n\n' +
    entryLines.join('\n');

  fs.writeFileSync(indexPath, newIndexContent);
}

export async function postProcessIngest(
  db: Database.Database,
  rawSourceId: number,
  ingestResult: IngestResult
): Promise<void> {
  const queries = new Queries(db);
  const wikiDir = ensureWikiDirectory();

  console.log(`[INGEST] Post-process starting for raw-${rawSourceId}: pages=${ingestResult.pages.length}`);

  // Process each page
  for (const page of ingestResult.pages) {
    // Check if page already exists
    const existingPage = queries.getWikiPageBySlug(page.slug);

    let pageId: number;
    if (existingPage) {
      // Update existing page
      console.log(`[INGEST] Updating existing page: ${page.slug}`);
      queries.updateWikiPage(
        existingPage.id,
        page.title,
        page.content,
        page.tags.join(','),
        page.status
      );
      pageId = existingPage.id;
    } else {
      // Create new page
      console.log(`[INGEST] Creating new page: ${page.slug}`);
      pageId = queries.insertWikiPage(
        page.slug,
        page.title,
        page.content,
        page.type,
        page.tags.join(','),
        page.status
      );
    }

    // Write page to filesystem
    const filename = `${page.slug}.md`;
    const filepath = path.join(wikiDir, filename);
    fs.writeFileSync(filepath, page.content);

    // Link raw source to page
    queries.insertPageSource(pageId, rawSourceId);

    // Extract and index wiki links
    const wikiLinks = extractWikiLinks(page.content);
    for (const linkSlug of wikiLinks) {
      queries.insertWikiLink(pageId, linkSlug);
    }
  }

  // Update index.md with new entries
  if (ingestResult.index_entries.length > 0) {
    updateIndex(db, ingestResult.index_entries);
  }

  // Store warnings in database
  for (const warning of ingestResult.warnings) {
    queries.insertLintWarning(null, warning.type, warning.message, 'warning');
  }

  // Run Tier 1 lint after ingest
  const lintIssues = runTier1Lint(db);

  // Log the ingest operation
  const logPath = path.join(__dirname, '../../..', 'data', 'log.md');
  const logEntry = `- [${new Date().toISOString()}] INGEST raw-${rawSourceId} OK Created/updated ${ingestResult.pages.length} pages, ${lintIssues.length} lint issues\n`;
  fs.appendFileSync(logPath, logEntry);

  console.log(`[INGEST] Post-process complete for raw-${rawSourceId}`);
}
