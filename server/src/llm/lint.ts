import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { llmClient } from './client.js';
import { Queries } from '../db/queries.js';
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface TriageResult {
  phase: 'triage';
  high_risk_pairs: Array<{
    slugs: string[];
    risk_type: string;
    reason: string;
  }>;
}

interface VerificationFinding {
  type: string;
  slugs: string[];
  message: string;
  severity: 'warning' | 'error';
  evidence?: Record<string, string>;
  overlap_percentage?: number;
}

interface VerificationResult {
  phase: 'verification';
  findings: VerificationFinding[];
}

function loadL1Index(queries: Queries): string {
  const pages = queries.getAllWikiPages();
  if (pages.length === 0) return '(No pages in wiki yet)';
  return pages.map(p => `- \`${p.slug}\`: ${p.title} | ${p.tags || 'untagged'}`).join('\n');
}

function loadLintQueue(): string {
  const queuePath = path.join(__dirname, '../../..', 'data', 'lint-queue.json');
  if (!fs.existsSync(queuePath)) return '[]';
  return fs.readFileSync(queuePath, 'utf-8');
}

function loadSystemPrompt(l1Index: string, lintQueue: string): string {
  const promptPath = path.join(__dirname, "prompts", "tier3-audit-system.md");

  if (!fs.existsSync(promptPath)) {
    // Fallback: try to see if we are in dist and prompts are in src (for dev-like execution of dist)
    const fallbackPath = path.join(
      __dirname,
      "..",
      "..",
      "src",
      "llm",
      "prompts",
      "tier3-audit-system.md",
    );
    if (fs.existsSync(fallbackPath)) {
      return loadAndReplace(fallbackPath, l1Index, lintQueue);
    }

    throw new Error(
      `System prompt not found at ${promptPath}. Please ensure 'npm run build' has been run and the prompts directory exists in dist/llm/prompts/`,
    );
  }

  return loadAndReplace(promptPath, l1Index, lintQueue);
}

function loadAndReplace(
  filePath: string,
  l1Index: string,
  lintQueue: string,
): string {
  let prompt = fs.readFileSync(filePath, "utf-8");
  prompt = prompt.replace("{L1_INDEX}", l1Index);
  prompt = prompt.replace("{LINT_QUEUE}", lintQueue);
  return prompt;
}

function parseJSON<T>(text: string): T {
  let jsonText = text.trim();
  if (jsonText.startsWith('```json')) {
    jsonText = jsonText.substring(7);
    jsonText = jsonText.substring(0, jsonText.lastIndexOf('```'));
  } else if (jsonText.startsWith('```')) {
    jsonText = jsonText.substring(3);
    jsonText = jsonText.substring(0, jsonText.lastIndexOf('```'));
  }
  return JSON.parse(jsonText.trim());
}

function appendToLog(findings: VerificationFinding[]): void {
  const logPath = path.join(__dirname, '../../..', 'data', 'log.md');
  const timestamp = new Date().toISOString();
  const header = `\n## Tier 3 Audit — ${timestamp}\n\n`;

  let entry: string;
  if (findings.length === 0) {
    entry = header + 'No issues found.\n';
  } else {
    const lines = findings.map(f =>
      `- **${f.type}** (${f.severity}): ${f.message} [${f.slugs.join(', ')}]`
    );
    entry = header + lines.join('\n') + '\n';
  }

  fs.appendFileSync(logPath, entry, 'utf-8');
}

/**
 * Run Tier 3 semantic audit: triage -> fetch pages -> verify -> store findings.
 * Takes 2-3 LLM calls.
 */
export async function runTier3Audit(db: Database.Database): Promise<VerificationFinding[]> {
  const queries = new Queries(db);
  const l1Index = loadL1Index(queries);
  const lintQueue = loadLintQueue();
  const systemPrompt = loadSystemPrompt(l1Index, lintQueue);

  // Phase 1: Triage - identify high-risk pairs
  const triageResult = await llmClient.generate({
    system: systemPrompt,
    messages: [{ role: 'user', content: 'Perform Phase 1 triage. Analyze the wiki index and lint queue to identify high-risk page pairs that may contain contradictions, duplications, or inconsistencies. Return the triage JSON.' }],
    temperature: 0.3,
    maxOutputTokens: 2048,
  });

  const triageData = parseJSON<TriageResult>(triageResult.text);

  if (!triageData.high_risk_pairs || triageData.high_risk_pairs.length === 0) {
    return [];
  }

  // Collect unique slugs to fetch
  const slugsToFetch = new Set<string>();
  for (const pair of triageData.high_risk_pairs) {
    for (const slug of pair.slugs) {
      slugsToFetch.add(slug);
    }
  }

  // Fetch full page contents
  const pageContents: Record<string, string> = {};
  for (const slug of slugsToFetch) {
    const page = queries.getWikiPageBySlug(slug);
    if (page) {
      pageContents[slug] = `# ${page.title}\n\n${page.content}`;
    }
  }

  if (Object.keys(pageContents).length === 0) {
    return [];
  }

  // Phase 2: Verification - deep comparison
  const pagesContext = Object.entries(pageContents)
    .map(([slug, content]) => `## Page: ${slug}\n\n${content}`)
    .join('\n\n---\n\n');

  const verifyResult = await llmClient.generate({
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: `Perform Phase 2 verification. Here are the full contents of the flagged pages:\n\n${pagesContext}\n\nCompare these pages and return specific findings as verification JSON.`,
      },
    ],
    temperature: 0.3,
    maxOutputTokens: 4096,
  });

  const verifyData = parseJSON<VerificationResult>(verifyResult.text);
  const findings = verifyData.findings || [];

  // Append results to log.md
  appendToLog(findings);

  // Store findings in lint_warnings
  for (const finding of findings) {
    // Find the first page's ID for associating the warning
    const firstSlug = finding.slugs[0];
    const page = firstSlug ? queries.getWikiPageBySlug(firstSlug) : null;
    const pageId = page ? page.id : null;

    queries.insertLintWarning(
      pageId,
      finding.type,
      `[Tier 3] ${finding.message} (pages: ${finding.slugs.join(', ')})`,
      finding.severity
    );
  }

  return findings;
}
