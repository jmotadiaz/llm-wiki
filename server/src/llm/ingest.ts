import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { z } from 'zod';
import { llmClient } from './client.js';
import { Queries } from '../db/queries.js';
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const IngestPageSchema = z.object({
  slug: z.string(),
  title: z.string(),
  type: z.enum(['concept', 'technique', 'reference', 'index']),
  status: z.enum(['draft', 'published', 'archived']),
  tags: z.array(z.string()),
  summary: z.string(),
  content: z.string(),
  source_ids: z.array(z.number()),
});

const IngestIndexEntrySchema = z.object({
  slug: z.string(),
  title: z.string(),
  summary: z.string(),
  tags: z.array(z.string()),
});

const IngestWarningSchema = z.object({
  type: z.string(),
  message: z.string(),
});

const IngestResultSchema = z.object({
  pages: z.array(IngestPageSchema),
  index_entries: z.array(IngestIndexEntrySchema).default([]),
  warnings: z.array(IngestWarningSchema).default([]),
});

export type IngestPage = z.infer<typeof IngestPageSchema>;
export type IngestIndexEntry = z.infer<typeof IngestIndexEntrySchema>;
export type IngestWarning = z.infer<typeof IngestWarningSchema>;
export type IngestResult = z.infer<typeof IngestResultSchema>;

function loadL1Index(queries: Queries): string {
  const pages = queries.getAllWikiPages();
  if (pages.length === 0) {
    return '(No pages in wiki yet)';
  }

  const entries = pages.map(page => {
    return `- \`${page.slug}\`: ${page.title} | ${page.tags || 'untagged'}`;
  }).join('\n');

  return entries;
}

function loadSchema(): string {
  const schemaPath = path.join(__dirname, '../../..', 'data', 'schema.md');
  return fs.readFileSync(schemaPath, 'utf-8');
}

async function callIngestLLM(rawContent: string, l1Index: string, l1Schema: string, rawSourceId: number): Promise<IngestResult> {
  const systemPromptPath = path.join(__dirname, 'prompts', 'ingest-system.md');
  let systemPrompt = fs.readFileSync(systemPromptPath, 'utf-8');

  // Inject L1 context
  systemPrompt = systemPrompt.replace('{L1_INDEX}', l1Index);
  systemPrompt = systemPrompt.replace('{L1_SCHEMA}', l1Schema);
  systemPrompt = systemPrompt.replace('{RAW_ID}', rawSourceId.toString());

  console.log(`[INGEST] LLM call starting for raw-${rawSourceId}`);

  const userMessage = `Process this raw source document:\n\n${rawContent}`;

  try {
    const result = await llmClient.generateStructured({
      schema: IngestResultSchema,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: userMessage,
        },
      ],
      temperature: 0.7,
      maxOutputTokens: 4096,
    });

    console.log(`[INGEST] Structured output for raw-${rawSourceId}: pages=${result.pages.length}, index_entries=${result.index_entries.length}, warnings=${result.warnings.length}`);

    return result;
  } catch (error: any) {
    console.error(`[INGEST] Ingest LLM failed for raw-${rawSourceId}: ${error.message}`);
    throw new Error(`Ingest LLM failed: ${error.message}`);
  }
}

export async function ingestRawSource(
  db: Database.Database,
  rawSourceId: number,
  rawContent: string
): Promise<IngestResult> {
  const queries = new Queries(db);
  console.log(`[INGEST] Pipeline starting for raw-${rawSourceId}: content length=${rawContent.length}`);

  // Load L1 context
  const l1Index = loadL1Index(queries);
  const l1Schema = loadSchema();

  console.log(`[INGEST] L1 context loaded: pages=${queries.getAllWikiPages().length}, schema length=${l1Schema.length}`);

  // Call LLM for ingest
  const result = await callIngestLLM(rawContent, l1Index, l1Schema, rawSourceId);

  return result;
}
