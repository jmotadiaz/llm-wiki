import { useState, useEffect, useRef } from "react";
import { useParams, Link, useLocation } from "react-router-dom";
import Markdown from "../components/markdown/Markdown";
import Icon from "../components/Icon";

interface RawSource {
  id: number;
  title: string;
  author: string | null;
  content: string;
  source_url: string | null;
  checksum: string;
  created_at: string;
}

export default function RawSourcePage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const [source, setSource] = useState<RawSource | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    fetch(`/api/raw/${id}`)
      .then(r => r.json() as Promise<{ source: RawSource; error?: string }>)
      .then(data => {
        if (data.error) throw new Error(data.error);
        setSource(data.source);
        setLoading(false);
      })
      .catch(err => { setError(err.message); setLoading(false); });
  }, [id]);

  // Scroll to hash fragment when content is ready. Re-snap on layout shifts
  // (markdown streaming, shiki highlight, etc.) only until the user interacts.
  useEffect(() => {
    if (!source || !location.hash) return;

    const fragment = decodeURIComponent(location.hash.slice(1));
    if (!fragment) return;

    let userMoved = false;
    let lastTop: number | null = null;
    let cancelled = false;

    const markInteracted = () => { userMoved = true; };
    const onKey = (e: KeyboardEvent) => {
      if (["PageDown", "PageUp", "ArrowDown", "ArrowUp", "Home", "End", " "].includes(e.key)) {
        userMoved = true;
      }
    };
    window.addEventListener("wheel", markInteracted, { passive: true });
    window.addEventListener("touchmove", markInteracted, { passive: true });
    window.addEventListener("mousedown", markInteracted);
    window.addEventListener("keydown", onKey);

    const snap = () => {
      if (cancelled || userMoved) return;
      const el = document.getElementById(fragment);
      if (!el) return;
      const top = el.getBoundingClientRect().top + window.scrollY;
      if (lastTop !== null && Math.abs(top - lastTop) < 1) return; // already aligned
      lastTop = top;
      el.scrollIntoView({ block: "start" });
    };

    // Try repeatedly during the streaming/render window
    const initial = requestAnimationFrame(snap);
    const timers = [50, 150, 400, 900, 1800].map(ms => window.setTimeout(snap, ms));

    // Observe DOM changes inside the rendered content (rebound target position
    // when blocks render in or images load)
    const observer = new MutationObserver(() => snap());
    if (contentRef.current) {
      observer.observe(contentRef.current, { childList: true, subtree: true, characterData: true });
    }

    // Hard stop after the streaming window — keeps things predictable
    const stop = window.setTimeout(() => observer.disconnect(), 4000);

    return () => {
      cancelled = true;
      cancelAnimationFrame(initial);
      timers.forEach(clearTimeout);
      clearTimeout(stop);
      observer.disconnect();
      window.removeEventListener("wheel", markInteracted);
      window.removeEventListener("touchmove", markInteracted);
      window.removeEventListener("mousedown", markInteracted);
      window.removeEventListener("keydown", onKey);
    };
  }, [source, location.hash]);

  if (loading) return <p className="text-fg-3">Cargando…</p>;
  if (error) return <p className="text-red">Error: {error}</p>;
  if (!source) return <p className="text-fg-3">Source no encontrado</p>;

  return (
    <div className="max-w-[760px]">
      <div className="flex items-center gap-1.5 text-[13px] text-fg-2 font-mono mb-4 flex-wrap">
        <Link to="/" className="hover:text-fg">Wiki</Link>
        <span className="text-fg-3">/</span>
        <Link to="/dashboard" className="hover:text-fg">Raw Sources</Link>
        <span className="text-fg-3">/</span>
        <span className="text-fg-1">#{source.id}</span>
      </div>

      <div className="eyebrow mb-3">Raw Source</div>
      <h1 className="text-3xl md:text-[38px] font-extrabold leading-tight tracking-tight m-0">{source.title}</h1>
      <div className="flex items-center gap-3 flex-wrap mt-3 text-[13px] text-fg-2 font-mono">
        {source.author && <span>By {source.author}</span>}
        <span>Added {new Date(source.created_at).toLocaleDateString()}</span>
        {source.source_url && (
          <a href={source.source_url} target="_blank" rel="noreferrer" className="text-accent inline-flex items-center gap-1.5 hover:underline">
            <Icon name="ext" size={12} /> Original URL
          </a>
        )}
      </div>

      <div ref={contentRef} className="prose-doc max-w-none mt-8">
        <Markdown content={source.content} />
      </div>
    </div>
  );
}
