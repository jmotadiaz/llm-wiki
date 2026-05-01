import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useQueryState } from "nuqs";
import { displayTag, getTagColorClass } from "../utils/tagUtils";

interface WikiPageEntry {
  slug: string;
  title: string;
  summary: string;
  type: string;
  tags: string[];
  status: string;
}

interface IndexPageEntry extends WikiPageEntry {
  generated_at: string | null;
  updated_at: string | null;
}

type TabId = "pages" | "domains" | "learning-paths";

export default function WikiPage() {
  const [tab, setTab] = useQueryState("tab", { defaultValue: "pages" });
  const activeTab: TabId =
    tab === "domains" || tab === "learning-paths" ? tab : "pages";

  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">Wiki Index</h2>

      <div className="flex gap-1 mb-6 border-b border-gray-200 dark:border-gray-800">
        <TabButton id="pages" active={activeTab === "pages"} onClick={() => setTab("pages")}>
          Páginas
        </TabButton>
        <TabButton id="domains" active={activeTab === "domains"} onClick={() => setTab("domains")}>
          Dominios
        </TabButton>
        <TabButton id="learning-paths" active={activeTab === "learning-paths"} onClick={() => setTab("learning-paths")}>
          Learning Paths
        </TabButton>
      </div>

      {activeTab === "pages" && <PagesTab />}
      {activeTab === "domains" && <IndexListTab kind="domains" />}
      {activeTab === "learning-paths" && <IndexListTab kind="learning-paths" />}
    </div>
  );
}

function TabButton({
  id,
  active,
  onClick,
  children,
}: {
  id: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-selected={active}
      data-tab={id}
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
        active
          ? "border-blue-600 text-blue-700 dark:text-blue-400 dark:border-blue-400"
          : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
      }`}
    >
      {children}
    </button>
  );
}

function PagesTab() {
  const [pages, setPages] = useState<WikiPageEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [domainFilter, setDomainFilter] = useQueryState("domain", { defaultValue: "" });
  const [topicFilterStr, setTopicFilterStr] = useQueryState("topics", { defaultValue: "" });
  
  const topicFilter = topicFilterStr ? topicFilterStr.split(',') : [];

  useEffect(() => {
    fetch("/api/wiki")
      .then((r) => r.json() as Promise<{ pages: WikiPageEntry[] }>)
      .then((data) => {
        setPages(data.pages || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const allTags = [...new Set(pages.flatMap((p) => p.tags))];
  const domainTags = allTags.filter(t => t.startsWith('d:')).map(t => displayTag(t));
  
  // Available topics depend on the selected domain. If no domain is selected, show all topics.
  const pagesInDomain = domainFilter ? pages.filter(p => p.tags.includes(`d:${domainFilter}`)) : pages;
  const availableTopics = [...new Set(pagesInDomain.flatMap((p) => p.tags))]
    .filter(t => t.startsWith('t:'))
    .map(t => displayTag(t))
    .sort((a, b) => a.label.localeCompare(b.label));

  const filtered = pages.filter((p) => {
    const matchSearch =
      !search ||
      p.title.toLowerCase().includes(search.toLowerCase()) ||
      p.slug.includes(search.toLowerCase());
    
    const matchDomain = !domainFilter || p.tags.includes(`d:${domainFilter}`);
    
    // If topics are selected, the page must have ALL selected topics
    const matchTopics = topicFilter.length === 0 || topicFilter.every(t => p.tags.includes(`t:${t}`));
    
    return matchSearch && matchDomain && matchTopics;
  });

  // Group by discipline
  const grouped: Record<string, WikiPageEntry[]> = {};
  for (const p of filtered) {
    const dTag = p.tags.find(t => t.startsWith('d:'));
    const group = dTag ? displayTag(dTag).label : "untagged";
    (grouped[group] ??= []).push(p);
  }

  function handleTopicClick(e: React.MouseEvent, topicLabel: string) {
    e.preventDefault();
    e.stopPropagation();
    
    const newTopics = topicFilter.includes(topicLabel)
      ? topicFilter.filter(t => t !== topicLabel)
      : [...topicFilter, topicLabel];
      
    setTopicFilterStr(newTopics.length > 0 ? newTopics.join(',') : null);
  }

  if (loading) return <p className="text-gray-500">Loading...</p>;

  return (
    <div>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        {pages.length} pages
      </p>

      <div className="flex flex-col md:flex-row gap-3 mb-4">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search pages..."
          className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-900 text-sm"
        />
        <select
          value={domainFilter}
          onChange={(e) => {
            setDomainFilter(e.target.value || null);
            setTopicFilterStr(null); // Reset topics when domain changes
          }}
          className="md:w-auto px-3 py-2 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-900 text-sm"
        >
          <option value="">Todos los dominios</option>
          {domainTags.map((dt) => (
            <option key={dt.raw} value={dt.label}>
              {dt.label}
            </option>
          ))}
        </select>
      </div>

      {availableTopics.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-6 p-3 bg-gray-50 dark:bg-gray-800/50 rounded border border-gray-100 dark:border-gray-800">
          <span className="text-xs text-gray-500 dark:text-gray-400 mr-2 flex items-center">Filtrar por temas:</span>
          {availableTopics.map(t => {
            const isActive = topicFilter.includes(t.label);
            return (
              <button
                key={t.raw}
                onClick={() => {
                  const newTopics = isActive 
                    ? topicFilter.filter(tf => tf !== t.label)
                    : [...topicFilter, t.label];
                  setTopicFilterStr(newTopics.length > 0 ? newTopics.join(',') : null);
                }}
                className={`text-xs px-2 py-1 rounded transition-colors ${
                  isActive 
                    ? getTagColorClass('topic') 
                    : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      )}

      {filtered.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400 text-sm">
          No pages found.
        </p>
      ) : (
        Object.entries(grouped)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([group, items]) => (
            <div key={group} className="mb-6">
              <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                {group}
              </h3>
              <div className="space-y-1">
                {items.map((p) => (
                  <Link
                    key={p.slug}
                    to={`/wiki/${p.slug}`}
                    className="block p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-sm">{p.title}</span>
                      <span className="text-gray-400 text-[10px] uppercase tracking-wider">
                        {p.type}
                      </span>
                    </div>
                    {p.summary && (
                      <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-3 mb-2 leading-relaxed">
                        {p.summary}
                      </p>
                    )}
                    <div className="flex gap-1 flex-wrap">
                      {p.tags.map((rawTag) => {
                        const t = displayTag(rawTag);
                        // Make topics clickable to add to filter
                        if (t.role === 'topic') {
                           const isFiltered = topicFilter.includes(t.label);
                           return (
                             <button
                               key={t.raw}
                               onClick={(e) => handleTopicClick(e, t.label)}
                               className={`ml-1 text-xs px-1.5 py-0.5 rounded cursor-pointer transition-colors ${isFiltered ? 'ring-1 ring-offset-1 ring-green-400 ' : ''} ${getTagColorClass(t.role)}`}
                             >
                               {t.label}
                             </button>
                           );
                        }
                        return (
                          <span
                            key={t.raw}
                            className={`ml-1 text-xs px-1.5 py-0.5 rounded ${getTagColorClass(t.role)}`}
                          >
                            {t.label}
                          </span>
                        );
                      })}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ))
      )}
    </div>
  );
}

