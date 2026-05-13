import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../components/Icon';

interface LintWarning {
  id: number;
  type: string;
  message: string;
  severity: string;
  pageId: number | null;
  slug?: string;
}

interface LintData {
  counts: Record<string, number>;
  totalWarnings: number;
  lastRun: string;
  warnings: LintWarning[];
}

interface RawSource {
  id: number;
  title: string;
  author: string | null;
  source_url: string | null;
  created_at: string;
  checksum: string;
}

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState<'health' | 'sources'>('health');
  const [lint, setLint] = useState<LintData | null>(null);
  const [sources, setSources] = useState<RawSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [sourcesLoading, setSourcesLoading] = useState(false);
  const [auditing, setAuditing] = useState(false);
  const [auditResult, setAuditResult] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState('');
  const [sourceSearch, setSourceSearch] = useState('');

  const fetchLintStatus = () => {
    setLoading(true);
    fetch('/api/wiki/lint/status')
      .then(r => r.json() as Promise<{ lint: LintData }>)
      .then(data => { setLint(data.lint); setLoading(false); })
      .catch(() => setLoading(false));
  };

  const fetchSources = () => {
    setSourcesLoading(true);
    fetch('/api/raw')
      .then(r => r.json() as Promise<{ sources: RawSource[] }>)
      .then(data => { setSources(data.sources); setSourcesLoading(false); })
      .catch(() => setSourcesLoading(false));
  };

  useEffect(() => { fetchLintStatus(); }, []);
  useEffect(() => { if (activeTab === 'sources') fetchSources(); }, [activeTab]);

  const handleAudit = async () => {
    setAuditing(true);
    setAuditResult(null);
    try {
      const res = await fetch('/api/wiki/lint', { method: 'POST' });
      const data = await res.json() as any;
      if (!res.ok) throw new Error(data.error);
      const t1 = data.tier1?.issuesFound ?? 0;
      const t3 = data.tier3?.findingsFound ?? 0;
      setAuditResult(`Audit complete: ${t1} Tier 1 issues, ${t3} Tier 3 findings`);
      fetchLintStatus();
    } catch (err: any) {
      setAuditResult(`Audit failed: ${err.message}`);
    } finally {
      setAuditing(false);
    }
  };

  const warningTypes = lint ? [...new Set(lint.warnings.map(w => w.type))].sort() : [];
  const filteredWarnings = lint ? (typeFilter ? lint.warnings.filter(w => w.type === typeFilter) : lint.warnings) : [];

  const filteredSources = sources.filter(s =>
    s.title.toLowerCase().includes(sourceSearch.toLowerCase()) ||
    (s.author && s.author.toLowerCase().includes(sourceSearch.toLowerCase()))
  );

  const kpis = lint ? [
    { num: lint.counts['orphan_page'] || 0, label: 'Orphan Pages', tone: 'warn' },
    { num: lint.counts['broken_link'] || 0, label: 'Broken Links', tone: 'danger' },
    { num: lint.counts['stale_page'] || 0, label: 'Stale Pages', tone: 'ok' },
    { num: lint.counts['missing_tags'] || 0, label: 'Missing Tags', tone: 'ok' },
    { num: lint.counts['invalid_metadata'] || 0, label: 'Invalid Metadata', tone: 'bad' },
    { num: (lint.counts['contradiction'] || 0) + (lint.counts['duplicate'] || 0), label: 'Contradictions', tone: 'info' },
  ] : [];

  const handleDelete = async (id: number) => {
    if (!confirm(`¿Eliminar la fuente #${id}? Se conservará el contenido distilado pero se quitarán sus citas.`)) return;
    try {
      const res = await fetch(`/api/raw/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
      fetchSources();
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div>
      <div className="dash-header flex items-center justify-between flex-wrap gap-4 mb-7">
        <div>
          <div className="eyebrow mb-3">Operations</div>
          <h1 className="text-3xl md:text-[38px] font-extrabold leading-tight tracking-tight m-0">Dashboard</h1>
          <p className="text-fg-2 text-sm mt-1.5">Salud semántica y trazabilidad de fuentes de tu base de conocimiento.</p>
        </div>
        <div className="seg inline-flex bg-bg-1 border border-line rounded-[10px] p-[3px]">
          <button onClick={() => setActiveTab('health')} className={"px-3.5 py-1.5 text-[13px] font-semibold rounded-md transition-colors " + (activeTab === 'health' ? 'bg-bg-3 text-fg' : 'text-fg-2 hover:text-fg')}>Wiki Health</button>
          <button onClick={() => setActiveTab('sources')} className={"px-3.5 py-1.5 text-[13px] font-semibold rounded-md transition-colors " + (activeTab === 'sources' ? 'bg-bg-3 text-fg' : 'text-fg-2 hover:text-fg')}>Raw Sources</button>
        </div>
      </div>

      {activeTab === 'health' && (
        loading || !lint ? <p className="text-fg-3">Cargando…</p> : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
              {kpis.map((k, i) => (
                <div key={i} className={"card p-4 kpi " + k.tone}>
                  <div className="num font-extrabold text-[32px] leading-none tracking-tight">{k.num}</div>
                  <div className="mono-label mt-2">{k.label}</div>
                </div>
              ))}
            </div>

            <div className="card p-4 flex items-center gap-4 flex-wrap mb-6">
              <button onClick={handleAudit} disabled={auditing} className="btn btn-primary">
                <Icon name="sparkle" size={14} />
                {auditing ? 'Running Semantic Audit…' : 'Run Full Semantic Audit'}
              </button>
              <div className="flex flex-col">
                <div className="font-bold text-sm text-fg">AI Consistency Check</div>
                <div className="font-mono text-[11.5px] text-fg-3 mt-0.5">Last run · {new Date(lint.lastRun).toLocaleString()}</div>
              </div>
              <div className="ml-auto flex gap-2">
                <button onClick={fetchLintStatus} className="btn btn-outline"><Icon name="refresh" size={14} /></button>
              </div>
            </div>

            {auditResult && (
              <div className={"mb-6 p-3 rounded-md border text-sm " + (auditResult.includes('failed') ? 'border-red-soft bg-red-soft text-red' : 'border-green/30 bg-green-soft text-green')}>
                {auditResult}
              </div>
            )}

            <div className="card overflow-hidden">
              <div className="flex items-center justify-between gap-4 flex-wrap p-4 border-b border-line">
                <h2 className="m-0 text-base font-bold text-fg flex items-center gap-2.5">
                  Active Warnings
                  <span className="font-mono text-[11.5px] bg-bg-2 text-fg-1 px-2 py-0.5 rounded-full">{lint.totalWarnings}</span>
                </h2>
                <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="select w-auto py-1.5 px-2.5">
                  <option value="">All Issue Types</option>
                  {warningTypes.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              {filteredWarnings.length === 0 ? (
                <div className="py-12 text-center text-fg-2">
                  <div className="mono-label">wiki sano</div>
                  <div className="mt-2 text-sm">No hay warnings activos.</div>
                </div>
              ) : (
                <div>
                  {filteredWarnings.map(w => (
                    <Link key={w.id} to={w.slug ? `/wiki/${w.slug}` : '#'} className="grid grid-cols-[14px_160px_1fr_auto] items-start gap-3.5 px-4 py-3.5 border-b border-line text-[13.5px] hover:bg-bg transition-colors">
                      <span className={"w-2 h-2 rounded-full mt-2 inline-block " + (w.severity === 'error' ? 'bg-red' : 'bg-amber')} />
                      <div>
                        <div className="font-mono text-[11px] uppercase text-fg-2" style={{ letterSpacing: '0.06em' }}>{w.type}</div>
                        {w.slug && <span className="tag mt-1">{w.slug}</span>}
                      </div>
                      <div className="text-fg-1 leading-snug">{w.message}</div>
                      {w.slug && (
                        <span className="btn btn-outline text-xs py-1 px-2 self-center">
                          <Icon name="arrowUpRight" size={12} /> Ver
                        </span>
                      )}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </>
        )
      )}

      {activeTab === 'sources' && (
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between gap-4 flex-wrap p-4 border-b border-line">
            <h2 className="m-0 text-base font-bold text-fg flex items-center gap-2.5">
              Knowledge Inventory
              <span className="font-mono text-[11.5px] bg-bg-2 text-fg-1 px-2 py-0.5 rounded-full">{sources.length}</span>
            </h2>
            <div className="flex gap-2 items-center">
              <div className="relative w-[280px] max-w-full">
                <Icon name="search" size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-3 pointer-events-none" />
                <input type="text" placeholder="Filtrar por título o autor…" value={sourceSearch} onChange={e => setSourceSearch(e.target.value)} className="input pl-9 py-1.5" />
              </div>
              <Link to="/ingest" className="btn btn-primary"><Icon name="upload" size={14} />Ingest</Link>
            </div>
          </div>

          <div className="overflow-x-auto">
            {sourcesLoading ? (
              <div className="p-12 text-center text-fg-3">Cargando…</div>
            ) : filteredSources.length === 0 ? (
              <div className="p-12 text-center text-fg-3">Sin resultados.</div>
            ) : (
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th className="text-left font-mono text-[10.5px] uppercase text-fg-3 font-medium px-4 py-3 border-b border-line">ID</th>
                    <th className="text-left font-mono text-[10.5px] uppercase text-fg-3 font-medium px-4 py-3 border-b border-line">Source title</th>
                    <th className="text-left font-mono text-[10.5px] uppercase text-fg-3 font-medium px-4 py-3 border-b border-line">Author</th>
                    <th className="text-left font-mono text-[10.5px] uppercase text-fg-3 font-medium px-4 py-3 border-b border-line">Import date</th>
                    <th className="text-right font-mono text-[10.5px] uppercase text-fg-3 font-medium px-4 py-3 border-b border-line">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSources.map(s => (
                    <tr key={s.id} className="hover:bg-bg transition-colors">
                      <td className="px-4 py-3.5 font-mono text-fg-3 text-xs border-b border-line w-[60px]">#{s.id}</td>
                      <td className="px-4 py-3.5 text-fg-1 text-[13.5px] border-b border-line">
                        <div className="font-semibold text-fg">{s.title}</div>
                        {s.source_url && (
                          <a href={s.source_url} target="_blank" rel="noreferrer" className="text-accent text-[11.5px] font-mono inline-flex items-center gap-1 mt-1">
                            Original Source <Icon name="ext" size={11} />
                          </a>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-fg-2 text-[13.5px] border-b border-line">{s.author || '—'}</td>
                      <td className="px-4 py-3.5 text-fg-2 text-[13.5px] border-b border-line font-mono whitespace-nowrap">{new Date(s.created_at).toLocaleDateString()}</td>
                      <td className="px-4 py-3.5 text-right border-b border-line whitespace-nowrap">
                        <Link to={`/raw/${s.id}`} className="btn btn-outline text-xs py-1 px-2 mr-1.5"><Icon name="eye" size={12} /> View</Link>
                        <button onClick={() => handleDelete(s.id)} className="btn btn-danger text-xs py-1 px-2">Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
