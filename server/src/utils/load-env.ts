import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Try to load .env from current directory or parent directory
// This handles running from 'server/' (dev) or 'server/dist/' (prod)
const envPaths = [
  path.join(process.cwd(), ".env"),
  path.join(__dirname, ".env"),
  path.join(__dirname, "../.env"),
  path.join(__dirname, "../../.env"),
];

let envFound = false;
for (const envPath of envPaths) {
  const result = dotenv.config({ path: envPath });
  if (!result.error) {
    console.log(`[INIT] Loaded environment from: ${envPath}`);
    envFound = true;
    break;
  }
}

if (!envFound) {
  console.warn(
    "[WARNING] No .env file found in expected locations. Using system environment variables.",
  );
}