function IndexListTab({ kind }: { kind: "domains" | "learning-paths" }) {
  const [pages, setPages] = useState<IndexPageEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningMode, setRunningMode] = useState<null | "review" | "regenerate-all">(null);
  const [error, setError] = useState("");

  const endpoint =
    kind === "domains" ? "/api/wiki/domain-indexes" : "/api/wiki/learning-paths";
  const category = kind === "domains" ? "domain-index" : "learning-path";
  const heading = kind === "domains" ? "Dominios" : "Learning Paths";
  const emptyMessage =
    kind === "domains"
      ? "Aún no hay domain-index pages. Genera para descubrir dominios."
      : "Aún no hay learning-path pages. Genera para construir rutas de aprendizaje.";

  function load() {
    setLoading(true);
    fetch(endpoint)
      .then((r) => r.json() as Promise<{ pages: IndexPageEntry[] }>)
      .then((data) => {
        setPages(data.pages || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, [endpoint]);

  async function runAgent(mode: "review" | "regenerate-all") {
    if (mode === "regenerate-all") {
      const ok = window.confirm(
        `Esto eliminará todas las páginas existentes de "${heading}" y las regenerará desde cero. ¿Continuar?`,
      );
      if (!ok) return;
    }
    setRunningMode(mode);
    setError("");
    try {
      const res = await fetch("/api/index/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, category }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || `Index agent failed (${res.status})`);
      }
      load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setRunningMode(null);
    }
  }

  const busy = runningMode !== null;

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {loading ? "Loading..." : `${pages.length} ${heading.toLowerCase()}`}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => runAgent("review")}
            disabled={busy}
            title="El agente revisa las páginas existentes y crea nuevas si han surgido dominios; no elimina nada."
            className="px-3 py-1.5 text-sm rounded bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white transition-colors"
          >
            {runningMode === "review" ? "Revisando..." : "Revisar y completar"}
          </button>
          <button
            type="button"
            onClick={() => runAgent("regenerate-all")}
            disabled={busy}
            title="Borra todas las páginas existentes de esta categoría y las regenera desde cero."
            className="px-3 py-1.5 text-sm rounded bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white transition-colors"
          >
            {runningMode === "regenerate-all" ? "Regenerando..." : "Regenerar todo"}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      {!loading && pages.length === 0 && (
        <p className="text-gray-500 dark:text-gray-400 text-sm">{emptyMessage}</p>
      )}

      <div className="space-y-2">
        {pages.map((p) => (
          <Link
            key={p.slug}
            to={`/wiki/${p.slug}`}
            className="block p-3 rounded border border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="font-medium text-sm">{p.title}</span>
              <span className="text-gray-400 text-[10px] uppercase tracking-wider">
                {p.type}
              </span>
            </div>
            {p.summary && (
              <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-3 mb-2 leading-relaxed">
                {p.summary}
              </p>
            )}
            <div className="flex items-center gap-3 text-[11px] text-gray-400 flex-wrap">
              {p.generated_at ? (
                <span>Generado: {new Date(p.generated_at).toLocaleString()}</span>
              ) : (
                <span>Sin fecha de generación</span>
              )}
              {p.tags.length > 0 && (
                <div className="flex gap-1">
                  {p.tags.map(rawTag => {
                    const t = displayTag(rawTag);
                    return (
                      <span key={t.raw} className={`px-1.5 py-0.5 rounded ${getTagColorClass(t.role)}`}>
                        {t.label}
                      </span>
                    )
                  })}
                </div>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
