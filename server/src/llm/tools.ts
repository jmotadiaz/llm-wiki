import { tool } from 'ai';
import { z } from 'zod';
import { Queries } from '../db/queries.js';
import Database from 'better-sqlite3';

/**
 * Creates the set of tools for the chat agent.
 * @param db The SQLite database instance.
 */
export const createTools = (db: Database.Database) => {
  const queries = new Queries(db);

  return {
    get_wiki_pages: tool({
      description: 'Retrieve the full content and metadata of wiki pages by their slugs. Use this to read the full context of relevant pages.',
      inputSchema: z.object({
        slugs: z.array(z.string()).describe('The slugs of the wiki pages to retrieve.'),
      }),
      execute: async ({ slugs }) => {
        console.log(`[Tool: get_wiki_pages] fetching slugs: ${slugs.join(', ')}`);
        const pages = slugs.map(slug => queries.getWikiPageBySlug(slug));
        return pages.filter(Boolean);
      },
    }),

    get_backlinks: tool({
      description: 'Retrieve pages that link to a specific wiki page (backlinks). Helpful for discovering related topics or broader context.',
      inputSchema: z.object({
        slug: z.string().describe('The slug of the wiki page to find backlinks for.'),
      }),
      execute: async ({ slug }) => {
        console.log(`[Tool: get_backlinks] fetching backlinks for: ${slug}`);
        const backlinks = queries.getBacklinks(slug);
        return backlinks;
      },
    }),

    get_page_sources: tool({
      description: 'Retrieve the raw content and metadata of original sources used to generate a specific wiki page. Use this for checking citations or provenance.',
      inputSchema: z.object({
        slug: z.string().describe('The slug of the wiki page to find sources for.'),
      }),
      execute: async ({ slug }) => {
        console.log(`[Tool: get_page_sources] fetching sources for: ${slug}`);
        const page = queries.getWikiPageBySlug(slug);
        if (!page) return { error: `Page with slug "${slug}" not found.` };
        const sources = queries.getSourcesForPage(page.id);
        return sources;
      },
    }),

    get_wiki_pages_for_source: tool({
      description: 'Find which wiki pages were derived from a specific raw source document. Search by raw source title (partial match) and get the wiki pages linked to it via the page_sources table. Use this when the user asks which pages are related to or generated from a raw source.',
      inputSchema: z.object({
        source_title_query: z.string().describe('Partial or full title of the raw source to search for.'),
      }),
      execute: async ({ source_title_query }) => {
        console.log(`[Tool: get_wiki_pages_for_source] searching for source: ${source_title_query}`);
        const sources = queries.searchRawSources(source_title_query);
        if (sources.length === 0) {
          return { error: `No raw sources found matching "${source_title_query}".` };
        }
        return sources.map((source: any) => ({
          source: { id: source.id, title: source.title, author: source.author, source_url: source.source_url, created_at: source.created_at },
          wiki_pages: queries.getPagesForSource(source.id),
        }));
      },
    }),

    get_recent_ingests: tool({
      description: 'Retrieve metadata for the N most recently ingested raw source documents (NOT wiki pages). Raw sources are the original documents (blog posts, PDFs, URLs) that were processed to create wiki pages. Use this ONLY when the user asks about raw ingestion history, NOT when they ask about wiki pages or articles.',
      inputSchema: z.object({
        n: z.number().optional().default(5).describe('The number of recent ingests to retrieve.'),
      }),
      execute: async ({ n }) => {
        console.log(`[Tool: get_recent_ingests] fetching last ${n} sources`);
        const allSources = queries.getAllRawSources();
        return allSources.slice(0, n).map(s => ({
          id: s.id,
          title: s.title,
          author: s.author,
          source_url: s.source_url,
          created_at: s.created_at,
        }));
      },
    }),
  };
};
