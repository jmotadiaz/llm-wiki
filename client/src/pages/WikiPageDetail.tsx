import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import Markdown from '../components/markdown/Markdown';
import CommentSection from '../components/CommentSection';
import { displayTag, getTagColorClass } from '../utils/tagUtils';

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

function extractDomainFromIndexSlug(slug: string, type: string): string | null {
  if (type === "domain-index") {
    const prefix = "domain-index-";
    return slug.startsWith(prefix) ? slug.slice(prefix.length) : null;
  }
  if (type === "learning-path") {
    const prefix = "learning-path-";
    return slug.startsWith(prefix) ? slug.slice(prefix.length) : null;
  }
  return null;
}


export default function WikiPageDetail() {
  const { slug } = useParams<{ slug: string }>();
  const [data, setData] = useState<PageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [regenerating, setRegenerating] = useState(false);
  const [regenError, setRegenError] = useState('');

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

  useEffect(() => {
    loadPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  async function handleRegenerate(domain: string) {
    setRegenerating(true);
    setRegenError('');
    try {
      const res = await fetch('/api/index/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain }),
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

  if (loading) return <p className="text-gray-500">Loading...</p>;
  if (error) return <p className="text-red-500">Error: {error}</p>;
  if (!data) return <p className="text-gray-500">Page not found</p>;

  const { page, backlinks, sources, lintIssues } = data;
  const isIndexPage = page.type === 'domain-index' || page.type === 'learning-path';
  const domainKey = extractDomainFromIndexSlug(page.slug, page.type);

  return (
    <div className="max-w-3xl">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <Link to="/" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">Wiki</Link>
          <span className="text-gray-400 text-sm">/</span>
          <span className="text-sm text-gray-500">{slug}</span>
        </div>
        <h2 className="text-2xl font-bold">{page.title}</h2>
        <div className="flex gap-2 mt-2 flex-wrap items-center">
          <span className="px-2 py-0.5 text-xs rounded bg-gray-200 dark:bg-gray-800">{page.type}</span>
          <span className={`px-2 py-0.5 text-xs rounded ${page.status === 'published' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' : 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700'}`}>
            {page.status}
          </span>
          {page.tags.map(rawTag => {
            const t = displayTag(rawTag);
            let link = `/?`;
            if (t.role === 'discipline') link += `domain=${encodeURIComponent(t.label)}`;
            else if (t.role === 'topic') link += `topics=${encodeURIComponent(t.label)}`;
            else link += `tag=${encodeURIComponent(t.raw)}`;
            
            return (
              <Link key={t.raw} to={link} className={`px-2 py-0.5 text-xs rounded ${getTagColorClass(t.role)} hover:brightness-95 dark:hover:brightness-110`}>
                {t.label}
              </Link>
            )
          })}
        </div>
        {isIndexPage && (
          <div className="mt-3 flex items-center gap-3 flex-wrap">
            {page.generated_at && (
              <span className="text-xs text-gray-500 dark:text-gray-400">
                Generado el {new Date(page.generated_at).toLocaleString()}
              </span>
            )}
            {domainKey && (
              <button
                type="button"
                onClick={() => handleRegenerate(domainKey)}
                disabled={regenerating}
                className="px-3 py-1 text-xs rounded bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white transition-colors"
              >
                {regenerating ? 'Regenerando...' : 'Regenerar'}
              </button>
            )}
          </div>
        )}
        {regenError && (
          <div className="mt-2 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-xs text-red-700 dark:text-red-400">
            {regenError}
          </div>
        )}
      </div>

      {/* Lint warnings */}
      {lintIssues.length > 0 && (
        <div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded text-sm">
          <p className="font-medium text-yellow-700 dark:text-yellow-400 mb-1">Lint Warnings ({lintIssues.length})</p>
          {lintIssues.map((issue, i) => (
            <p key={i} className="text-yellow-600 dark:text-yellow-500 text-xs">{issue.type}: {issue.message}</p>
          ))}
        </div>
      )}

      {/* Content */}
      <div className="mb-8">
        <Markdown content={page.content} />
      </div>

      {/* Sidebar panels */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Backlinks */}
        {backlinks.length > 0 && (
          <div className="border border-gray-200 dark:border-gray-800 rounded p-4">
            <h3 className="text-sm font-semibold mb-2">Backlinks ({backlinks.length})</h3>
            {backlinks.map(bl => (
              <Link key={bl.slug} to={`/wiki/${bl.slug}`} className="block text-sm text-blue-600 dark:text-blue-400 hover:underline">
                {bl.title}
              </Link>
            ))}
          </div>
        )}

        {/* Sources */}
        {sources.length > 0 && (
          <div className="border border-gray-200 dark:border-gray-800 rounded p-4">
            <h3 className="text-sm font-semibold mb-2">Sources ({sources.length})</h3>
            {sources.map(src => (
              <Link key={src.id} to={`/raw/${src.id}`} className="block text-sm text-blue-600 dark:text-blue-400 hover:underline">
                {src.title} {src.author && <span className="text-gray-400">by {src.author}</span>}
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Metadata */}
      <div className="mt-4 text-xs text-gray-400">
        Created: {new Date(page.created_at).toLocaleDateString()} | Updated: {new Date(page.updated_at).toLocaleDateString()}
      </div>

      {/* Comment section */}
      <CommentSection slug={slug!} />
    </div>
  );
}
