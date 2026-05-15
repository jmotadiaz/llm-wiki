import { useState, useEffect, useMemo } from 'react';
import { useParams, Link, useLocation } from 'react-router-dom';
import Markdown from '../components/markdown/Markdown';
import CommentSection from '../components/CommentSection';
import { displayTag } from '../utils/tagUtils';
import { useSidebarExtras } from '../components/SidebarContext';
import Icon from '../components/Icon';
import { getHeadingId } from '@llm-wiki/shared';
import { scrollToFragment, scrollToCurrentHash } from '../utils/scrollToFragment';

interface PageData {
  page: {
    slug: string;
    title: string;
    type: string;
    status: string;
    tags: string[];
    content: string;
    created_at: string;
    updated_at: string;
    generated_at: string | null;
  };
  backlinks: Array<{ slug: string; title: string }>;
  outgoingLinks: string[];
  sources: Array<{ id: number; title: string; author: string; created_at: string }>;
  lintIssues: Array<{ type: string; message: string; severity: string }>;
}

function isLearningPath(type: string): boolean {
  return type === "learning-path";
}

interface TocItem { id: string; text: string; level: 2 | 3 | 4 }

function extractToc(markdown: string): TocItem[] {
  const items: TocItem[] = [];
  // Skip fenced code blocks
  const lines = markdown.split('\n');
  let inFence = false;
  for (const line of lines) {
    if (/^\s*```/.test(line)) { inFence = !inFence; continue; }
    if (inFence) continue;
    const m = /^(#{2,4})\s+(.+?)\s*#*\s*$/.exec(line);
    if (!m) continue;
    const level = m[1].length as 2 | 3 | 4;
    const text = m[2].trim();
    items.push({ id: getHeadingId(text), text, level });
  }
  return items;
}

const TONE_BY_ROLE: Record<string, string> = {
  discipline: 'tag-accent',
  topic: 'tag-green',
  axis: 'tag-violet',
};

function tagTone(role: string, idx: number): string {
  if (TONE_BY_ROLE[role]) return TONE_BY_ROLE[role];
  const fallback = ['tag-cyan', 'tag-violet', 'tag-green', 'tag-red'];
  return fallback[idx % fallback.length];
}

export default function WikiPageDetail() {
  const { slug } = useParams<{ slug: string }>();
  const location = useLocation();
  const [data, setData] = useState<PageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [regenerating, setRegenerating] = useState(false);
  const [regenError, setRegenError] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);

  function loadPage() {
    if (!slug) return;
    setLoading(true);
    fetch(`/api/wiki/${slug}`)
      .then(r => r.json() as Promise<PageData & { error?: string }>)
      .then(d => {
        if (d.error) throw new Error(d.error);
        setData(d);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }

  useEffect(() => { loadPage(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [slug]);

  // Scroll to hash fragment on initial load and when the hash changes
  // (browser back/forward navigation). Does nothing if there is no hash.
  useEffect(() => {
    if (!data) return;
    const raf = requestAnimationFrame(() => {
      scrollToCurrentHash('smooth');
    });
    return () => cancelAnimationFrame(raf);
  }, [data, location.hash]);

  const toc = useMemo(() => data ? extractToc(data.page.content) : [], [data]);

  // Scrollspy: highlight current TOC item
  useEffect(() => {
    if (toc.length === 0) return;
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter(e => e.isIntersecting);
      if (visible.length === 0) return;
      visible.sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      setActiveId(visible[0].target.id);
    }, { rootMargin: '-80px 0px -60% 0px', threshold: [0, 1] });

    const els: HTMLElement[] = [];
    for (const item of toc) {
      const el = document.getElementById(item.id);
      if (el) { observer.observe(el); els.push(el); }
    }
    return () => { els.forEach(el => observer.unobserve(el)); observer.disconnect(); };
  }, [toc]);

  const tocNode = (
    <div>
      <div className="mono-label px-2.5 mb-2">En esta página</div>
      {toc.length === 0 ? (
        <div className="px-2.5 text-fg-3 text-xs">Sin encabezados</div>
      ) : (
        <nav className="flex flex-col gap-px">
          {toc.map((t, i) => (
            <a
              key={`${t.id}-${i}`}
              href={`#${t.id}`}
              className={"sb-link"
                + (t.level === 3 ? " indent-1" : t.level === 4 ? " indent-2" : "")
                + (t.id === activeId ? " active" : "")}
              onClick={(e) => {
                e.preventDefault();
                window.history.replaceState(null, '', `#${t.id}`);
                scrollToFragment(t.id);
              }}
            >
              <span className="truncate">{t.text}</span>
            </a>
          ))}
        </nav>
      )}
    </div>
  );

  useSidebarExtras(tocNode, [toc, activeId]);

  async function handleRegenerate() {
    setRegenerating(true);
    setRegenError('');
    try {
      const res = await fetch('/api/learning-paths/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'review' }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || `Regeneration failed (${res.status})`);
      }
      loadPage();
    } catch (err: any) {
      setRegenError(err.message);
    } finally {
      setRegenerating(false);
    }
  }

  if (loading) return <p className="text-fg-3">Cargando…</p>;
  if (error) return <p className="text-red">Error: {error}</p>;
  if (!data) return <p className="text-fg-3">Página no encontrada</p>;

  const { page, backlinks, sources, lintIssues } = data;
  const isLearningPathPage = isLearningPath(page.type);

  const domainTag = page.tags.find(t => t.startsWith('d:'));
  const domainLabel = domainTag ? displayTag(domainTag).label : null;

  return (
    <div className="max-w-[760px]">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-[13px] text-fg-2 font-mono mb-3.5 flex-wrap">
        {isLearningPathPage ? (
          <>
            <Link to="/learning-paths" className="hover:text-fg">Learning paths</Link>
            <span className="text-fg-3">/</span>
            <span className="text-fg-1">{page.slug}</span>
          </>
        ) : (
          <>
            <Link to="/" className="hover:text-fg">Wiki</Link>
            {domainLabel && (
              <>
                <span className="text-fg-3">/</span>
                <Link to={`/?domain=${encodeURIComponent(domainLabel)}`} className="hover:text-fg">{domainLabel}</Link>
              </>
            )}
            <span className="text-fg-3">/</span>
            <span className="text-fg-1">{page.slug}</span>
          </>
        )}
      </div>

      {/* Page header */}
      <div className="border-b border-line pb-6 mb-8">
        <div className="eyebrow mb-3">{page.type}</div>
        <h1 className="text-3xl md:text-[38px] font-extrabold leading-tight tracking-tight m-0">{page.title}</h1>
        <div className="flex flex-wrap gap-y-[9px] gap-x-1.5 mt-3.5">
          <span className={"tag " + (page.status === 'published' ? 'tag-accent' : 'tag-green')}>
            {page.status}
          </span>
          {page.tags.map((rawTag, i) => {
            const t = displayTag(rawTag);
            let link = `/?`;
            if (t.role === 'discipline') link += `domain=${encodeURIComponent(t.label)}`;
            else if (t.role === 'topic') link += `topics=${encodeURIComponent(t.label)}`;
            else link += `tag=${encodeURIComponent(t.raw)}`;
            return (
              <Link key={t.raw} to={link} className={"tag " + tagTone(t.role, i) + " hover:brightness-110"}>
                {t.label}
              </Link>
            );
          })}
        </div>

        {isLearningPathPage && (
          <div className="mt-4 flex items-center gap-3 flex-wrap">
            {page.generated_at && (
              <span className="text-xs text-fg-3 font-mono">
                Generado el {new Date(page.generated_at).toLocaleString()}
              </span>
            )}
            <button
              type="button"
              onClick={handleRegenerate}
              disabled={regenerating}
              className="btn btn-outline text-xs py-1.5 px-3"
            >
              <Icon name="refresh" size={12} />
              {regenerating ? 'Regenerando…' : 'Regenerar'}
            </button>
          </div>
        )}
        {regenError && (
          <div className="mt-3 p-2.5 border border-red-soft bg-red-soft text-red rounded-md text-xs">{regenError}</div>
        )}
      </div>

      {/* Lint warnings */}
      {lintIssues.length > 0 && (
        <div className="mb-6 p-3.5 border border-amber/30 rounded-md bg-bg-1">
          <p className="font-semibold text-amber mb-1 text-sm">Lint Warnings ({lintIssues.length})</p>
          {lintIssues.map((issue, i) => (
            <p key={i} className="text-fg-2 text-xs mt-1">
              <span className="font-mono uppercase">{issue.type}</span>: {issue.message}
            </p>
          ))}
        </div>
      )}

      {/* Content */}
      <div className="prose-doc max-w-none">
        <Markdown content={page.content} />
      </div>

      {/* Backlinks + Sources */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-10">
        {backlinks.length > 0 && (
          <div className="card p-4">
            <h3 className="text-sm font-bold mb-2 text-fg">Backlinks ({backlinks.length})</h3>
            <ul className="space-y-1.5">
              {backlinks.map(bl => (
                <li key={bl.slug}>
                  <Link to={`/wiki/${bl.slug}`} className="text-sm text-accent hover:underline">
                    {bl.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
        {sources.length > 0 && (
          <div className="card p-4">
            <h3 className="text-sm font-bold mb-2 text-fg">Sources ({sources.length})</h3>
            <ul className="space-y-1.5">
              {sources.map(src => (
                <li key={src.id}>
                  <Link to={`/raw/${src.id}`} className="text-sm text-accent hover:underline">
                    {src.title}
                    {src.author && <span className="text-fg-3 ml-1">— {src.author}</span>}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="mt-6 text-xs text-fg-3 font-mono">
        Created: {new Date(page.created_at).toLocaleDateString()} · Updated: {new Date(page.updated_at).toLocaleDateString()}
      </div>

      <CommentSection slug={slug!} />
    </div>
  );
}
