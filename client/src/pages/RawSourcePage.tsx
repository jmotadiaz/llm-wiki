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

  const containerRef = useRef<HTMLDivElement>(null);
  const userInteractedRef = useRef(false);

  useEffect(() => {
    const handleInteraction = () => { if (!userInteractedRef.current) userInteractedRef.current = true; };
    window.addEventListener("wheel", handleInteraction, { passive: true, capture: true });
    window.addEventListener("touchmove", handleInteraction, { passive: true, capture: true });
    window.addEventListener("mousedown", handleInteraction, { capture: true });
    window.addEventListener("keydown", handleInteraction, { capture: true });
    return () => {
      window.removeEventListener("wheel", handleInteraction, { capture: true });
      window.removeEventListener("touchmove", handleInteraction, { capture: true });
      window.removeEventListener("mousedown", handleInteraction, { capture: true });
      window.removeEventListener("keydown", handleInteraction, { capture: true });
    };
  }, []);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/raw/${id}`)
      .then(r => r.json() as Promise<{ source: RawSource; error?: string }>)
      .then(data => {
        if (data.error) throw new Error(data.error);
        setSource(data.source);
        setLoading(false);
      })
      .catch(err => { setError(err.message); setLoading(false); });
  }, [id]);

  useEffect(() => { userInteractedRef.current = false; }, [location.hash, id]);

  useEffect(() => {
    if (!source || !location.hash || !containerRef.current) return;
    const fragment = decodeURIComponent(location.hash.slice(1));
    const scrollToFragment = () => {
      if (userInteractedRef.current) return;
      const element = document.getElementById(fragment);
      if (element) element.scrollIntoView({ block: "start" });
    };
    const resizeObserver = new ResizeObserver(scrollToFragment);
    const mutationObserver = new MutationObserver(scrollToFragment);
    resizeObserver.observe(containerRef.current);
    mutationObserver.observe(containerRef.current, { childList: true, subtree: true });
    const frameId = requestAnimationFrame(scrollToFragment);
    return () => { resizeObserver.disconnect(); mutationObserver.disconnect(); cancelAnimationFrame(frameId); };
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

      <div ref={containerRef} className="card p-5 md:p-6 mt-6">
        <div className="prose-doc max-w-none">
          <Markdown content={source.content} />
        </div>
      </div>
    </div>
  );
}
