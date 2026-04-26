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
    summary: string | null,
    content: string,
    type: string,
    tags?: string,
    status?: string,
    generatedAt?: string | null,
  ) {
    const stmt = this.db.prepare(
      "INSERT INTO wiki_pages (slug, title, summary, content, type, tags, status, generated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    );
    const result = stmt.run(
      slug,
      title,
      summary || null,
      content,
      type,
      tags || null,
      status || "published",
      generatedAt || null,
    );
    return result.lastInsertRowid as number;
  }

  updateWikiPage(
    id: number,
    title: string,
    summary: string | null,
    content: string,
    tags?: string,
    status?: string,
    generatedAt?: string | null,
  ) {
    if (generatedAt !== undefined) {
      const stmt = this.db.prepare(
        "UPDATE wiki_pages SET title = ?, summary = ?, content = ?, tags = ?, status = ?, generated_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      );
      stmt.run(title, summary || null, content, tags || null, status, generatedAt, id);
      return;
    }
    const stmt = this.db.prepare(
      "UPDATE wiki_pages SET title = ?, summary = ?, content = ?, tags = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    );
    stmt.run(title, summary || null, content, tags || null, status, id);
  }

  getWikiPagesByType(type: string) {
    const stmt = this.db.prepare(
      "SELECT * FROM wiki_pages WHERE type = ? ORDER BY updated_at DESC",
    );
    return stmt.all(type) as any[];
  }

  getInboundLinkCounts(): Map<string, number> {
    const stmt = this.db.prepare(
      "SELECT to_page_slug, COUNT(*) as count FROM wiki_links GROUP BY to_page_slug",
    );
    const rows = stmt.all() as any[];
    const counts = new Map<string, number>();
    for (const row of rows) {
      counts.set(row.to_page_slug, row.count);
    }
    return counts;
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

  getPagesForSource(sourceId: number) {
    const stmt = this.db.prepare(`
      SELECT wp.id, wp.slug, wp.title, wp.type, wp.tags, wp.status, wp.updated_at
      FROM wiki_pages wp
      JOIN page_sources ps ON wp.id = ps.page_id
      WHERE ps.source_id = ?
      ORDER BY wp.updated_at DESC
    `);
    return stmt.all(sourceId) as any[];
  }

  searchRawSources(query: string) {
    const stmt = this.db.prepare(`
      SELECT id, title, author, source_url, description, created_at
      FROM raw_sources
      WHERE title LIKE ? OR description LIKE ?
      ORDER BY created_at DESC
      LIMIT 10
    `);
    const pattern = `%${query}%`;
    return stmt.all(pattern, pattern) as any[];
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
        "SELECT lw.*, wp.slug FROM lint_warnings lw LEFT JOIN wiki_pages wp ON lw.page_id = wp.id WHERE lw.page_id = ? AND lw.resolved = 0",
      );
      return stmt.all(pageId) as any[];
    }
    const stmt = this.db.prepare(
      "SELECT lw.*, wp.slug FROM lint_warnings lw LEFT JOIN wiki_pages wp ON lw.page_id = wp.id WHERE lw.resolved = 0 ORDER BY lw.created_at DESC",
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

  // Page Comments
  insertComment(pageId: number, content: string) {
    const stmt = this.db.prepare(
      "INSERT INTO page_comments (page_id, content) VALUES (?, ?)",
    );
    const result = stmt.run(pageId, content);
    return result.lastInsertRowid as number;
  }

  getCommentsByPageId(pageId: number) {
    const stmt = this.db.prepare(
      "SELECT * FROM page_comments WHERE page_id = ? AND status != 'archived' ORDER BY created_at DESC",
    );
    return stmt.all(pageId) as any[];
  }

  updateCommentStatus(commentId: number, status: string) {
    const stmt = this.db.prepare(
      "UPDATE page_comments SET status = ? WHERE id = ?",
    );
    stmt.run(status, commentId);
  }

  setCommentAnswered(
    commentId: number,
    reasoning: string,
    pagesEdited: string[],
  ) {
    const stmt = this.db.prepare(
      "UPDATE page_comments SET status = ?, reply = ?, pages_edited = ?, answered_at = CURRENT_TIMESTAMP WHERE id = ?",
    );
    stmt.run("answered", reasoning, JSON.stringify(pagesEdited), commentId);
  }

  setCommentFailed(commentId: number, errorMessage: string) {
    const stmt = this.db.prepare(
      "UPDATE page_comments SET status = ?, error = ?, answered_at = CURRENT_TIMESTAMP WHERE id = ?",
    );
    stmt.run("failed", errorMessage, commentId);
  }

  archiveComment(commentId: number) {
    const stmt = this.db.prepare(
      "UPDATE page_comments SET status = ? WHERE id = ?",
    );
    stmt.run("archived", commentId);
  }
}
