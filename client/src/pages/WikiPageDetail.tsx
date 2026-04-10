import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import Markdown from '../components/markdown/Markdown';

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
  };
  backlinks: Array<{ slug: string; title: string }>;
  outgoingLinks: string[];
  sources: Array<{ id: number; title: string; author: string; created_at: string }>;
  lintIssues: Array<{ type: string; message: string; severity: string }>;
}


export default function WikiPageDetail() {
  const { slug } = useParams<{ slug: string }>();
  const [data, setData] = useState<PageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
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
  }, [slug]);

  if (loading) return <p className="text-gray-500">Loading...</p>;
  if (error) return <p className="text-red-500">Error: {error}</p>;
  if (!data) return <p className="text-gray-500">Page not found</p>;

  const { page, backlinks, sources, lintIssues } = data;

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
        <div className="flex gap-2 mt-2 flex-wrap">
          <span className="px-2 py-0.5 text-xs rounded bg-gray-200 dark:bg-gray-800">{page.type}</span>
          <span className={`px-2 py-0.5 text-xs rounded ${page.status === 'published' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' : 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700'}`}>
            {page.status}
          </span>
          {page.tags.map(t => (
            <span key={t} className="px-2 py-0.5 text-xs rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400">{t}</span>
          ))}
        </div>
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
    </div>
  );
}
