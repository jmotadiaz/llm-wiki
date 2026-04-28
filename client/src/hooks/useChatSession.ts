import { UIMessage } from "ai";

export function generateSessionKey(): string {
  return `chat_${Date.now()}`;
}

export function getLatestSessionKey(): string | null {
  const chatKeys = Object.keys(sessionStorage)
    .filter((key) => key.startsWith("chat_"))
    .sort((a, b) => {
      const timestampA = parseInt(a.split("_")[1], 10);
      const timestampB = parseInt(b.split("_")[1], 10);
      return timestampB - timestampA;
    });

  return chatKeys.length > 0 ? chatKeys[0] : null;
}

export function loadSession(key: string | null): UIMessage[] {
  if (!key) {
    return [];
  }

  try {
    const stored = sessionStorage.getItem(key);
    if (!stored) {
      return [];
    }

    const parsed = JSON.parse(stored) as any[];
    return parsed.map((m: any) => ({
      ...m,
      createdAt: m.createdAt ? new Date(m.createdAt) : undefined,
    }));
  } catch {
    return [];
  }
}

export function saveSession(key: string, messages: UIMessage[]): void {
  try {
    sessionStorage.setItem(key, JSON.stringify(messages));
  } catch (error) {
    if (error instanceof Error && error.name === "QuotaExceededError") {
      console.warn("sessionStorage quota exceeded, cannot save chat session");
    } else {
      console.warn("Error saving chat session to sessionStorage:", error);
    }
  }
}

export function clearSession(key: string): void {
  try {
    sessionStorage.removeItem(key);
  } catch (error) {
    console.warn("Error clearing chat session from sessionStorage:", error);
  }
}
