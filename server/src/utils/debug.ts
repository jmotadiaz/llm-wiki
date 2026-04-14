import "./load-env";

const DEBUG_ENABLED = process.env.DEBUG_ENABLED === "1";

console.log("DEBUG_ENABLED", DEBUG_ENABLED);
console.log("process.env.DEBUG_ENABLED", process.env.DEBUG_ENABLED);

function formatDebugData(data: unknown): string {
  if (typeof data === "string") {
    return data;
  }

  try {
    return JSON.stringify(data, null, 2);
  } catch {
    return String(data);
  }
}

export function isDebugEnabled(): boolean {
  return DEBUG_ENABLED;
}

export function debugLog(message: string, data?: unknown): void {
  if (!DEBUG_ENABLED) {
    return;
  }

  if (data === undefined) {
    console.log(message);
    return;
  }

  console.log(`${message}\n${formatDebugData(data)}`);
}
