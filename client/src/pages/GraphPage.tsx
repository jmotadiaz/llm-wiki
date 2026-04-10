import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import ForceGraph2D from 'react-force-graph-2d';

interface GraphNode {
  id: string;
  label: string;
  type: string;
  tags: string[];
}

interface GraphEdge {
  source: string;
  target: string;
}

interface GraphData {
  nodes: GraphNode[];
  links: GraphEdge[];
}

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
        setData({
          nodes: d.graph.nodes,
          links: d.graph.edges,
        });
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.clientWidth,
          height: Math.max(500, window.innerHeight - 250),
        });
      }
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  const handleClick = useCallback((node: any) => {
    navigate(`/wiki/${node.id}`);
  }, [navigate]);

  const nodeLabel = useCallback((node: any) => {
    return `${node.label} (${node.type})`;
  }, []);

  const nodeColor = useCallback((node: any) => {
    const colors: Record<string, string> = {
      concept: '#3b82f6',
      technique: '#10b981',
      reference: '#f59e0b',
      index: '#8b5cf6',
    };
    return colors[node.type] || '#6b7280';
  }, []);

  if (loading) return <p className="text-gray-500">Loading graph...</p>;
  if (!data || data.nodes.length === 0) {
    return (
      <div>
        <h2 className="text-2xl font-bold mb-4">Wiki Graph</h2>
        <p className="text-gray-500 dark:text-gray-400 text-sm">No pages in wiki yet. Ingest some sources to see the graph.</p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">Wiki Graph</h2>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
        {data.nodes.length} pages, {data.links.length} links. Click a node to view the page.
      </p>
      <div className="flex gap-3 mb-3 text-xs">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-blue-500 inline-block"></span> concept</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-emerald-500 inline-block"></span> technique</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-amber-500 inline-block"></span> reference</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-violet-500 inline-block"></span> index</span>
      </div>
      <div ref={containerRef} className="border border-gray-200 dark:border-gray-800 rounded overflow-hidden bg-white dark:bg-gray-950">
        <ForceGraph2D
          graphData={data}
          width={dimensions.width}
          height={dimensions.height}
          nodeLabel={nodeLabel}
          nodeColor={nodeColor}
          nodeRelSize={6}
          linkDirectionalArrowLength={4}
          linkDirectionalArrowRelPos={1}
          linkColor={() => '#9ca3af'}
          onNodeClick={handleClick}
          nodeCanvasObject={(node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
            const label = node.label || node.id;
            const fontSize = 12 / globalScale;
            ctx.font = `${fontSize}px Sans-Serif`;
            ctx.fillStyle = nodeColor(node);
            ctx.beginPath();
            ctx.arc(node.x, node.y, 5, 0, 2 * Math.PI);
            ctx.fill();
            ctx.fillStyle = '#e5e7eb';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillText(label, node.x, node.y + 7);
          }}
        />
      </div>
    </div>
  );
}
