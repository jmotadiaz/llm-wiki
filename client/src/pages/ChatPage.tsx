import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useRef, useEffect, useState } from "react";
import Markdown from "../components/markdown/Markdown";
import { clearSession, generateSessionKey, getLatestSessionKey, loadSession, saveSession } from "../hooks/useChatSession";

const transport = new DefaultChatTransport({ api: "/api/chat" });

export default function ChatPage() {
  const [input, setInput] = useState("");
  const [sessionKey, setSessionKey] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const latestSessionKey = getLatestSessionKey();
    setSessionKey(latestSessionKey || generateSessionKey());
  }, []);

  const { messages, sendMessage, status, setMessages } = useChat({
    transport,
  });
  const isLoading = status === "streaming" || status === "submitted";

  // Cargar sesión anterior cuando sessionKey esté listo
  useEffect(() => {
    if (sessionKey && messages.length === 0) {
      const loadedMessages = loadSession(sessionKey);
      if (loadedMessages.length > 0) {
        setMessages(loadedMessages);
      }
    }
  }, [sessionKey]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  // Guardar mensajes en sessionStorage cuando cambien
  useEffect(() => {
    if (sessionKey && messages.length > 0) {
      saveSession(sessionKey, messages);
    }
  }, [messages, sessionKey]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      sendMessage({ text: input });
      setInput("");
    }
  };

  const handleClearSession = () => {
    if (sessionKey) {
      clearSession(sessionKey);
    }
    setMessages([]);
    const newSessionKey = generateSessionKey();
    setSessionKey(newSessionKey);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-200px)] max-w-3xl">
      <h2 className="text-2xl font-bold mb-4">Chat with Wiki</h2>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-4 mb-4">
        {messages.length === 0 && (
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            Ask a question about your wiki knowledge base.
          </p>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={`p-3 rounded-lg text-sm ${
              m.role === "user"
                ? "bg-blue-50 dark:bg-blue-900/20 ml-8"
                : "bg-gray-100 dark:bg-gray-800 mr-8"
            }`}
          >
            <div className="text-xs font-medium mb-1 text-gray-500 dark:text-gray-400">
              {m.role === "user" ? "You" : "Wiki Assistant"}
            </div>
            <div className="prose dark:prose-invert max-w-none">
              {m.parts.map((part, i) => {
                if (part.type === "text") {
                  return (
                    <Markdown
                      key={i}
                      content={part.text}
                      streaming={m.role === "assistant"}
                    />
                  );
                }
                return null;
              })}
            </div>
          </div>
        ))}
        {isLoading && messages[messages.length - 1]?.role === "user" && (
          <div className="p-3 rounded-lg bg-gray-100 dark:bg-gray-800 mr-8 text-sm text-gray-500">
            Thinking...
          </div>
        )}
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about your wiki..."
          className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-900 text-sm"
          disabled={isLoading}
        />
        <button
          type="submit"
          disabled={isLoading || !input.trim()}
          className="px-4 py-2 bg-blue-600 text-white rounded font-medium disabled:opacity-50 text-sm"
        >
          Send
        </button>
        <button
          type="button"
          onClick={handleClearSession}
          disabled={messages.length === 0 || isLoading}
          className="px-3 py-2 bg-gray-400 hover:bg-gray-500 text-white rounded font-medium disabled:opacity-50 text-sm"
          title="Clear session and start a new conversation"
        >
          Clear
        </button>
      </form>
    </div>
  );
}
