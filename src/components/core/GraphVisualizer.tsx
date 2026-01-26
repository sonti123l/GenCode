import { useRef, useState, useEffect, useCallback } from 'react';
import { Network, ZoomIn, ZoomOut, Maximize2, Download } from 'lucide-react';

interface GraphNode {
  id: number | string;
  type: string;
  name?: string;
  path?: string;
  language?: string;
  lines?: number;
  [key: string]: any;
}

interface GraphEdge {
  from: number | string;
  to: number | string;
  type: string;
  unresolved?: boolean;
}

interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

interface GraphVisualizerProps {
  data: GraphData;
}

const NODE_COLORS: Record<string, string> = {
  file: '#3B82F6',
  function: '#10B981',
  class: '#F59E0B',
  variable: '#8B5CF6',
  import: '#6B7280'
};

const EDGE_COLORS: Record<string, string> = {
  CONTAINS: '#4B5563',
  CALLS: '#3B82F6',
  IMPORTS_FROM: '#10B981',
  USES: '#F59E0B',
  DEFINES: '#8B5CF6',
  EXTENDS: '#EF4444'
};

export default function GraphVisualizer({ data: graphData }: GraphVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [nodePositions, setNodePositions] = useState<Record<string | number, { x: number; y: number }>>({});

  // Calculate node positions using improved circular layout
  useEffect(() => {
    if (!graphData?.nodes?.length) return;

    const width = 800;
    const height = 600;

    const positions: Record<string | number, {
      x: number;
      y: number;
      vx: number;
      vy: number;
    }> = {};

    graphData.nodes.forEach(node => {
      positions[node.id] = {
        x: Math.random() * width,
        y: Math.random() * height,
        vx: 0,
        vy: 0
      };
    });

    const REPULSION = 3000;
    const ATTRACTION = 0.005;
    const DAMPING = 0.85;
    const MAX_STEPS = 120;

    let step = 0;

    const tick = () => {
      step++;

      // REPULSION
      for (let i = 0; i < graphData.nodes.length; i++) {
        for (let j = i + 1; j < graphData.nodes.length; j++) {
          const a = graphData.nodes[i];
          const b = graphData.nodes[j];

          const pa = positions[a.id];
          const pb = positions[b.id];

          const dx = pa.x - pb.x;
          const dy = pa.y - pb.y;
          const dist = Math.sqrt(dx * dx + dy * dy) + 0.1;

          const force = REPULSION / (dist * dist);

          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;

          pa.vx += fx;
          pa.vy += fy;
          pb.vx -= fx;
          pb.vy -= fy;
        }
      }

      // ATTRACTION
      graphData.edges?.forEach(edge => {
        const from = positions[edge.from];
        const to = positions[edge.to];
        if (!from || !to) return;

        const dx = to.x - from.x;
        const dy = to.y - from.y;

        from.vx += dx * ATTRACTION;
        from.vy += dy * ATTRACTION;
        to.vx -= dx * ATTRACTION;
        to.vy -= dy * ATTRACTION;
      });

      // APPLY
      graphData.nodes.forEach(node => {
        const p = positions[node.id];
        p.vx *= DAMPING;
        p.vy *= DAMPING;
        p.x += p.vx * 0.01;
        p.y += p.vy * 0.01;
      });

      // Update React state every few frames (CRITICAL)
      if (step % 5 === 0 || step === MAX_STEPS) {
        const snapshot: Record<string | number, { x: number; y: number }> = {};
        Object.entries(positions).forEach(([id, p]) => {
          snapshot[id] = { x: p.x, y: p.y };
        });
        setNodePositions(snapshot);
      }

      if (step < MAX_STEPS) {
        requestAnimationFrame(tick);
      }
    };

    requestAnimationFrame(tick);
  }, [graphData]);

  // Draw the graph - memoized dependencies
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !graphData?.nodes) return;

    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;

    const width = canvas.width;
    const height = canvas.height;

    if (!ctx) return;

    ctx.clearRect(0, 0, width, height);
    ctx.save();

    // Apply transformations BEFORE drawing
    ctx.translate(offset.x * scale, offset.y * scale); // Fixed: offset first, then scale
    ctx.scale(scale, scale);

    // Draw edges first
    graphData.edges?.forEach(edge => {
      const fromPos = nodePositions[edge.from];
      const toPos = nodePositions[edge.to];

      if (fromPos && toPos) {
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(fromPos.x, fromPos.y);
        ctx.lineTo(toPos.x, toPos.y);


        ctx.strokeStyle = EDGE_COLORS[edge.type] || '#6B7280';
        ctx.lineWidth = edge.unresolved ? 1 : 2 / scale; // Scale-aware line width
        if (edge.unresolved) ctx.setLineDash([5, 5]);
        else ctx.setLineDash([]);
        ctx.stroke();

        // Arrowhead
        const angle = Math.atan2(toPos.y - fromPos.y, toPos.x - fromPos.x);
        const arrowSize = 8 / scale;
        ctx.beginPath();
        ctx.moveTo(toPos.x, toPos.y);
        ctx.lineTo(
          toPos.x - arrowSize * Math.cos(angle - Math.PI / 6),
          toPos.y - arrowSize * Math.sin(angle - Math.PI / 6)
        );
        ctx.lineTo(
          toPos.x - arrowSize * Math.cos(angle + Math.PI / 6),
          toPos.y - arrowSize * Math.sin(angle + Math.PI / 6)
        );
        ctx.closePath();
        ctx.fillStyle = EDGE_COLORS[edge.type] || '#6B7280';
        ctx.fill();
        ctx.restore();
      }
    });

    // Draw nodes
    graphData.nodes.forEach(node => {
      const pos = nodePositions[node.id];
      if (!pos) return;

      ctx.save();

      const color = NODE_COLORS[node.type] || '#6B7280';

      // Shadow for depth
      ctx.shadowColor = 'rgba(0,0,0,0.3)';
      ctx.shadowBlur = 8;
      ctx.shadowOffsetX = 2;
      ctx.shadowOffsetY = 2;

      // Node circle
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 20, 0, 2 * Math.PI);
      ctx.fillStyle = color;
      ctx.fill();

      // Highlight selected
      if (selectedNode?.id === node.id) {
        ctx.shadowBlur = 0;
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 3 / scale;
        ctx.stroke();
      }

      ctx.shadowBlur = 0; // Reset shadow

      // Label
      ctx.fillStyle = '#FFFFFF';
      ctx.font = `${12 / scale}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const label = (node.name || node.path?.split(/[/\\]/).pop() || `Node ${node.id}`).substring(0, 15);
      ctx.fillText(label, pos.x, pos.y + 30);

      ctx.restore();
    });

    ctx.restore();
  }, [graphData, nodePositions, scale, offset, selectedNode]);

  const getMousePos = useCallback((e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: (e.clientX - rect.left) / scale - offset.x,
      y: (e.clientY - rect.top) / scale - offset.y
    };
  }, [scale, offset]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const pos = getMousePos(e);

    // Check node click (closest first)
    let clickedNode: GraphNode | null = null;
    let minDist = 25;
    graphData.nodes?.forEach(node => {
      const nodePos = nodePositions[node.id];
      if (nodePos) {
        const dist = Math.hypot(pos.x - nodePos.x, pos.y - nodePos.y);
        if (dist < minDist) {
          minDist = dist;
          clickedNode = node;
        }
      }
    });

    if (clickedNode) {
      setSelectedNode(clickedNode);
    } else {
      setIsDragging(true);
      setDragStart({ x: e.clientX - offset.x * scale, y: e.clientY - offset.y * scale });
    }
  }, [graphData.nodes, nodePositions, getMousePos, offset, scale]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDragging) {
      setOffset({
        x: (e.clientX - dragStart.x) / scale,
        y: (e.clientY - dragStart.y) / scale
      });
    }
  }, [isDragging, dragStart, scale]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / scale - offset.x;
    const y = (e.clientY - rect.top) / scale - offset.y;

    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.max(0.1, Math.min(3, scale * delta));

    setScale(newScale);
    setOffset({
      x: e.clientX - rect.left - x * newScale,
      y: e.clientY - rect.top - y * newScale
    });
  }, [scale, offset]);

  const zoomIn = () => setScale(prev => Math.min(3, prev * 1.2));
  const zoomOut = () => setScale(prev => Math.max(0.1, prev / 1.2));
  const resetView = () => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  };

  const exportAsSVG = useCallback(() => {
    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("width", "800");
    svg.setAttribute("height", "600");
    svg.setAttribute("viewBox", "0 0 800 600");

    // Edges
    graphData.edges?.forEach(edge => {
      const fromPos = nodePositions[edge.from];
      const toPos = nodePositions[edge.to];
      if (fromPos && toPos) {
        const line = document.createElementNS(svgNS, "line");
        line.setAttribute("x1", fromPos.x.toString());
        line.setAttribute("y1", fromPos.y.toString());
        line.setAttribute("x2", toPos.x.toString());
        line.setAttribute("y2", toPos.y.toString());
        line.setAttribute("stroke", "#4B5563");
        line.setAttribute("stroke-width", "2");
        svg.appendChild(line);
      }
    });

    // Nodes
    graphData.nodes?.forEach(node => {
      const pos = nodePositions[node.id];
      if (pos) {
        const circle = document.createElementNS(svgNS, "circle");
        circle.setAttribute("cx", pos.x.toString());
        circle.setAttribute("cy", pos.y.toString());
        circle.setAttribute("r", "20");
        circle.setAttribute("fill", NODE_COLORS[node.type] || '#6B7280');
        svg.appendChild(circle);

        const text = document.createElementNS(svgNS, "text");
        text.setAttribute("x", pos.x.toString());
        text.setAttribute("y", (pos.y + 30).toString());
        text.setAttribute("fill", "white");
        text.setAttribute("text-anchor", "middle");
        text.setAttribute("font-size", "12");
        text.textContent = node.name || node.path?.split(/[/\\]/).pop() || `Node ${node.id}`;
        svg.appendChild(text);
      }
    });

    const serializer = new XMLSerializer();
    const svgStr = serializer.serializeToString(svg);
    const blob = new Blob([svgStr], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'code-graph.svg';
    a.click();
    URL.revokeObjectURL(url);
  }, [graphData, nodePositions]);

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-white">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 bg-gray-900 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <Network className="w-5 h-5 text-blue-500" />
          <h1 className="text-xl font-bold">Code Graph Visualizer</h1>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={zoomOut}
            className="p-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>

          <button
            onClick={zoomIn}
            className="p-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
            title="Zoom In"
          >
            <ZoomIn className="w-4 h-4" />
          </button>

          <button
            onClick={resetView}
            className="p-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
            title="Reset View"
          >
            <Maximize2 className="w-4 h-4" />
          </button>

          <button
            onClick={exportAsSVG}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
          >
            <Download className="w-4 h-4" />
            <span>Export SVG</span>
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Canvas Container */}
        <div className="flex-1 relative">
          <canvas
            ref={canvasRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onWheel={handleWheel}
            className="w-full h-full cursor-grab active:cursor-grabbing"
            style={{ background: '#0f1419' }}
          />

          <div className="absolute bottom-4 left-4 bg-gray-900/90 backdrop-blur-sm rounded-lg p-3 text-sm border border-gray-800">
            <p className="text-gray-400">Zoom: {(scale * 100).toFixed(0)}%</p>
            <p className="text-gray-400">Nodes: {graphData.nodes?.length || 0}</p>
            <p className="text-gray-400">Edges: {graphData.edges?.length || 0}</p>
          </div>

          {selectedNode && (
            <div className="absolute top-4 right-4 bg-gray-900/95 backdrop-blur-sm rounded-lg p-4 text-sm border border-gray-800 max-w-sm">
              <h3 className="font-semibold mb-2 text-white">Selected Node</h3>
              <div className="space-y-1">
                <p><span className="text-gray-400">Type:</span> <span className="font-mono">{selectedNode.type}</span></p>
                {selectedNode.name && <p><span className="text-gray-400">Name:</span> {selectedNode.name}</p>}
                {selectedNode.path && <p className="break-all"><span className="text-gray-400">Path:</span> {selectedNode.path}</p>}
                {selectedNode.language && <p><span className="text-gray-400">Language:</span> {selectedNode.language}</p>}
                {selectedNode.lines && <p><span className="text-gray-400">Lines:</span> {selectedNode.lines}</p>}
              </div>
              <button
                onClick={() => setSelectedNode(null)}
                className="mt-3 w-full px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-sm transition-colors"
              >
                Clear Selection
              </button>
            </div>
          )}
        </div>

        {/* Legend Sidebar */}
        <div className="w-80 bg-gray-900 border-l border-gray-800 p-4 overflow-y-auto flex flex-col">
          <h2 className="text-lg font-semibold mb-6">Legend</h2>

          <div className="space-y-3 mb-8 flex-1">
            <div className="flex items-center gap-3 p-2 bg-gray-800/50 rounded-lg">
              <div className="w-5 h-5 rounded-full bg-blue-500 border-2 border-gray-900"></div>
              <span>File</span>
            </div>
            <div className="flex items-center gap-3 p-2 bg-gray-800/50 rounded-lg">
              <div className="w-5 h-5 rounded-full bg-green-500 border-2 border-gray-900"></div>
              <span>Function</span>
            </div>
            <div className="flex items-center gap-3 p-2 bg-gray-800/50 rounded-lg">
              <div className="w-5 h-5 rounded-full bg-yellow-500 border-2 border-gray-900"></div>
              <span>Class</span>
            </div>
            <div className="flex items-center gap-3 p-2 bg-gray-800/50 rounded-lg">
              <div className="w-5 h-5 rounded-full bg-purple-500 border-2 border-gray-900"></div>
              <span>Variable</span>
            </div>
            <div className="flex items-center gap-3 p-2 bg-gray-800/50 rounded-lg">
              <div className="w-5 h-5 rounded-full bg-gray-500 border-2 border-gray-900"></div>
              <span>Import</span>
            </div>
          </div>

          <div className="mt-auto pt-6 border-t border-gray-800">
            <h3 className="font-semibold mb-3">Controls</h3>
            <ul className="text-sm text-gray-400 space-y-1">
              <li>• Click & drag canvas to pan</li>
              <li>• Mouse wheel to zoom at cursor</li>
              <li>• Click nodes to select</li>
              <li>• Toolbar for zoom/reset/export</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
