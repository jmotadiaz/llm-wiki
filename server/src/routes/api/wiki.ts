import { Router, Request, Response } from 'express';
import { Queries } from '../../db/queries.js';
import { runTier1Lint } from '../../services/lint-deterministic.js';
import { runTier3Audit } from '../../llm/lint.js';
import Database from 'better-sqlite3';

export function createWikiRoutes(db: Database.Database): Router {
  const router = Router();
  const queries = new Queries(db);

  // Specific routes BEFORE :slug catch-all
  // 8.4 GET /api/wiki/graph - Return nodes (wiki pages) and edges (wiki_links) for graph visualization
  router.get('/graph', (req: Request, res: Response) => {
    try {
      const pages = queries.getAllWikiPages();
      const nodes = pages.map(page => ({
        id: page.slug,
        label: page.title,
        type: page.type,
        tags: (page.tags || '').split(',').filter((t: string) => t.trim()),
      }));

      const edges: any[] = [];
      const edgeSet = new Set<string>(); // To avoid duplicates

      for (const page of pages) {
        const links = queries.getOutgoingLinks(page.id);
        for (const linkSlug of links) {
          const edgeKey = `${page.slug}->${linkSlug}`;
          if (!edgeSet.has(edgeKey)) {
            edges.push({
              source: page.slug,
              target: linkSlug,
            });
            edgeSet.add(edgeKey);
          }
        }
      }

      res.json({
        success: true,
        graph: {
          nodes,
          edges,
        },
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // 8.5 GET /api/wiki/lint/status - Return lint warnings summary and last run timestamps
  router.get('/lint/status', (req: Request, res: Response) => {
    try {
      const summary = queries.getLintSummary();
      const warnings = queries.getLintWarnings();

      const counts: any = {};
      for (const item of summary) {
        counts[item.type] = item.count;
      }

      res.json({
        success: true,
        lint: {
          counts,
          totalWarnings: warnings.length,
          lastRun: new Date().toISOString(),
          warnings: warnings.map((w: any) => ({
            id: w.id,
            type: w.type,
            message: w.message,
            severity: w.severity,
            pageId: w.page_id,
          })),
        },
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // 8.6 POST /api/wiki/lint - Trigger manual Tier 3 semantic audit (also runs Tier 1)
  router.post('/lint', async (req: Request, res: Response) => {
    try {
      // Run Tier 1 deterministic lint first
      const tier1Issues = runTier1Lint(db);

      // Run Tier 3 semantic audit
      const tier3Findings = await runTier3Audit(db);

      res.json({
        success: true,
        message: 'Full audit completed (Tier 1 + Tier 3)',
        tier1: {
          issuesFound: tier1Issues.length,
          issues: tier1Issues.map(issue => ({
            type: issue.type,
            pageId: issue.pageId,
            message: issue.message,
            severity: issue.severity,
          })),
        },
        tier3: {
          findingsFound: tier3Findings.length,
          findings: tier3Findings.map(f => ({
            type: f.type,
            slugs: f.slugs,
            message: f.message,
            severity: f.severity,
          })),
        },
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // General routes after specific ones
  // 8.1 GET /api/wiki - Return parsed index.md data (all pages with metadata)
  router.get('/', (req: Request, res: Response) => {
    try {
      const pages = queries.getAllWikiPages();
      const pageList = pages.map(page => ({
        slug: page.slug,
        title: page.title,
        type: page.type,
        tags: (page.tags || '').split(',').filter((t: string) => t.trim()),
        status: page.status,
        summary: '', // Could extract from first paragraph of content
      }));

      res.json({
        success: true,
        count: pageList.length,
        pages: pageList,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // 8.2 GET /api/wiki/:slug - Return wiki page content + metadata + backlinks + lint status
  router.get('/:slug', (req: Request, res: Response) => {
    try {
      const slug = req.params.slug as string;
      const page = queries.getWikiPageBySlug(slug);

      if (!page) {
        res.status(404).json({ error: 'Page not found' });
        return;
      }

      const backlinks = queries.getBacklinks(slug);
      const outgoingLinks = queries.getOutgoingLinks(page.id);
      const sources = queries.getSourcesForPage(page.id);
      const lintIssues = queries.getLintWarnings(page.id);

      res.json({
        success: true,
        page: {
          slug: page.slug,
          title: page.title,
          type: page.type,
          status: page.status,
          tags: (page.tags || '').split(',').filter((t: string) => t.trim()),
          content: page.content,
          created_at: page.created_at,
          updated_at: page.updated_at,
        },
        backlinks: backlinks.map((bl: any) => ({
          slug: bl.slug,
          title: bl.title,
        })),
        outgoingLinks,
        sources: sources.map((src: any) => ({
          id: src.id,
          title: src.title,
          author: src.author,
          created_at: src.created_at,
        })),
        lintIssues: lintIssues.map((issue: any) => ({
          type: issue.type,
          message: issue.message,
          severity: issue.severity,
        })),
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
