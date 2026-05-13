import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import ForceGraph2D from 'react-force-graph-2d';

interface GraphNode { id: string; label: string; type: string; tags: string[] }
interface GraphEdge { source: string; target: string }
interface GraphData { nodes: GraphNode[]; links: GraphEdge[] }

const TYPE_COLORS: Record<string, string> = {
  concept: '#7aa7d3',
  technique: '#7fc7a8',
  reference: '#d4a373',
  index: '#a78bca',
};

export default function GraphPage() {
  const [data, setData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 500 });

  useEffect(() => {
    fetch('/api/wiki/graph')
      .then(r => r.json() as Promise<{ graph: { nodes: GraphNode[]; edges: GraphEdge[] } }>)
      .then(d => {
        setData({ nodes: d.graph.nodes, links: d.graph.edges });
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.clientWidth,
          height: Math.max(500, window.innerHeight - 280),
        });
      }
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  const handleClick = useCallback((node: any) => navigate(`/wiki/${node.id}`), [navigate]);
  const nodeLabel = useCallback((node: any) => `${node.label} (${node.type})`, []);
  const nodeColor = useCallback((node: any) => TYPE_COLORS[node.type] || '#6b7280', []);

  const graphData = useMemo<GraphData | null>(() => {
    if (!data) return null;
    const validIds = new Set(data.nodes.map(n => n.id));
    return {
      nodes: data.nodes,
      links: data.links.filter(l => validIds.has(l.source) && validIds.has(l.target)),
    };
  }, [data]);

  return (
    <div>
      <div className="eyebrow mb-3">Visualización</div>
      <h1 className="text-3xl md:text-[38px] font-extrabold leading-tight tracking-tight">Knowledge Graph</h1>
      <p className="text-fg-2 text-[15px] mt-2 max-w-[60ch]">
        Mapa interactivo de relaciones entre páginas, conceptos y dominios.
      </p>

      {loading ? (
        <p className="text-fg-3 mt-6">Cargando…</p>
      ) : !graphData || graphData.nodes.length === 0 ? (
        <div className="card mt-6 p-12 text-center">
          <div className="mono-label">graph vacío</div>
          <div className="mt-2 text-fg-2 text-sm">Aún no hay páginas en la wiki. Ingiere algunas fuentes para verlas aquí.</div>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-4 mt-4 mb-3 text-xs flex-wrap">
            <span className="text-fg-2 font-mono text-[11.5px]">{graphData.nodes.length} páginas · {graphData.links.length} enlaces</span>
            {(['concept','technique','reference','index'] as const).map(t => (
              <span key={t} className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: TYPE_COLORS[t] }} />
                <span className="text-fg-2">{t}</span>
              </span>
            ))}
          </div>
          <div ref={containerRef} className="card overflow-hidden bg-bg-1">
            <ForceGraph2D
              graphData={graphData}
              width={dimensions.width}
              height={dimensions.height}
              nodeLabel={nodeLabel}
              nodeColor={nodeColor}
              nodeRelSize={6}
              linkDirectionalArrowLength={4}
              linkDirectionalArrowRelPos={1}
              linkColor={() => 'rgba(128, 128, 128, 0.35)'}
              onNodeClick={handleClick}
              nodeCanvasObject={(node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
                const label = node.label || node.id;
                const fontSize = 12 / globalScale;
                ctx.font = `500 ${fontSize}px Manrope, sans-serif`;
                ctx.fillStyle = nodeColor(node);
                ctx.beginPath();
                ctx.arc(node.x, node.y, 5, 0, 2 * Math.PI);
                ctx.fill();
                ctx.fillStyle = 'var(--fg-1)';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'top';
                const isDark = document.documentElement.classList.contains('dark');
                ctx.fillStyle = isDark ? '#b1b6c4' : '#3f4148';
                ctx.fillText(label, node.x, node.y + 7);
              }}
            />
          </div>
        </>
      )}
    </div>
  );
}
