import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

interface WikiPageEntry {
  slug: string;
  title: string;
  type: string;
  tags: string[];
  status: string;
}

export default function WikiPage() {
  const [pages, setPages] = useState<WikiPageEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tagFilter, setTagFilter] = useState('');

  useEffect(() => {
    fetch('/api/wiki')
      .then(r => r.json() as Promise<{ pages: WikiPageEntry[] }>)
      .then(data => {
        setPages(data.pages || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Collect all unique tags
  const allTags = [...new Set(pages.flatMap(p => p.tags))].sort();

  const filtered = pages.filter(p => {
    const matchSearch = !search || p.title.toLowerCase().includes(search.toLowerCase()) || p.slug.includes(search.toLowerCase());
    const matchTag = !tagFilter || p.tags.includes(tagFilter);
    return matchSearch && matchTag;
  });

  // Group by first tag (or "untagged")
  const grouped: Record<string, WikiPageEntry[]> = {};
  for (const p of filtered) {
    const group = p.tags[0] || 'untagged';
    (grouped[group] ??= []).push(p);
  }

  if (loading) return <p className="text-gray-500">Loading...</p>;

  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">Wiki Index</h2>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{pages.length} pages</p>

      {/* Search & filter */}
      <div className="flex gap-3 mb-6">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search pages..."
          className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-900 text-sm"
        />
        <select
          value={tagFilter}
          onChange={e => setTagFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-900 text-sm"
        >
          <option value="">All tags</option>
          {allTags.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      {filtered.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400 text-sm">No pages found.</p>
      ) : (
        Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([group, items]) => (
          <div key={group} className="mb-6">
            <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">{group}</h3>
            <div className="space-y-1">
              {items.map(p => (
                <Link
                  key={p.slug}
                  to={`/wiki/${p.slug}`}
                  className="block p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-sm"
                >
                  <span className="font-medium">{p.title}</span>
                  <span className="text-gray-400 ml-2 text-xs">{p.type}</span>
                  {p.tags.length > 0 && (
                    <span className="ml-2 text-xs text-gray-400">{p.tags.join(', ')}</span>
                  )}
                </Link>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
