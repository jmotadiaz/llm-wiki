import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useRef, useEffect, useState } from "react";
import Markdown from "../components/markdown/Markdown";
import Icon from "../components/Icon";
import { clearSession, generateSessionKey, getLatestSessionKey, loadSession, saveSession } from "../hooks/useChatSession";

const transport = new DefaultChatTransport({ api: "/api/chat" });

export default function ChatPage() {
  const [input, setInput] = useState("");
  const [sessionKey, setSessionKey] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const latest = getLatestSessionKey();
    setSessionKey(latest || generateSessionKey());
  }, []);

  const { messages, sendMessage, status, setMessages } = useChat({ transport });
  const isLoading = status === "streaming" || status === "submitted";

  useEffect(() => {
    if (sessionKey && messages.length === 0) {
      const loaded = loadSession(sessionKey);
      if (loaded.length > 0) setMessages(loaded);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionKey]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (sessionKey && messages.length > 0) saveSession(sessionKey, messages);
  }, [messages, sessionKey]);

  const send = (text?: string) => {
    const value = (text ?? input).trim();
    if (!value) return;
    sendMessage({ text: value });
    setInput("");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    send();
  };

  const handleClear = () => {
    if (sessionKey) clearSession(sessionKey);
    setMessages([]);
    setSessionKey(generateSessionKey());
  };

  return (
    <div className="max-w-[760px] mx-auto flex flex-col h-[calc(100svh-10.5rem)] md:h-[calc(100svh-11.5rem)] overflow-hidden">
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="h-full grid place-content-center text-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-bg-1 border border-line-strong grid place-items-center mx-auto text-accent font-mono font-extrabold text-2xl">W</div>
            <div className="eyebrow mt-1">Chat with Wiki</div>
            <h1 className="text-2xl md:text-[28px] font-extrabold leading-tight tracking-tight">
              ¿Sobre qué quieres preguntar?
            </h1>
            <p className="text-fg-2 max-w-[46ch] mx-auto text-sm">
              Respuestas fundamentadas en tu base de conocimiento. Cada respuesta incluye citas a las fuentes originales.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-7 py-4">
            {messages.map(m => (
              <div key={m.id} className="flex gap-3.5">
                <div className={"w-[30px] h-[30px] rounded-lg flex-shrink-0 grid place-items-center font-mono font-bold text-[11px] " + (m.role === "user" ? "bg-bg-2 text-fg-1" : "bg-bg-2 text-accent border border-line-strong")}>
                  {m.role === "user" ? "YO" : "W"}
                </div>
                <div className="flex-1 min-w-0 pt-0.5">
                  <div className="text-[13px] font-bold text-fg mb-1">{m.role === "user" ? "Tú" : "LLM Wiki"}</div>
                  <div className="prose-doc max-w-none">
                    {m.parts.map((part, i) => part.type === "text" ? (
                      <Markdown key={i} content={part.text} streaming={m.role === "assistant"} />
                    ) : null)}
                  </div>
                </div>
              </div>
            ))}
            {isLoading && messages[messages.length - 1]?.role === "user" && (
              <div className="flex gap-3.5">
                <div className="w-[30px] h-[30px] rounded-lg bg-bg-2 text-accent border border-line-strong grid place-items-center font-mono font-bold text-[11px]">W</div>
                <div className="flex-1 pt-0.5 text-fg-2 text-sm">Pensando…</div>
              </div>
            )}
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="mt-3 bg-bg-1 border border-line-strong rounded-[14px] p-3 flex flex-col gap-2.5 shadow-2xl flex-shrink-0">
        <textarea
          rows={1}
          placeholder="Pregunta sobre tu wiki…"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          className="bg-transparent border-0 outline-none text-fg font-sans text-[15px] resize-none min-h-[28px] p-1 w-full placeholder:text-fg-3"
          disabled={isLoading}
        />
        <div className="flex items-center gap-2 justify-end">
          <button
            type="button"
            onClick={handleClear}
            className="btn btn-outline text-xs py-1.5 px-3"
            disabled={isLoading || messages.length === 0}
          >
            Clear
          </button>
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="btn btn-primary text-xs py-1.5 px-3"
          >
            <Icon name="send" size={14} /> Enviar
          </button>
        </div>
      </form>
    </div>
  );
}
