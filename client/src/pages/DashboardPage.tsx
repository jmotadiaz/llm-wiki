import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

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
      .then(data => {
        setLint(data.lint);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  const fetchSources = () => {
    setSourcesLoading(true);
    fetch('/api/raw')
      .then(r => r.json() as Promise<{ sources: RawSource[] }>)
      .then(data => {
        setSources(data.sources);
        setSourcesLoading(false);
      })
      .catch(() => setSourcesLoading(false));
  };

  useEffect(() => {
    fetchLintStatus();
  }, []);

  useEffect(() => {
    if (activeTab === 'sources') {
      fetchSources();
    }
  }, [activeTab]);

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

  const metricCards = lint ? [
    { label: 'Orphan Pages', count: lint.counts['orphan_page'] || 0, color: 'text-yellow-600' },
    { label: 'Broken Links', count: lint.counts['broken_link'] || 0, color: 'text-red-600' },
    { label: 'Stale Pages', count: lint.counts['stale_page'] || 0, color: 'text-orange-600' },
    { label: 'Missing Tags', count: lint.counts['missing_tags'] || 0, color: 'text-blue-600' },
    { label: 'Invalid Metadata', count: lint.counts['invalid_metadata'] || 0, color: 'text-purple-600' },
    { label: 'Contradictions', count: (lint.counts['contradiction'] || 0) + (lint.counts['duplicate'] || 0), color: 'text-pink-600' },
  ] : [];

  const handleDeleteSource = async (id: number) => {
    if (!confirm(`Are you sure you want to delete source #${id}? This will remove its citations but preserved distilled content.`)) return;
    try {
      const res = await fetch(`/api/raw/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
      fetchSources();
    } catch (err: any) {
      alert(err.message);
    }
  };

  if (activeTab === 'health') {
    if (loading) return <p className="text-gray-500">Loading health status...</p>;
    if (!lint) return <p className="text-gray-500">Failed to load lint data.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Dashboard</h2>
        <div className="flex bg-gray-100 dark:bg-gray-800 p-1 rounded-lg">
          <button
            onClick={() => setActiveTab('health')}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${
              activeTab === 'health'
                ? 'bg-white dark:bg-gray-700 shadow-sm text-blue-600 dark:text-blue-400'
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            Wiki Health
          </button>
          <button
            onClick={() => setActiveTab('sources')}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${
              activeTab === 'sources'
                ? 'bg-white dark:bg-gray-700 shadow-sm text-blue-600 dark:text-blue-400'
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            Raw Sources
          </button>
        </div>
      </div>

      {activeTab === 'health' && lint && (
        <div className="animate-in fade-in duration-300">
          {/* Health metrics */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
            {metricCards.map(m => (
              <div key={m.label} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 text-center shadow-sm">
                <div className={`text-3xl font-bold ${m.color}`}>{m.count}</div>
                <div className="text-[10px] uppercase tracking-wider font-semibold text-gray-400 mt-1">{m.label}</div>
              </div>
            ))}
          </div>

          {/* Audit controls */}
          <div className="flex items-center gap-4 mb-6 bg-blue-50/50 dark:bg-blue-900/10 p-4 rounded-xl border border-blue-100 dark:border-blue-900/30">
            <button
              onClick={handleAudit}
              disabled={auditing}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold disabled:opacity-50 text-sm shadow-sm transition-colors"
            >
              {auditing ? 'Running Semantic Audit...' : 'Run Full Semantic Audit'}
            </button>
            <div className="flex flex-col">
              <span className="text-xs font-semibold text-blue-800 dark:text-blue-300">AI Consistency Check</span>
              <span className="text-[10px] text-blue-600 dark:text-blue-400 opacity-70">
                Last run: {new Date(lint.lastRun).toLocaleString()}
              </span>
            </div>
          </div>

          {auditResult && (
            <div className={`mb-6 p-4 rounded-xl border text-sm font-medium ${
              auditResult.includes('failed')
                ? 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-900/30 text-red-700 dark:text-red-400'
                : 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-900/30 text-green-700 dark:text-green-400'
            }`}>
              {auditResult}
            </div>
          )}

          {/* Warnings list */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between bg-gray-50/50 dark:bg-gray-800/50">
              <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100">
                Active Warnings <span className="ml-2 px-2 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-xs text-gray-600 dark:text-gray-400">{lint.totalWarnings}</span>
              </h3>
              <select
                value={typeFilter}
                onChange={e => setTypeFilter(e.target.value)}
                className="px-3 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-xs font-medium focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value="">All Issue Types</option>
                {warningTypes.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            <div className="p-2">
              {filteredWarnings.length === 0 ? (
                <div className="py-12 text-center">
                  <span className="text-4xl">✨</span>
                  <p className="mt-2 text-gray-500 dark:text-gray-400 font-medium">Wiki is completely healthy!</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-50 dark:divide-gray-800">
                  {filteredWarnings.map(w => (
                    <Link key={w.id} to={w.slug ? `/wiki/${w.slug}` : '#'} className={`group flex items-start gap-3 p-3 transition-colors ${w.slug ? 'hover:bg-gray-50 dark:hover:bg-gray-800/30 cursor-pointer' : ''}`}>
                      <div className={`mt-1 h-2 w-2 rounded-full flex-shrink-0 ${
                        w.severity === 'error' ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.4)]' : 'bg-yellow-500'
                      }`} />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-[10px] uppercase font-bold tracking-tight text-gray-400 group-hover:text-gray-500">{w.type}</span>
                          {w.slug && (
                            <span className="text-[10px] font-medium px-1.5 py-0.5 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded">
                              {w.slug}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-700 dark:text-gray-300 leading-snug">{w.message}</p>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'sources' && (
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100">
                Knowledge Inventory <span className="ml-2 px-2 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-xs text-gray-600 dark:text-gray-400">{sources.length}</span>
              </h3>
              <div className="relative flex-1 max-w-sm">
                <input
                  type="text"
                  placeholder="Filter sources by title or author..."
                  value={sourceSearch}
                  onChange={e => setSourceSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                />
                <svg className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
            </div>

            <div className="overflow-x-auto">
              {sourcesLoading ? (
                <div className="p-12 text-center text-gray-500">Loading sources...</div>
              ) : filteredSources.length === 0 ? (
                <div className="p-12 text-center text-gray-500">No sources found.</div>
              ) : (
                <table className="w-full text-left text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-gray-100 dark:border-gray-800 text-[10px] uppercase tracking-wider font-bold text-gray-400">
                      <th className="px-6 py-3">ID</th>
                      <th className="px-4 py-3">Source Title</th>
                      <th className="px-4 py-3">Author</th>
                      <th className="px-4 py-3">Import Date</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                    {filteredSources.map(s => (
                      <tr key={s.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
                        <td className="px-6 py-4 font-mono text-xs text-gray-400">#{s.id}</td>
                        <td className="px-4 py-4">
                          <div className="font-semibold text-gray-800 dark:text-gray-200 truncate max-w-md">{s.title}</div>
                          {s.source_url && (
                            <a href={s.source_url} target="_blank" rel="noopener" className="text-[10px] text-blue-500 hover:underline">Original Source</a>
                          )}
                        </td>
                        <td className="px-4 py-4 text-gray-500 dark:text-gray-400">{s.author || '—'}</td>
                        <td className="px-4 py-4 text-gray-500 dark:text-gray-400 whitespace-nowrap">
                          {new Date(s.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-4 text-right space-x-2">
                          <a
                            href={`/raw/${s.id}`}
                            className="inline-flex items-center px-2 py-1 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 rounded text-xs font-bold transition-colors"
                          >
                            View
                          </a>
                          <button
                            onClick={() => handleDeleteSource(s.id)}
                            className="inline-flex items-center px-2 py-1 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 text-red-600 dark:text-red-400 rounded text-xs font-bold transition-colors"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
