import { useState, useRef } from 'react';
import Icon from '../components/Icon';

type IngestTab = 'url' | 'upload' | 'paste';
type IngestStatus = 'idle' | 'fetching' | 'preview' | 'saving' | 'done' | 'error';

export default function IngestPage() {
  const [tab, setTab] = useState<IngestTab>('url');
  const [status, setStatus] = useState<IngestStatus>('idle');
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ sourceId: number; message: string } | null>(null);

  const [url, setUrl] = useState('');
  const [selector, setSelector] = useState('');
  const [removeSelector, setRemoveSelector] = useState('');
  const [disableFilters, setDisableFilters] = useState(false);

  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [description, setDescription] = useState('');
  const [publishedAt, setPublishedAt] = useState('');
  const [content, setContent] = useState('');

  const fileRef = useRef<HTMLInputElement>(null);

  const resetForm = () => {
    setUrl(''); setSelector(''); setRemoveSelector(''); setDisableFilters(false);
    setTitle(''); setAuthor(''); setDescription(''); setPublishedAt(''); setContent('');
    setError(''); setResult(null); setStatus('idle');
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleFetchUrl = async () => {
    if (!url.trim()) return;
    setStatus('fetching');
    setError('');
    try {
      const res = await fetch('/api/ingest/url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: url.trim(),
          targetSelector: selector.trim() || undefined,
          removeSelectors: removeSelector.trim() || undefined,
          disableFilters,
        }),
      });
      const data = await res.json() as any;
      if (!res.ok) throw new Error(data.error || 'Failed to fetch URL');
      const { title: t, description: d, author: a, publishedTime, fullContent } = data.preview;
      setContent(fullContent);
      setTitle(t || url.trim());
      setDescription(d || '');
      setAuthor(a || '');
      if (publishedTime) {
        try {
          const date = new Date(publishedTime);
          if (!isNaN(date.getTime())) setPublishedAt(date.toISOString().split('T')[0]);
        } catch {}
      }
      setStatus('preview');
      setTab('paste');
    } catch (err: any) {
      setError(err.message);
      setStatus('error');
    }
  };

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

  const handleUpload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file || !title.trim()) { setError('File and title are required'); return; }
    setStatus('saving');
    setError('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('title', title.trim());
      if (author.trim()) formData.append('author', author.trim());
      const res = await fetch('/api/ingest/upload', { method: 'POST', body: formData });
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
    <div className="max-w-[760px]">
      <div className="eyebrow mb-3">Ingest</div>
      <h1 className="text-3xl md:text-[38px] font-extrabold leading-tight tracking-tight">Importar nuevas fuentes</h1>
      <p className="text-fg-2 text-[15px] mt-2 max-w-[60ch]">
        Pega un enlace, sube un fichero o introduce el contenido manualmente para añadir conocimiento a la wiki.
      </p>

      <div className="seg mt-6 inline-flex bg-bg-1 border border-line rounded-[10px] p-[3px]">
        {(['url','upload','paste'] as const).map(t => (
          <button
            key={t}
            onClick={() => { setTab(t); resetForm(); }}
            className={"px-3.5 py-1.5 text-[13px] font-semibold rounded-md transition-colors " + (tab === t ? "bg-bg-3 text-fg" : "text-fg-2 hover:text-fg")}
          >
            {t === 'url' ? 'Desde URL' : t === 'upload' ? 'Subir fichero' : 'Pegar texto'}
          </button>
        ))}
      </div>

      {error && (
        <div className="mt-5 p-3 border border-red-soft bg-red-soft text-red rounded-md text-sm">{error}</div>
      )}

      {status === 'done' && result && (
        <div className="mt-5 p-3 border border-green/30 bg-green-soft text-green rounded-md text-sm">
          <p className="font-semibold">Source guardado (ID: {result.sourceId})</p>
          <p>{result.message}</p>
          <button onClick={resetForm} className="link-btn mt-2 font-mono">Ingest another →</button>
        </div>
      )}

      {tab === 'url' && status !== 'done' && (
        <div className="mt-6 flex flex-col gap-3">
          <Field label="URL">
            <input
              type="url"
              value={url}
              onChange={e => setUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleFetchUrl()}
              placeholder="https://example.com/article"
              className="input"
            />
          </Field>
          <Field label="CSS Selector (opcional)">
            <input type="text" value={selector} onChange={e => setSelector(e.target.value)} placeholder="article.post-content" className="input" />
          </Field>
          <Field label="Selectores a excluir (opcional)" hint="Selectores adicionales a ignorar, separados por coma.">
            <input type="text" value={removeSelector} onChange={e => setRemoveSelector(e.target.value)} placeholder=".related-posts, #comments" className="input" />
          </Field>
          <div className="flex items-center gap-3 mt-1">
            <button
              type="button"
              role="switch"
              aria-checked={disableFilters}
              onClick={() => setDisableFilters(v => !v)}
              className={"relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors " + (disableFilters ? "bg-amber" : "bg-bg-3")}
            >
              <span className={"inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform " + (disableFilters ? "translate-x-5" : "translate-x-0")} />
            </button>
            <span className="text-sm">
              <span className="font-semibold text-fg">Desactivar filtros de ruido</span>
              <span className="ml-1 text-fg-2">
                {disableFilters ? '— se conservará todo el contenido' : '— se eliminan headers, footers, ads'}
              </span>
            </span>
          </div>
          <div>
            <button onClick={handleFetchUrl} disabled={!url.trim() || status === 'fetching'} className="btn btn-primary">
              {status === 'fetching' ? 'Obteniendo…' : 'Generar preview'}
            </button>
          </div>
        </div>
      )}

      {tab === 'paste' && status !== 'done' && (
        <div className="mt-6 flex flex-col gap-3">
          {status === 'preview' && url && (
            <div className="p-3 border border-accent-line bg-accent-soft text-accent rounded-md text-xs">
              Contenido obtenido desde: {url}
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field label="Título"><input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="Título del documento" className="input" /></Field>
            <Field label="Autor (opcional)"><input type="text" value={author} onChange={e => setAuthor(e.target.value)} className="input" /></Field>
            <Field label="Fecha publicación (opcional)"><input type="date" value={publishedAt} onChange={e => setPublishedAt(e.target.value)} className="input" /></Field>
          </div>
          <Field label="Descripción (opcional)">
            <input type="text" value={description} onChange={e => setDescription(e.target.value)} className="input" />
          </Field>
          <Field label={`Contenido (${content.length.toLocaleString()} caracteres)`}>
            <textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              rows={18}
              placeholder="Pega aquí texto o markdown…"
              className="input font-mono"
            />
          </Field>
          <div className="flex gap-2">
            <button onClick={handleSave} disabled={status === 'saving'} className="btn btn-primary">
              {status === 'saving' ? 'Guardando & ingiriendo…' : 'Guardar & ingerir'}
            </button>
            <button onClick={resetForm} className="btn">Cancelar</button>
          </div>
        </div>
      )}

      {tab === 'upload' && status !== 'done' && (
        <div className="mt-6 flex flex-col gap-3">
          <Field label="Título">
            <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="Título del documento" className="input" />
          </Field>
          <Field label="Autor (opcional)">
            <input type="text" value={author} onChange={e => setAuthor(e.target.value)} className="input" />
          </Field>
          <Field label="Fichero markdown (.md)">
            <div className="card p-8 border-dashed text-center">
              <Icon name="upload" size={24} className="mx-auto text-fg-2" />
              <div className="mt-2 font-bold text-fg">Selecciona un fichero</div>
              <div className="text-fg-3 text-[13px] mt-1">.md, .markdown, .txt</div>
              <input ref={fileRef} type="file" accept=".md,.markdown,.txt" className="mt-4 text-sm" />
            </div>
          </Field>
          <div>
            <button onClick={handleUpload} disabled={!title.trim() || status === 'saving'} className="btn btn-primary">
              {status === 'saving' ? 'Subiendo & ingiriendo…' : 'Subir & ingerir'}
            </button>
          </div>
        </div>
      )}

      {status === 'saving' && (
        <div className="mt-5 p-3 border border-cyan/30 bg-cyan-soft text-cyan rounded-md text-sm">
          Procesando… El pipeline LLM compilará las páginas wiki en segundo plano.
        </div>
      )}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mono-label mb-1.5">{label}</div>
      {children}
      {hint && <p className="text-xs text-fg-3 mt-1">{hint}</p>}
    </label>
  );
}
