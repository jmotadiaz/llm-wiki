import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TRACES_ROOT = path.join(__dirname, "../../..", "traces");

const DIACRITIC_RE = new RegExp("[\\u0300-\\u036f]", "g");

function slugifyTitle(title: string): string {
  const slug = title
    .toLowerCase()
    .normalize("NFD")
    .replace(DIACRITIC_RE, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return slug || "untitled";
}

export interface TraceSession {
  dir: string;
  rawSourceId: number;
}

export function createTraceSession(
  rawSourceId: number,
  rawTitle: string,
): TraceSession {
  const titleSlug = slugifyTitle(rawTitle);
  const shortId = crypto.randomBytes(4).toString("hex");
  const sessionName = `${titleSlug}-raw${rawSourceId}-${shortId}`;
  const dir = path.join(TRACES_ROOT, sessionName);
  fs.mkdirSync(dir, { recursive: true });
  return { dir, rawSourceId };
}

export type StepLogger = (event: unknown) => void;

export function createStepLogger(
  session: TraceSession,
  agentName: string,
): StepLogger {
  const filePath = path.join(session.dir, `${agentName}.json`);
  const events: unknown[] = [];

  return (event: unknown) => {
    const entry =
      typeof event === "object" && event !== null
        ? { timestamp: new Date().toISOString(), ...event }
        : { timestamp: new Date().toISOString(), event };
    events.push(entry);
    try {
      fs.writeFileSync(filePath, JSON.stringify(events, null, 2));
    } catch (err) {
      console.error(`[TRACE] Failed to write ${filePath}:`, err);
    }
  };
}
