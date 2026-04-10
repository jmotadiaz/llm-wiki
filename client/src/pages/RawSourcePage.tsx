import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import Markdown from '../components/markdown/Markdown';

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
  const [source, setSource] = useState<RawSource | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    fetch(`/api/raw/${id}`)
      .then(r => r.json() as Promise<{ source: RawSource; error?: string }>)
      .then(data => {
        if (data.error) throw new Error(data.error);
        setSource(data.source);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, [id]);

  if (loading) return <p className="text-gray-500">Loading...</p>;
  if (error) return <p className="text-red-500">Error: {error}</p>;
  if (!source) return <p className="text-gray-500">Source not found</p>;

  return (
    <div className="max-w-3xl">
      <div className="mb-4">
        <Link to="/wiki" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">Wiki</Link>
        <span className="text-gray-400 mx-2 text-sm">/</span>
        <span className="text-sm text-gray-500">Raw Source #{source.id}</span>
      </div>

      <h2 className="text-2xl font-bold mb-2">{source.title}</h2>
      <div className="text-sm text-gray-500 dark:text-gray-400 mb-4 space-x-3">
        {source.author && <span>By {source.author}</span>}
        <span>Added {new Date(source.created_at).toLocaleDateString()}</span>
        {source.source_url && (
          <a href={source.source_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">
            Original URL
          </a>
        )}
      </div>

      <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded p-4">
        <Markdown content={source.content} />
      </div>
    </div>
  );
}
