import { useState, useRef } from 'react';

type IngestTab = 'url' | 'upload' | 'paste';
type IngestStatus = 'idle' | 'fetching' | 'preview' | 'saving' | 'done' | 'error';

export default function IngestPage() {
  const [tab, setTab] = useState<IngestTab>('url');
  const [status, setStatus] = useState<IngestStatus>('idle');
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ sourceId: number; message: string } | null>(null);

  // URL form state
  const [url, setUrl] = useState('');
  const [selector, setSelector] = useState('');

  // Shared form state (used for both URL preview and paste)
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [description, setDescription] = useState('');
  const [publishedAt, setPublishedAt] = useState('');
  const [content, setContent] = useState('');

  // File upload ref
  const fileRef = useRef<HTMLInputElement>(null);

  const resetForm = () => {
    setUrl('');
    setSelector('');
    setTitle('');
    setAuthor('');
    setDescription('');
    setPublishedAt('');
    setContent('');
    setError('');
    setResult(null);
    setStatus('idle');
    if (fileRef.current) fileRef.current.value = '';
  };

  // Step 1: Fetch URL preview via Jina
  const handleFetchUrl = async () => {
    if (!url.trim()) return;
    setStatus('fetching');
    setError('');
    try {
      const res = await fetch('/api/ingest/url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim(), targetSelector: selector.trim() || undefined }),
      });
      const data = await res.json() as any;
      if (!res.ok) throw new Error(data.error || 'Failed to fetch URL');

      const { title: fetchedTitle, description: fetchedDesc, author: fetchedAuthor, publishedTime, fullContent } = data.preview;

      setContent(fullContent);
      setTitle(fetchedTitle || url.trim());
      setDescription(fetchedDesc || '');
      setAuthor(fetchedAuthor || '');

      if (publishedTime) {
        try {
          const date = new Date(publishedTime);
          if (!isNaN(date.getTime())) {
            setPublishedAt(date.toISOString().split('T')[0]);
          }
        } catch (e) {
          console.error('Failed to parse date:', publishedTime);
        }
      }

      setStatus('preview');
      setTab('paste'); // Switch to paste tab to show the fetched content
    } catch (err: any) {
      setError(err.message);
      setStatus('error');
    }
  };

  // Step 2: Save content (from URL preview or direct paste)
  const handleSave = async () => {
    if (!title.trim() || !content.trim()) {
      setError('Title and content are required');
      return;
    }
    setStatus('saving');
    setError('');
    try {
      const res = await fetch('/api/ingest/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          author: author.trim() || undefined,
          description: description.trim() || undefined,
          publishedAt: publishedAt || undefined,
          sourceUrl: url.trim() || undefined,
          content,
        }),
      });
      const data = await res.json() as any;
      if (!res.ok) throw new Error(data.error || 'Failed to save');
      setResult({ sourceId: data.sourceId, message: data.message });
      setStatus('done');
    } catch (err: any) {
      setError(err.message);
      setStatus('error');
    }
  };

  // File upload handler
  const handleUpload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file || !title.trim()) {
      setError('File and title are required');
      return;
    }
    setStatus('saving');
    setError('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('title', title.trim());
      if (author.trim()) formData.append('author', author.trim());

      const res = await fetch('/api/ingest/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json() as any;
      if (!res.ok) throw new Error(data.error || 'Failed to upload');
      setResult({ sourceId: data.sourceId, message: data.message });
      setStatus('done');
    } catch (err: any) {
      setError(err.message);
      setStatus('error');
    }
  };

  return (
    <div className="max-w-3xl">
      <h2 className="text-2xl font-bold mb-6">Ingest Sources</h2>

      {/* Tab switcher */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => { setTab('url'); resetForm(); }}
          className={`px-4 py-2 rounded font-medium ${tab === 'url' ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300'}`}
        >
          From URL
        </button>
        <button
          onClick={() => { setTab('upload'); resetForm(); }}
          className={`px-4 py-2 rounded font-medium ${tab === 'upload' ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300'}`}
        >
          Upload File
        </button>
        <button
          onClick={() => { setTab('paste'); resetForm(); }}
          className={`px-4 py-2 rounded font-medium ${tab === 'paste' ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300'}`}
        >
          Paste Text
        </button>
      </div>

      {/* Error display */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-red-700 dark:text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Success display */}
      {status === 'done' && result && (
        <div className="mb-4 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded text-green-700 dark:text-green-400 text-sm">
          <p className="font-medium">Source saved (ID: {result.sourceId})</p>
          <p>{result.message}</p>
          <button onClick={resetForm} className="mt-2 text-green-600 dark:text-green-400 underline text-sm">
            Ingest another
          </button>
        </div>
      )}

      {/* URL Tab */}
      {tab === 'url' && status !== 'done' && (
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1">URL</label>
            <input
              type="url"
              value={url}
              onChange={e => setUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleFetchUrl()}
              placeholder="https://example.com/article"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-900 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">CSS Selector (optional)</label>
            <input
              type="text"
              value={selector}
              onChange={e => setSelector(e.target.value)}
              placeholder="article.post-content"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-900 text-sm"
            />
          </div>
          <button
            onClick={handleFetchUrl}
            disabled={!url.trim() || status === 'fetching'}
            className="px-4 py-2 bg-blue-600 text-white rounded font-medium disabled:opacity-50"
          >
            {status === 'fetching' ? 'Fetching...' : 'Generate Preview'}
          </button>
        </div>
      )}

      {/* Paste Text Tab */}
      {tab === 'paste' && status !== 'done' && (
        <div className="space-y-3">
          {status === 'preview' && url && (
            <div className="p-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded text-blue-700 dark:text-blue-400 text-xs">
              Content fetched from: {url}
            </div>
          )}
          <div className="flex flex-col md:flex-row gap-3">
            <div className="flex-1">
              <label className="block text-sm font-medium mb-1">Title</label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Document title"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-900 text-sm"
              />
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium mb-1">Author (optional)</label>
              <input
                type="text"
                value={author}
                onChange={e => setAuthor(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-900 text-sm"
              />
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium mb-1">Published Date (optional)</label>
              <input
                type="date"
                value={publishedAt}
                onChange={e => setPublishedAt(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-900 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Description (optional)</label>
            <input
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-900 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">
              Content ({content.length.toLocaleString()} chars)
            </label>
            <textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              rows={20}
              placeholder="Paste your text or markdown here..."
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-900 text-sm font-mono"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={status === 'saving'}
              className="px-4 py-2 bg-green-600 text-white rounded font-medium disabled:opacity-50"
            >
              {status === 'saving' ? 'Saving & Ingesting...' : 'Save & Ingest'}
            </button>
            <button
              onClick={resetForm}
              className="px-4 py-2 bg-gray-200 dark:bg-gray-800 rounded font-medium"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Upload Tab */}
      {tab === 'upload' && status !== 'done' && (
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1">Title</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Source document title"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-900 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Author (optional)</label>
            <input
              type="text"
              value={author}
              onChange={e => setAuthor(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-900 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Markdown File (.md)</label>
            <input
              ref={fileRef}
              type="file"
              accept=".md,.markdown,.txt"
              className="w-full text-sm"
            />
          </div>
          <button
            onClick={handleUpload}
            disabled={!title.trim() || status === 'saving'}
            className="px-4 py-2 bg-green-600 text-white rounded font-medium disabled:opacity-50"
          >
            {status === 'saving' ? 'Uploading & Ingesting...' : 'Upload & Ingest'}
          </button>
        </div>
      )}

      {/* Loading indicator */}
      {status === 'saving' && (
        <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded text-blue-700 dark:text-blue-400 text-sm">
          Processing... The LLM ingest pipeline will compile wiki pages in the background.
        </div>
      )}
    </div>
  );
}
