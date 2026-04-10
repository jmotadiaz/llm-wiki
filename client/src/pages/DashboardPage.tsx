import { useState, useEffect } from 'react';

interface LintWarning {
  id: number;
  type: string;
  message: string;
  severity: string;
  pageId: number | null;
}

interface LintData {
  counts: Record<string, number>;
  totalWarnings: number;
  lastRun: string;
  warnings: LintWarning[];
}

export default function DashboardPage() {
  const [lint, setLint] = useState<LintData | null>(null);
  const [loading, setLoading] = useState(true);
  const [auditing, setAuditing] = useState(false);
  const [auditResult, setAuditResult] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState('');

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

  useEffect(() => {
    fetchLintStatus();
  }, []);

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

  if (loading) return <p className="text-gray-500">Loading...</p>;
  if (!lint) return <p className="text-gray-500">Failed to load lint status.</p>;

  const warningTypes = [...new Set(lint.warnings.map(w => w.type))].sort();
  const filtered = typeFilter ? lint.warnings.filter(w => w.type === typeFilter) : lint.warnings;

  const metricCards = [
    { label: 'Orphan Pages', count: lint.counts['orphan_page'] || 0, color: 'text-yellow-600' },
    { label: 'Broken Links', count: lint.counts['broken_link'] || 0, color: 'text-red-600' },
    { label: 'Stale Pages', count: lint.counts['stale_page'] || 0, color: 'text-orange-600' },
    { label: 'Missing Tags', count: lint.counts['missing_tags'] || 0, color: 'text-blue-600' },
    { label: 'Invalid Metadata', count: lint.counts['invalid_metadata'] || 0, color: 'text-purple-600' },
    { label: 'Contradictions', count: (lint.counts['contradiction'] || 0) + (lint.counts['duplicate'] || 0), color: 'text-pink-600' },
  ];

  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">Dashboard</h2>

      {/* Health metrics */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        {metricCards.map(m => (
          <div key={m.label} className="border border-gray-200 dark:border-gray-800 rounded p-3 text-center">
            <div className={`text-2xl font-bold ${m.color}`}>{m.count}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">{m.label}</div>
          </div>
        ))}
      </div>

      {/* Audit controls */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={handleAudit}
          disabled={auditing}
          className="px-4 py-2 bg-blue-600 text-white rounded font-medium disabled:opacity-50 text-sm"
        >
          {auditing ? 'Running Audit...' : 'Run Semantic Audit'}
        </button>
        <span className="text-xs text-gray-400">
          Last run: {new Date(lint.lastRun).toLocaleString()}
        </span>
      </div>

      {auditResult && (
        <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded text-sm text-blue-700 dark:text-blue-400">
          {auditResult}
        </div>
      )}

      {/* Warnings list */}
      <div className="mb-2 flex items-center gap-3">
        <h3 className="text-lg font-semibold">Warnings ({lint.totalWarnings})</h3>
        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
          className="px-2 py-1 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-900 text-sm"
        >
          <option value="">All types</option>
          {warningTypes.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      {filtered.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400 text-sm">No warnings. Wiki is healthy!</p>
      ) : (
        <div className="space-y-1">
          {filtered.map(w => (
            <div key={w.id} className="flex gap-2 p-2 rounded border border-gray-100 dark:border-gray-800 text-sm">
              <span className={`px-1.5 py-0.5 text-xs rounded font-medium ${
                w.severity === 'error' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' : 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'
              }`}>
                {w.type}
              </span>
              <span className="text-gray-700 dark:text-gray-300">{w.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
