import { Queries } from '../db/queries.js';
import Database from 'better-sqlite3';

export interface LintIssue {
  type: string;
  pageId: number | null;
  message: string;
  severity: 'warning' | 'error';
}

export class DeterministicLinter {
  constructor(private db: Database.Database) {}

  lint(): LintIssue[] {
    const issues: LintIssue[] = [];
    const queries = new Queries(this.db);

    // Get all pages for analysis
    const pages = queries.getAllWikiPages();
    const pageSlugs = new Set(pages.map(p => p.slug));

    for (const page of pages) {
      // Check 1: Broken links
      const links = queries.getOutgoingLinks(page.id);
      for (const linkSlug of links) {
        if (!pageSlugs.has(linkSlug)) {
          issues.push({
            type: 'broken_link',
            pageId: page.id,
            message: `Broken link: [[${linkSlug}]] does not exist`,
            severity: 'error',
          });
        }
      }

      // Check 2: Orphan pages (no incoming links, not in index)
      const backlinks = queries.getBacklinks(page.slug);
      if (backlinks.length === 0 && page.type !== 'index') {
        // Count links in index.md manually by checking if slug is referenced
        // For now, flag as warning
        issues.push({
          type: 'orphan_page',
          pageId: page.id,
          message: `Orphan page: "${page.title}" has no backlinks and is not referenced`,
          severity: 'warning',
        });
      }

      // Check 3: Stale pages (all source citations are archived)
      const sources = queries.getSourcesForPage(page.id);
      if (sources.length > 0) {
        const allArchived = sources.every((src: any) => {
          // For now, we don't have archive status in raw_sources
          // This would be enhanced with a status field
          return false;
        });
        if (allArchived) {
          issues.push({
            type: 'stale_page',
            pageId: page.id,
            message: `Stale page: All ${sources.length} source citations are archived`,
            severity: 'warning',
          });
        }
      }

      // Check 4: Missing pages (referenced but not created)
      // This is already handled by broken_link check

      // Check 5: Metadata validation
      if (!page.type || !['concept', 'technique', 'reference', 'index'].includes(page.type)) {
        issues.push({
          type: 'invalid_metadata',
          pageId: page.id,
          message: `Invalid page type: "${page.type}" (must be: concept, technique, reference, index)`,
          severity: 'error',
        });
      }

      if (!page.status || !['draft', 'published', 'archived'].includes(page.status)) {
        issues.push({
          type: 'invalid_metadata',
          pageId: page.id,
          message: `Invalid page status: "${page.status}" (must be: draft, published, archived)`,
          severity: 'error',
        });
      }

      if (!page.tags || page.tags.trim().length === 0) {
        issues.push({
          type: 'missing_tags',
          pageId: page.id,
          message: `Missing tags: page "${page.title}" has no tags`,
          severity: 'warning',
        });
      }
    }

    return issues;
  }

  storeLintResults(issues: LintIssue[]): void {
    const queries = new Queries(this.db);

    // Clear previous warnings (keep only resolved ones)
    const allWarnings = queries.getLintWarnings();
    for (const warning of allWarnings) {
      if (!warning.resolved) {
        queries.resolveLintWarning(warning.id);
      }
    }

    // Store new warnings
    for (const issue of issues) {
      queries.insertLintWarning(issue.pageId, issue.type, issue.message, issue.severity);
    }
  }

  getResults(): LintIssue[] {
    const queries = new Queries(this.db);
    const warnings = queries.getLintWarnings();
    return warnings.map(w => ({
      type: w.type,
      pageId: w.page_id,
      message: w.message,
      severity: w.severity,
    }));
  }
}

export function runTier1Lint(db: Database.Database): LintIssue[] {
  const linter = new DeterministicLinter(db);
  const issues = linter.lint();
  linter.storeLintResults(issues);
  return issues;
}
