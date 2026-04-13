import Database from "better-sqlite3";

export class Queries {
  constructor(private db: Database.Database) {}

  // Raw Sources
  getRawSourceByChecksum(checksum: string) {
    const stmt = this.db.prepare(
      "SELECT * FROM raw_sources WHERE checksum = ?",
    );
    return stmt.get(checksum) as any;
  }

  getRawSourceById(id: number) {
    const stmt = this.db.prepare("SELECT * FROM raw_sources WHERE id = ?");
    return stmt.get(id) as any;
  }

  getAllRawSources() {
    const stmt = this.db.prepare(
      "SELECT * FROM raw_sources ORDER BY created_at DESC",
    );
    return stmt.all() as any[];
  }

  insertRawSource(
    title: string,
    author: string | null,
    content: string,
    checksum: string,
    sourceUrl?: string | null,
    description?: string | null,
    publishedAt?: string | null,
  ) {
    const stmt = this.db.prepare(
      "INSERT INTO raw_sources (title, author, content, checksum, source_url, description, published_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    );
    const result = stmt.run(
      title,
      author,
      content,
      checksum,
      sourceUrl || null,
      description || null,
      publishedAt || null,
    );
    return result.lastInsertRowid as number;
  }

  deleteRawSource(id: number) {
    const stmt = this.db.prepare("DELETE FROM raw_sources WHERE id = ?");
    stmt.run(id);
  }

  // Wiki Pages
  getWikiPageBySlug(slug: string) {
    const stmt = this.db.prepare("SELECT * FROM wiki_pages WHERE slug = ?");
    return stmt.get(slug) as any;
  }

  getWikiPageById(id: number) {
    const stmt = this.db.prepare("SELECT * FROM wiki_pages WHERE id = ?");
    return stmt.get(id) as any;
  }

  getAllWikiPages() {
    const stmt = this.db.prepare(
      "SELECT * FROM wiki_pages ORDER BY updated_at DESC",
    );
    return stmt.all() as any[];
  }

  insertWikiPage(
    slug: string,
    title: string,
    content: string,
    type: string,
    tags?: string,
    status?: string,
  ) {
    const stmt = this.db.prepare(
      "INSERT INTO wiki_pages (slug, title, content, type, tags, status) VALUES (?, ?, ?, ?, ?, ?)",
    );
    const result = stmt.run(
      slug,
      title,
      content,
      type,
      tags || null,
      status || "published",
    );
    return result.lastInsertRowid as number;
  }

  updateWikiPage(
    id: number,
    title: string,
    content: string,
    tags?: string,
    status?: string,
  ) {
    const stmt = this.db.prepare(
      "UPDATE wiki_pages SET title = ?, content = ?, tags = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    );
    stmt.run(title, content, tags || null, status, id);
  }

  // Page Sources
  insertPageSource(pageId: number, sourceId: number) {
    const stmt = this.db.prepare(
      "INSERT OR IGNORE INTO page_sources (page_id, source_id) VALUES (?, ?)",
    );
    stmt.run(pageId, sourceId);
  }

  getSourcesForPage(pageId: number) {
    const stmt = this.db.prepare(`
      SELECT rs.* FROM raw_sources rs
      JOIN page_sources ps ON rs.id = ps.source_id
      WHERE ps.page_id = ?
    `);
    return stmt.all(pageId) as any[];
  }

  // Wiki Links
  insertWikiLink(fromPageId: number, toPageSlug: string) {
    const stmt = this.db.prepare(
      "INSERT OR IGNORE INTO wiki_links (from_page_id, to_page_slug) VALUES (?, ?)",
    );
    stmt.run(fromPageId, toPageSlug);
  }

  deleteWikiLinksForPage(fromPageId: number) {
    const stmt = this.db.prepare(
      "DELETE FROM wiki_links WHERE from_page_id = ?",
    );
    stmt.run(fromPageId);
  }

  getBacklinks(toPageSlug: string) {
    const stmt = this.db.prepare(`
      SELECT wp.* FROM wiki_pages wp
      JOIN wiki_links wl ON wp.id = wl.from_page_id
      WHERE wl.to_page_slug = ?
    `);
    return stmt.all(toPageSlug) as any[];
  }

  getOutgoingLinks(fromPageId: number) {
    const stmt = this.db.prepare(
      "SELECT to_page_slug FROM wiki_links WHERE from_page_id = ? ORDER BY to_page_slug",
    );
    return stmt.all(fromPageId).map((row: any) => row.to_page_slug);
  }

  // Lint Warnings
  insertLintWarning(
    pageId: number | null,
    type: string,
    message: string,
    severity?: string,
  ) {
    const stmt = this.db.prepare(
      "INSERT INTO lint_warnings (page_id, type, message, severity) VALUES (?, ?, ?, ?)",
    );
    const result = stmt.run(
      pageId || null,
      type,
      message,
      severity || "warning",
    );
    return result.lastInsertRowid as number;
  }

  getLintWarnings(pageId?: number) {
    if (pageId) {
      const stmt = this.db.prepare(
        "SELECT * FROM lint_warnings WHERE page_id = ? AND resolved = 0",
      );
      return stmt.all(pageId) as any[];
    }
    const stmt = this.db.prepare(
      "SELECT * FROM lint_warnings WHERE resolved = 0 ORDER BY created_at DESC",
    );
    return stmt.all() as any[];
  }

  resolveLintWarning(warningId: number) {
    const stmt = this.db.prepare(
      "UPDATE lint_warnings SET resolved = 1 WHERE id = ?",
    );
    stmt.run(warningId);
  }

  getLintSummary() {
    const stmt = this.db.prepare(`
      SELECT type, COUNT(*) as count FROM lint_warnings WHERE resolved = 0 GROUP BY type
    `);
    return stmt.all() as any[];
  }
}
