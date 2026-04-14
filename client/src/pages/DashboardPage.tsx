import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

interface RawSource {
  id: number;
  title: string;
  author: string | null;
  created_at: string;
  checksum: string;
}

interface WikiPageEntry {
  slug: string;
  title: string;
}

export default function DashboardPage() {
  const [sources, setSources] = useState<RawSource[]>([]);
  const [pages, setPages] = useState<WikiPageEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [sourcesRes, pagesRes] = await Promise.all([
        fetch('/api/raw'),
        fetch('/api/wiki')
      ]);

      const sourcesData = await sourcesRes.json();
      const pagesData = await pagesRes.json();

      setSources(sourcesData.sources || []);
      setPages(pagesData.pages || []);
    } catch (err: any) {
      setError("Failed to fetch dashboard data");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleDeleteSource = async (id: number) => {
    if (!confirm("Are you sure you want to delete this raw source? This will remove all associated content and metadata.")) {
      return;
    }

    setDeletingId(id);
    try {
      const res = await fetch(`/api/raw/${id}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        throw new Error("Failed to delete source");
      }

      setSources(sources.filter(s => s.id !== id));
    } catch (err: any) {
      alert("Error: " + err.message);
    } finally {
      setDeletingId(null);
    }
  };

  if (loading && sources.length === 0) {
    return <div className="p-8 text-gray-500">Loading dashboard...</div>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold mb-4">Dashboard</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white dark:bg-gray-900 p-6 rounded-lg border border-gray-200 dark:border-gray-800 shadow-sm">
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Total Wiki Pages</h3>
            <p className="text-3xl font-bold mt-2">{pages.length}</p>
          </div>
          <div className="bg-white dark:bg-gray-900 p-6 rounded-lg border border-gray-200 dark:border-gray-800 shadow-sm">
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Raw Sources</h3>
            <p className="text-3xl font-bold mt-2">{sources.length}</p>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded border border-red-200 dark:border-red-800">
          {error}
        </div>
      )}

      <div>
        <h3 className="text-xl font-semibold mb-4">Manage Raw Sources</h3>
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-800">
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">ID</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Title</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Date Added</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
              {sources.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-gray-500">No raw sources found.</td>
                </tr>
              ) : (
                sources.sort((a,b) => b.id - a.id).map(source => (
                  <tr key={source.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 font-mono">#{source.id}</td>
                    <td className="px-4 py-3 text-sm">
                      <Link to={`/raw/${source.id}`} className="font-medium text-blue-600 dark:text-blue-400 hover:underline">
                        {source.title}
                      </Link>
                      {source.author && <div className="text-xs text-gray-400 mt-0.5">by {source.author}</div>}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                      {new Date(source.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-sm text-right">
                      <button
                        onClick={() => handleDeleteSource(source.id)}
                        disabled={deletingId === source.id}
                        className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 font-medium disabled:opacity-50"
                      >
                        {deletingId === source.id ? "Deleting..." : "Delete"}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
