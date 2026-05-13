import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Icon from "../components/Icon";

interface IndexPageEntry {
  slug: string;
  title: string;
  summary: string;
  type: string;
  tags: string[];
  status: string;
  generated_at: string | null;
  updated_at: string | null;
}

export default function LearningPathsPage() {
  const [pages, setPages] = useState<IndexPageEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningMode, setRunningMode] = useState<null | "review" | "regenerate-all">(null);
  const [error, setError] = useState("");

  function load() {
    setLoading(true);
    fetch("/api/wiki/learning-paths")
      .then(r => r.json() as Promise<{ pages: IndexPageEntry[] }>)
      .then(data => {
        setPages(data.pages || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  async function runAgent(mode: "review" | "regenerate-all") {
    if (mode === "regenerate-all") {
      const ok = window.confirm(
        "Esto eliminará todas las páginas existentes de Learning Paths y las regenerará desde cero. ¿Continuar?",
      );
      if (!ok) return;
    }
    setRunningMode(mode);
    setError("");
    try {
      const res = await fetch("/api/learning-paths/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || `Learning-path agent failed (${res.status})`);
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
      <div className="flex items-start justify-between gap-6 flex-wrap">
        <div>
          <div className="eyebrow mb-3">Recorridos guiados</div>
          <h1 className="text-3xl md:text-[38px] font-extrabold leading-tight tracking-tight">Learning Paths</h1>
          <p className="text-fg-2 text-[15px] mt-2 max-w-[60ch]">
            Secuencias curadas que enlazan páginas relacionadas en un recorrido coherente
            {loading ? "." : ` — ${pages.length} rutas activas.`}
          </p>
        </div>
        <div className="flex gap-2 pt-1 md:pt-9">
          <button
            type="button"
            onClick={() => runAgent("review")}
            disabled={busy}
            className="btn btn-outline"
            title="El agente revisa páginas existentes y crea nuevas si han surgido dominios; no elimina nada."
          >
            <Icon name="check" size={14} />
            {runningMode === "review" ? "Revisando…" : "Revisar y completar"}
          </button>
          <button
            type="button"
            onClick={() => runAgent("regenerate-all")}
            disabled={busy}
            className="btn btn-primary"
            title="Borra todas las páginas existentes y las regenera desde cero."
          >
            <Icon name="refresh" size={14} />
            {runningMode === "regenerate-all" ? "Regenerando…" : "Regenerar todo"}
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-6 p-3 border border-red-soft bg-red-soft text-red rounded-md text-sm">{error}</div>
      )}

      <div className="h-8" />

      {loading ? (
        <p className="text-fg-3 text-sm">Cargando…</p>
      ) : pages.length === 0 ? (
        <p className="text-fg-2 text-sm">
          Aún no hay learning-path pages. Pulsa <strong className="text-fg">Regenerar todo</strong> para construir rutas de aprendizaje.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {pages.map(p => <LpCard key={p.slug} page={p} />)}
        </div>
      )}
    </div>
  );
}

function LpCard({ page }: { page: IndexPageEntry }) {
  return (
    <Link
      to={`/wiki/${page.slug}`}
      className="lp-card block p-5 md:p-6 border border-line bg-bg-1 rounded-[10px] relative overflow-hidden transition-colors hover:border-accent-line text-inherit"
    >
      <h3 className="m-0 text-[17px] font-bold leading-tight tracking-tight text-fg mb-1.5">{page.title}</h3>
      {page.summary && (
        <p className="text-fg-1 text-sm leading-[1.55] m-0 mb-3 max-w-[76ch]">{page.summary}</p>
      )}
      {page.generated_at && (
        <span className="font-mono text-[11px] text-fg-3 inline-flex items-center gap-1.5">
          <Icon name="sparkle" size={12} />
          Generado {new Date(page.generated_at).toLocaleDateString()}
        </span>
      )}
    </Link>
  );
}
