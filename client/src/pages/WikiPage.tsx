import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { useQueryState } from "nuqs";
import { displayTag } from "../utils/tagUtils";
import { useSidebarExtras } from "../components/SidebarContext";
import Icon from "../components/Icon";

interface WikiPageEntry {
  slug: string;
  title: string;
  summary: string;
  type: string;
  tags: string[];
  status: string;
}

const TAG_TONES = ["accent", "green", "cyan", "violet", "red"] as const;
type Tone = typeof TAG_TONES[number];

function toneForTag(role: string, idx: number): Tone {
  if (role === "discipline") return "accent";
  if (role === "topic") return "green";
  if (role === "axis") return "violet";
  return TAG_TONES[idx % TAG_TONES.length];
}

function tagClassFor(tone: Tone): string {
  switch (tone) {
    case "accent": return "tag tag-accent";
    case "green": return "tag tag-green";
    case "cyan": return "tag tag-cyan";
    case "violet": return "tag tag-violet";
    case "red": return "tag tag-red";
  }
}

export default function WikiPage() {
  const [pages, setPages] = useState<WikiPageEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [domainFilter, setDomainFilter] = useQueryState("domain", { defaultValue: "" });
  const [topicFilterStr, setTopicFilterStr] = useQueryState("topics", { defaultValue: "" });

  const topicFilter = useMemo(() => (topicFilterStr ? topicFilterStr.split(",") : []), [topicFilterStr]);

  useEffect(() => {
    fetch("/api/wiki")
      .then(r => r.json() as Promise<{ pages: WikiPageEntry[] }>)
      .then(data => {
        setPages(data.pages || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const allTags = useMemo(() => [...new Set(pages.flatMap(p => p.tags))], [pages]);
  const domainTags = useMemo(
    () => allTags.filter(t => t.startsWith("d:")).map(t => displayTag(t)),
    [allTags]
  );

  // Pages matching domain filter
  const pagesInDomain = domainFilter ? pages.filter(p => p.tags.includes(`d:${domainFilter}`)) : pages;

  // Pages matching domain + search + already selected topics → used to derive available topics
  const topicCandidatePages = useMemo(() => {
    return pagesInDomain.filter(p => {
      const matchSearch =
        !search || p.title.toLowerCase().includes(search.toLowerCase()) || p.slug.includes(search.toLowerCase());
      const matchTopics =
        topicFilter.length === 0 || topicFilter.every(t => p.tags.includes(`t:${t}`));
      return matchSearch && matchTopics;
    });
  }, [pagesInDomain, search, topicFilter]);

  // Available topics: when topics are selected, only show those that coexist with all of them
  const availableTopics = useMemo(() => (
    [...new Set(topicCandidatePages.flatMap(p => p.tags))]
      .filter(t => t.startsWith("t:"))
      .map(t => displayTag(t).label)
      .sort((a, b) => a.localeCompare(b))
  ), [topicCandidatePages]);

  // Counts per domain (over current search; ignores selected domain so all counts visible)
  const countsByDomain = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of pages) {
      const matchSearch =
        !search || p.title.toLowerCase().includes(search.toLowerCase()) || p.slug.includes(search.toLowerCase());
      const matchTopics =
        topicFilter.length === 0 || topicFilter.every(t => p.tags.includes(`t:${t}`));
      if (!matchSearch || !matchTopics) continue;
      const d = p.tags.find(t => t.startsWith("d:"));
      const label = d ? displayTag(d).label : "Untagged";
      m.set(label, (m.get(label) ?? 0) + 1);
    }
    return m;
  }, [pages, search, topicFilter]);

  const totalShown = useMemo(
    () => [...countsByDomain.values()].reduce((a, b) => a + b, 0),
    [countsByDomain]
  );

  const filtered = pages.filter(p => {
    const matchSearch =
      !search || p.title.toLowerCase().includes(search.toLowerCase()) || p.slug.includes(search.toLowerCase());
    const matchDomain = !domainFilter || p.tags.includes(`d:${domainFilter}`);
    const matchTopics = topicFilter.length === 0 || topicFilter.every(t => p.tags.includes(`t:${t}`));
    return matchSearch && matchDomain && matchTopics;
  });

  // Group filtered by domain
  const grouped = useMemo(() => {
    const map = new Map<string, WikiPageEntry[]>();
    for (const p of filtered) {
      const d = p.tags.find(t => t.startsWith("d:"));
      const key = d ? displayTag(d).label : "Untagged";
      const arr = map.get(key) ?? [];
      arr.push(p);
      map.set(key, arr);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  // Sidebar extras — domain filter
  const sidebarFilter = (
    <div>
      <div className="mono-label px-2.5 mb-2">Filtrar por dominio</div>
      <div className="flex flex-col gap-px">
        <button
          type="button"
          className={"sb-link" + (!domainFilter ? " active" : "")}
          onClick={() => { setDomainFilter(null); setTopicFilterStr(null); }}
        >
          <span>Todos los dominios</span>
          <span className="count">{pages.length}</span>
        </button>
        {domainTags.map(dt => {
          const active = domainFilter === dt.label;
          const c = countsByDomain.get(dt.label) ?? 0;
          return (
            <button
              key={dt.raw}
              type="button"
              className={"sb-link" + (active ? " active" : "")}
              onClick={() => {
                setDomainFilter(active ? null : dt.label);
                setTopicFilterStr(null);
              }}
            >
              <span>{dt.label}</span>
              <span className="count">{c}</span>
            </button>
          );
        })}
      </div>
    </div>
  );

  useSidebarExtras(sidebarFilter, [pages, domainFilter, countsByDomain, topicFilterStr]);

  if (loading) {
    return <p className="text-fg-3">Cargando…</p>;
  }

  return (
    <div>
      <div className="eyebrow mb-3">Knowledge Base</div>
      <h1 className="text-3xl md:text-[38px] font-extrabold leading-tight tracking-tight">
        Wiki Index
      </h1>
      <p className="text-fg-2 text-[15px] mt-2 max-w-[60ch]">
        Una base de conocimiento curada — {pages.length} páginas en {domainTags.length} dominios.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_240px] gap-2.5 mt-4 mb-2">
        <div className="relative">
          <Icon name="search" size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-3 pointer-events-none" />
          <input
            type="text"
            className="input pl-9"
            placeholder="Buscar por título, slug…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <TopicsDropdown
          topics={availableTopics}
          active={topicFilter}
          onToggle={(t) => {
            const next = topicFilter.includes(t) ? topicFilter.filter(x => x !== t) : [...topicFilter, t];
            setTopicFilterStr(next.length ? next.join(",") : null);
          }}
          onClear={() => setTopicFilterStr(null)}
        />
      </div>

      {grouped.length === 0 ? (
        <div className="py-16 text-center">
          <div className="mono-label">sin resultados</div>
          <div className="mt-2 text-fg-2">Prueba a quitar filtros o cambiar la búsqueda.</div>
        </div>
      ) : (
        grouped.map(([groupLabel, items]) => (
          <section key={groupLabel}>
            <div className="flex items-center gap-3 mt-10 first:mt-6">
              <h2 className="font-mono text-[12px] uppercase font-semibold text-accent m-0" style={{ letterSpacing: "0.12em" }}>
                {groupLabel}
              </h2>
              <span className="font-mono text-[12px] text-fg-3">{items.length}</span>
              <span className="flex-1 h-px bg-line" />
            </div>
            <div className="flex flex-col">
              {items.map(p => <Entry key={p.slug} page={p} />)}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

function Entry({ page }: { page: WikiPageEntry }) {
  const tags = page.tags.map(t => displayTag(t));
  return (
    <Link
      to={`/wiki/${page.slug}`}
      className="block py-6 -mx-4 px-4 border-b border-line cursor-pointer transition-colors hover:bg-bg-1 text-inherit"
    >
      <h3 className="m-0 text-[17px] font-bold leading-tight tracking-tight text-fg flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-0">
        {page.title}
        <span className="tag tag-kind sm:ml-2 sm:align-middle relative -top-px">{page.type}</span>
      </h3>
      {page.summary && (
        <p className="text-fg-1 text-sm leading-[1.55] mt-1.5 mb-2.5 max-w-[76ch]">{page.summary}</p>
      )}
      <div className="flex flex-wrap gap-y-[9px] gap-x-1.5">
        {tags.map((t, i) => (
          <span key={t.raw} className={tagClassFor(toneForTag(t.role, i))}>{t.label}</span>
        ))}
      </div>
    </Link>
  );
}

function TopicsDropdown({
  topics, active, onToggle, onClear
}: {
  topics: string[];
  active: string[];
  onToggle: (t: string) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);

  const label = active.length === 0
    ? "Todos los temas"
    : active.length === 1 ? active[0]
    : `${active.length} temas seleccionados`;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="select flex items-center justify-between gap-2 text-left"
      >
        <span className={"truncate " + (active.length === 0 ? "text-fg-2" : "text-fg")}>{label}</span>
        <Icon name="chevR" size={14} className={"text-fg-3 transition-transform " + (open ? "rotate-90" : "rotate-90")} />
      </button>
      {open && (
        <>
          {/* Backdrop full-screen para cerrar el dropdown al clickear fuera */}
          <div
            className="fixed inset-0 z-20"
            onClick={() => setOpen(false)}
          />
          <div className="absolute top-full right-0 mt-1.5 w-[320px] max-h-[380px] flex flex-col bg-bg-1 border border-line-strong rounded-[10px] shadow-2xl z-30 overflow-hidden">
          <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-line">
            <span className="mono-label">{active.length} de {topics.length}</span>
            {active.length > 0 && (
              <button type="button" className="link-btn font-mono text-[11.5px] text-accent hover:text-fg" onClick={onClear}>
                Limpiar
              </button>
            )}
          </div>
          <div className="overflow-y-auto p-1.5 flex flex-col gap-px">
            {topics.length === 0 ? (
              <div className="text-fg-3 text-xs px-3 py-2">Sin temas disponibles</div>
            ) : topics.map(t => {
              const checked = active.includes(t);
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => onToggle(t)}
                  className={"flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-left font-mono text-[12.5px] transition-colors w-full bg-transparent border-0 cursor-pointer "
                    + (checked ? "text-accent" : "text-fg-1 hover:bg-bg-2 hover:text-fg")}
                >
                  <span className={"w-3.5 h-3.5 rounded grid place-items-center flex-shrink-0 border "
                    + (checked ? "bg-accent border-accent text-bg" : "border-line-strong bg-bg")}>
                    {checked && <Icon name="check" size={10} />}
                  </span>
                  <span className="truncate">{t}</span>
                </button>
              );
            })}
          </div>
          </div>
        </>
      )}
    </div>
  );
}
