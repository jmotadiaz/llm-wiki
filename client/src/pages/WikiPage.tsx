import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQueryState } from 'nuqs';

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
  const [tagFilter, setTagFilter] = useQueryState('tag', { defaultValue: '' });
  const navigate = useNavigate();

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

  function handleTagClick(e: React.MouseEvent, tag: string) {
    e.preventDefault();
    e.stopPropagation();
    setTagFilter(tagFilter === tag ? '' : tag);
  }

  if (loading) return <p className="text-gray-500">Loading...</p>;

  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">Wiki Index</h2>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{pages.length} pages</p>

      {/* Search & filter */}
      <div className="flex flex-col md:flex-row gap-3 mb-6">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search pages..."
          className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-900 text-sm"
        />
        <select
          value={tagFilter}
          onChange={e => setTagFilter(e.target.value || null)}
          className="md:w-auto px-3 py-2 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-900 text-sm"
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
                  {p.tags.map(tag => (
                    <button
                      key={tag}
                      onClick={e => handleTagClick(e, tag)}
                      className={`ml-1 text-xs px-1.5 py-0.5 rounded cursor-pointer transition-colors ${
                        tagFilter === tag
                          ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300'
                          : 'text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                      }`}
                    >
                      {tag}
                    </button>
                  ))}
                </Link>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
