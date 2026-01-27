import { useRef, useState, useEffect, useCallback } from 'react';
import { Network, ZoomIn, ZoomOut, Maximize2, Download, Grid, Layers } from 'lucide-react';

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

interface Position {
  x: number;
  y: number;
  vx?: number;
  vy?: number;
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
  EXTENDS: '#EF4444',
  EXPORTS: '#EC4899'
};

type LayoutType = 'force' | 'hierarchical' | 'circular' | 'grid';

export default function GraphVisualizer({ data: graphData }: GraphVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [nodePositions, setNodePositions] = useState<Record<string | number, Position>>({});
  const [layoutType, setLayoutType] = useState<LayoutType>('force');
  const [highlightedEdges, setHighlightedEdges] = useState<Set<string>>(new Set());
  const [highlightedNodes, setHighlightedNodes] = useState<Set<string | number>>(new Set());

  // IMPROVED FORCE-DIRECTED LAYOUT
  const calculateForceLayout = useCallback(() => {
    if (!graphData?.nodes?.length) return {};

    const WIDTH = 1600;
    const HEIGHT = 1200;
    const positions: Record<string | number, Position & { vx: number; vy: number }> = {};

    // Initialize with better spacing
    graphData.nodes.forEach((node, i) => {
      const angle = (i / graphData.nodes.length) * 2 * Math.PI;
      const radius = Math.min(WIDTH, HEIGHT) * 0.3;
      positions[node.id] = {
        x: WIDTH / 2 + Math.cos(angle) * radius,
        y: HEIGHT / 2 + Math.sin(angle) * radius,
        vx: 0,
        vy: 0
      };
    });

    // Build adjacency for better clustering
    const adjacency = new Map<string | number, Set<string | number>>();
    graphData.edges?.forEach(edge => {
      if (!adjacency.has(edge.from)) adjacency.set(edge.from, new Set());
      if (!adjacency.has(edge.to)) adjacency.set(edge.to, new Set());
      adjacency.get(edge.from)!.add(edge.to);
      adjacency.get(edge.to)!.add(edge.from);
    });

    const REPULSION = 50000;
    const ATTRACTION = 0.01;
    const DAMPING = 0.8;
    const MAX_STEPS = 200;
    const CENTER_GRAVITY = 0.001;

    for (let step = 0; step < MAX_STEPS; step++) {
      const progress = step / MAX_STEPS;
      const temp = 1 - progress;

      // STRONG REPULSION between all nodes
      for (let i = 0; i < graphData.nodes.length; i++) {
        for (let j = i + 1; j < graphData.nodes.length; j++) {
          const a = graphData.nodes[i];
          const b = graphData.nodes[j];
          const pa = positions[a.id];
          const pb = positions[b.id];

          const dx = pa.x - pb.x;
          const dy = pa.y - pb.y;
          const distSq = dx * dx + dy * dy;
          const dist = Math.sqrt(distSq) + 1;

          const force = (REPULSION * temp) / distSq;
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;

          pa.vx += fx;
          pa.vy += fy;
          pb.vx -= fx;
          pb.vy -= fy;
        }
      }

      // EDGE ATTRACTION (stronger for connected nodes)
      graphData.edges?.forEach(edge => {
        const from = positions[edge.from];
        const to = positions[edge.to];
        if (!from || !to) return;

        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const dist = Math.sqrt(dx * dx + dy * dy) + 0.1;

        const optimalDist = 150; // Target edge length
        const force = (dist - optimalDist) * ATTRACTION;

        from.vx += dx * force;
        from.vy += dy * force;
        to.vx -= dx * force;
        to.vy -= dy * force;
      });

      // CENTER GRAVITY (keep graph centered)
      graphData.nodes.forEach(node => {
        const p = positions[node.id];
        const dx = WIDTH / 2 - p.x;
        const dy = HEIGHT / 2 - p.y;
        p.vx += dx * CENTER_GRAVITY;
        p.vy += dy * CENTER_GRAVITY;
      });

      // APPLY VELOCITIES with damping
      graphData.nodes.forEach(node => {
        const p = positions[node.id];
        p.vx *= DAMPING;
        p.vy *= DAMPING;

        const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
        const maxSpeed = 20;
        if (speed > maxSpeed) {
          p.vx = (p.vx / speed) * maxSpeed;
          p.vy = (p.vy / speed) * maxSpeed;
        }

        p.x += p.vx;
        p.y += p.vy;

        // Bounds
        p.x = Math.max(50, Math.min(WIDTH - 50, p.x));
        p.y = Math.max(50, Math.min(HEIGHT - 50, p.y));
      });
    }

    return positions;
  }, [graphData]);

  // HIERARCHICAL LAYOUT (tree-like)
  const calculateHierarchicalLayout = useCallback(() => {
    if (!graphData?.nodes?.length) return {};

    const positions: Record<string | number, Position> = {};
    const levels = new Map<string | number, number>();
    const visited = new Set<string | number>();

    // Build adjacency
    const outgoing = new Map<string | number, Set<string | number>>();
    const incoming = new Map<string | number, Set<string | number>>();

    graphData.nodes.forEach(node => {
      outgoing.set(node.id, new Set());
      incoming.set(node.id, new Set());
    });

    graphData.edges?.forEach(edge => {
      outgoing.get(edge.from)?.add(edge.to);
      incoming.get(edge.to)?.add(edge.from);
    });

    // Find root nodes (no incoming edges)
    const roots = graphData.nodes.filter(n => incoming.get(n.id)!.size === 0);
    if (roots.length === 0 && graphData.nodes.length > 0) {
      roots.push(graphData.nodes[0]); // Fallback
    }

    // BFS to assign levels
    const queue: Array<{ id: string | number; level: number }> = roots.map(n => ({ id: n.id, level: 0 }));
    let maxLevel = 0;

    while (queue.length > 0) {
      const { id, level } = queue.shift()!;
      if (visited.has(id)) continue;
      visited.add(id);
      levels.set(id, level);
      maxLevel = Math.max(maxLevel, level);

      outgoing.get(id)?.forEach(childId => {
        if (!visited.has(childId)) {
          queue.push({ id: childId, level: level + 1 });
        }
      });
    }

    // Assign remaining nodes
    graphData.nodes.forEach(node => {
      if (!levels.has(node.id)) {
        levels.set(node.id, maxLevel + 1);
      }
    });

    // Position nodes by level
    const nodesByLevel = new Map<number, Array<string | number>>();
    levels.forEach((level, nodeId) => {
      if (!nodesByLevel.has(level)) nodesByLevel.set(level, []);
      nodesByLevel.get(level)!.push(nodeId);
    });

    const WIDTH = 1600;
    const HEIGHT = 1200;
    const levelHeight = HEIGHT / (maxLevel + 2);

    nodesByLevel.forEach((nodeIds, level) => {
      const levelWidth = WIDTH / (nodeIds.length + 1);
      nodeIds.forEach((nodeId, i) => {
        positions[nodeId] = {
          x: levelWidth * (i + 1),
          y: levelHeight * (level + 1)
        };
      });
    });

    return positions;
  }, [graphData]);

  // CIRCULAR LAYOUT
  const calculateCircularLayout = useCallback(() => {
    if (!graphData?.nodes?.length) return {};

    const positions: Record<string | number, Position> = {};
    const WIDTH = 1600;
    const HEIGHT = 1200;
    const centerX = WIDTH / 2;
    const centerY = HEIGHT / 2;
    const radius = Math.min(WIDTH, HEIGHT) * 0.4;

    graphData.nodes.forEach((node, i) => {
      const angle = (i / graphData.nodes.length) * 2 * Math.PI;
      positions[node.id] = {
        x: centerX + Math.cos(angle) * radius,
        y: centerY + Math.sin(angle) * radius
      };
    });

    return positions;
  }, [graphData]);

  // GRID LAYOUT
  const calculateGridLayout = useCallback(() => {
    if (!graphData?.nodes?.length) return {};

    const positions: Record<string | number, Position> = {};
    const cols = Math.ceil(Math.sqrt(graphData.nodes.length));
    const cellWidth = 1600 / (cols + 1);
    const cellHeight = 1200 / (Math.ceil(graphData.nodes.length / cols) + 1);

    graphData.nodes.forEach((node, i) => {
      const row = Math.floor(i / cols);
      const col = i % cols;
      positions[node.id] = {
        x: cellWidth * (col + 1),
        y: cellHeight * (row + 1)
      };
    });

    return positions;
  }, [graphData]);

  // Calculate positions when layout changes
  useEffect(() => {
    let positions: Record<string | number, Position> = {};

    switch (layoutType) {
      case 'force':
        positions = calculateForceLayout();
        break;
      case 'hierarchical':
        positions = calculateHierarchicalLayout();
        break;
      case 'circular':
        positions = calculateCircularLayout();
        break;
      case 'grid':
        positions = calculateGridLayout();
        break;
    }

    setNodePositions(positions);
  }, [layoutType, graphData, calculateForceLayout, calculateHierarchicalLayout, calculateCircularLayout, calculateGridLayout]);

  // Update highlighted edges and nodes when selection changes
  useEffect(() => {
    if (!selectedNode) {
      setHighlightedEdges(new Set());
      setHighlightedNodes(new Set());
      return;
    }

    const connectedEdges = new Set<string>();
    const connectedNodeIds = new Set<string | number>();
    connectedNodeIds.add(selectedNode.id);

    graphData.edges?.forEach((edge, index) => {
      if (edge.from === selectedNode.id || edge.to === selectedNode.id) {
        connectedEdges.add(`${edge.from}-${edge.to}-${index}`);
        connectedNodeIds.add(edge.from);
        connectedNodeIds.add(edge.to);
      }
    });

    setHighlightedEdges(connectedEdges);
    setHighlightedNodes(connectedNodeIds);
  }, [selectedNode, graphData.edges]);

  // Draw the graph
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !graphData?.nodes) return;

    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;

    const width = canvas.width;
    const height = canvas.height;

    if (!ctx) return;

    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    ctx.clearRect(0, 0, width, height);

    ctx.save();
    ctx.translate(offset.x, offset.y);
    ctx.scale(scale, scale);

    // Draw non-highlighted edges first (dimmed)
    graphData.edges?.forEach((edge, index) => {
      const edgeKey = `${edge.from}-${edge.to}-${index}`;
      const isHighlighted = highlightedEdges.has(edgeKey);
      
      if (!isHighlighted && selectedNode) {
        // Draw dimmed edges when something is selected
        const fromPos = nodePositions[edge.from];
        const toPos = nodePositions[edge.to];
        if (!fromPos || !toPos) return;

        ctx.save();
        ctx.globalAlpha = 0.15;
        ctx.beginPath();
        ctx.moveTo(fromPos.x, fromPos.y);
        ctx.lineTo(toPos.x, toPos.y);
        ctx.strokeStyle = '#6B7280';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.restore();
      }
    });

    // Draw highlighted edges with labels
    graphData.edges?.forEach((edge, index) => {
      const edgeKey = `${edge.from}-${edge.to}-${index}`;
      const isHighlighted = highlightedEdges.has(edgeKey);
      
      if (isHighlighted || !selectedNode) {
        const fromPos = nodePositions[edge.from];
        const toPos = nodePositions[edge.to];
        if (!fromPos || !toPos) return;

        ctx.save();

        const color = EDGE_COLORS[edge.type] || '#6B7280';
        
        // Enhanced highlighting
        if (isHighlighted) {
          ctx.globalAlpha = 1;
          ctx.shadowColor = color;
          ctx.shadowBlur = 15;
        } else {
          ctx.globalAlpha = 0.6;
        }

        // Draw edge line
        ctx.beginPath();
        ctx.moveTo(fromPos.x, fromPos.y);
        ctx.lineTo(toPos.x, toPos.y);
        ctx.strokeStyle = edge.unresolved ? `${color}66` : color;
        ctx.lineWidth = isHighlighted ? 4 : (edge.unresolved ? 1.5 : 2.5);
        
        if (edge.unresolved) {
          ctx.setLineDash([8, 4]);
        } else {
          ctx.setLineDash([]);
        }
        
        ctx.stroke();

        // Draw arrowhead
        const angle = Math.atan2(toPos.y - fromPos.y, toPos.x - fromPos.x);
        const arrowSize = isHighlighted ? 14 : 10;
        const arrowDist = 25;

        const arrowX = toPos.x - Math.cos(angle) * arrowDist;
        const arrowY = toPos.y - Math.sin(angle) * arrowDist;

        ctx.shadowBlur = 0;
        ctx.beginPath();
        ctx.moveTo(arrowX, arrowY);
        ctx.lineTo(
          arrowX - arrowSize * Math.cos(angle - Math.PI / 6),
          arrowY - arrowSize * Math.sin(angle - Math.PI / 6)
        );
        ctx.lineTo(
          arrowX - arrowSize * Math.cos(angle + Math.PI / 6),
          arrowY - arrowSize * Math.sin(angle + Math.PI / 6)
        );
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();

        // Draw edge label for highlighted edges
        if (isHighlighted) {
          ctx.shadowBlur = 0;
          const midX = (fromPos.x + toPos.x) / 2;
          const midY = (fromPos.y + toPos.y) / 2;

          // Background for label
          ctx.font = 'bold 11px sans-serif';
          const labelText = edge.type;
          const textMetrics = ctx.measureText(labelText);
          const padding = 6;
          const labelWidth = textMetrics.width + padding * 2;
          const labelHeight = 20;

          // Calculate label position offset from line
          const perpAngle = angle + Math.PI / 2;
          const labelOffsetDist = 15;
          const labelX = midX + Math.cos(perpAngle) * labelOffsetDist;
          const labelY = midY + Math.sin(perpAngle) * labelOffsetDist;

          // Draw label background
          ctx.fillStyle = 'rgba(17, 24, 39, 0.95)';
          ctx.strokeStyle = color;
          ctx.lineWidth = 2;
          const cornerRadius = 4;
          
          ctx.beginPath();
          ctx.roundRect(
            labelX - labelWidth / 2,
            labelY - labelHeight / 2,
            labelWidth,
            labelHeight,
            cornerRadius
          );
          ctx.fill();
          ctx.stroke();

          // Draw label text
          ctx.fillStyle = color;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(labelText, labelX, labelY);
        }

        ctx.restore();
      }
    });

    // Draw nodes
    graphData.nodes.forEach(node => {
      const pos = nodePositions[node.id];
      if (!pos) return;

      const isConnected = highlightedNodes.has(node.id);
      const isSelected = selectedNode?.id === node.id;

      ctx.save();
      
      // Dim unconnected nodes when something is selected
      if (selectedNode && !isConnected) {
        ctx.globalAlpha = 0.2;
      }

      const color = NODE_COLORS[node.type] || '#6B7280';
      const radius = isSelected ? 26 : 22;

      // Enhanced shadow for selected/connected nodes
      if (isSelected || isConnected) {
        ctx.shadowColor = color;
        ctx.shadowBlur = isSelected ? 20 : 12;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
      } else {
        ctx.shadowColor = 'rgba(0,0,0,0.25)';
        ctx.shadowBlur = 8;
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 2;
      }

      // Node circle
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, radius, 0, 2 * Math.PI);
      ctx.fillStyle = color;
      ctx.fill();

      // Border
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
      
      if (isSelected) {
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 5;
        ctx.stroke();
        // Add outer glow ring
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, radius + 5, 0, 2 * Math.PI);
        ctx.stroke();
      } else if (isConnected) {
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 3;
        ctx.stroke();
      } else {
        ctx.strokeStyle = `${color}AA`;
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Icon/Type indicator (first letter)
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#FFFFFF';
      ctx.font = `bold ${isSelected ? 16 : 14}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(node.type.charAt(0).toUpperCase(), pos.x, pos.y);

      // Label
      ctx.shadowBlur = 2;
      ctx.shadowColor = 'rgba(0,0,0,0.5)';
      ctx.fillStyle = '#FFFFFF';
      ctx.font = `${isSelected ? 14 : 13}px sans-serif`;
      const label = (node.name || node.path?.split(/[/\\]/).pop() || `${node.id}`).substring(0, 20);
      ctx.fillText(label, pos.x, pos.y + (isSelected ? 42 : 38));

      ctx.restore();
    });

    ctx.restore();
  }, [graphData, nodePositions, scale, offset, selectedNode, highlightedEdges, highlightedNodes]);

  const getMousePos = useCallback((e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: (e.clientX - rect.left - offset.x) / scale,
      y: (e.clientY - rect.top - offset.y) / scale
    };
  }, [scale, offset]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const pos = getMousePos(e);

    let clickedNode: GraphNode | null = null;
    let minDist = 30;

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
      setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
    }
  }, [graphData.nodes, nodePositions, getMousePos, offset]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDragging) {
      setOffset({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      });
    }
  }, [isDragging, dragStart]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.max(0.1, Math.min(5, scale * delta));
    
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    setOffset({
      x: mouseX - (mouseX - offset.x) * (newScale / scale),
      y: mouseY - (mouseY - offset.y) * (newScale / scale)
    });
    
    setScale(newScale);
  }, [scale, offset]);

  const zoomIn = () => {
    setScale(prev => Math.min(5, prev * 1.2));
  };

  const zoomOut = () => {
    setScale(prev => Math.max(0.1, prev / 1.2));
  };

  const resetView = () => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  };

  const exportAsSVG = useCallback(() => {
    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("width", "1600");
    svg.setAttribute("height", "1200");
    svg.setAttribute("viewBox", "0 0 1600 1200");
    svg.setAttribute("style", "background: #1F2937");

    graphData.edges?.forEach(edge => {
      const fromPos = nodePositions[edge.from];
      const toPos = nodePositions[edge.to];
      if (fromPos && toPos) {
        const line = document.createElementNS(svgNS, "line");
        line.setAttribute("x1", fromPos.x.toString());
        line.setAttribute("y1", fromPos.y.toString());
        line.setAttribute("x2", toPos.x.toString());
        line.setAttribute("y2", toPos.y.toString());
        line.setAttribute("stroke", EDGE_COLORS[edge.type] || '#6B7280');
        line.setAttribute("stroke-width", edge.unresolved ? "1.5" : "2.5");
        if (edge.unresolved) line.setAttribute("stroke-dasharray", "8,4");
        svg.appendChild(line);
      }
    });

    graphData.nodes?.forEach(node => {
      const pos = nodePositions[node.id];
      if (pos) {
        const circle = document.createElementNS(svgNS, "circle");
        circle.setAttribute("cx", pos.x.toString());
        circle.setAttribute("cy", pos.y.toString());
        circle.setAttribute("r", "22");
        circle.setAttribute("fill", NODE_COLORS[node.type] || '#6B7280');
        circle.setAttribute("stroke", "#FFFFFF");
        circle.setAttribute("stroke-width", "2");
        svg.appendChild(circle);

        const text = document.createElementNS(svgNS, "text");
        text.setAttribute("x", pos.x.toString());
        text.setAttribute("y", (pos.y + 38).toString());
        text.setAttribute("fill", "white");
        text.setAttribute("text-anchor", "middle");
        text.setAttribute("font-size", "13");
        text.textContent = node.name || node.path?.split(/[/\\]/).pop() || `${node.id}`;
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

  // Get connection statistics for selected node
  const getConnectionStats = useCallback(() => {
    if (!selectedNode) return null;

    const connections: Record<string, number> = {};
    const incomingConnections: GraphEdge[] = [];
    const outgoingConnections: GraphEdge[] = [];

    graphData.edges?.forEach(edge => {
      if (edge.from === selectedNode.id) {
        outgoingConnections.push(edge);
        connections[edge.type] = (connections[edge.type] || 0) + 1;
      }
      if (edge.to === selectedNode.id) {
        incomingConnections.push(edge);
        connections[`incoming_${edge.type}`] = (connections[`incoming_${edge.type}`] || 0) + 1;
      }
    });

    return { connections, incomingConnections, outgoingConnections };
  }, [selectedNode, graphData.edges]);

  const connectionStats = getConnectionStats();

  return (
    <div className="w-full h-screen bg-gray-900 text-white flex flex-col">
      {/* Header */}
      <div className="bg-gray-800 border-b border-gray-700 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Network className="w-6 h-6 text-blue-400" />
          <h1 className="text-xl font-bold">Code Graph Visualizer</h1>
        </div>

        <div className="flex items-center gap-4">
          {/* Layout Selector */}
          <div className="flex items-center gap-2 bg-gray-700 rounded-lg p-1">
            <button
              onClick={() => setLayoutType('force')}
              className={`px-3 py-1.5 rounded text-sm transition-colors ${
                layoutType === 'force' ? 'bg-blue-600' : 'hover:bg-gray-600'
              }`}
            >
              Force
            </button>
            <button
              onClick={() => setLayoutType('hierarchical')}
              className={`px-3 py-1.5 rounded text-sm transition-colors ${
                layoutType === 'hierarchical' ? 'bg-blue-600' : 'hover:bg-gray-600'
              }`}
            >
              <Layers className="w-4 h-4 inline mr-1" />
              Tree
            </button>
            <button
              onClick={() => setLayoutType('circular')}
              className={`px-3 py-1.5 rounded text-sm transition-colors ${
                layoutType === 'circular' ? 'bg-blue-600' : 'hover:bg-gray-600'
              }`}
            >
              Circular
            </button>
            <button
              onClick={() => setLayoutType('grid')}
              className={`px-3 py-1.5 rounded text-sm transition-colors ${
                layoutType === 'grid' ? 'bg-blue-600' : 'hover:bg-gray-600'
              }`}
            >
              <Grid className="w-4 h-4 inline mr-1" />
              Grid
            </button>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2">
            <button onClick={zoomIn} className="p-2 bg-gray-700 hover:bg-gray-600 rounded transition-colors">
              <ZoomIn className="w-5 h-5" />
            </button>
            <button onClick={zoomOut} className="p-2 bg-gray-700 hover:bg-gray-600 rounded transition-colors">
              <ZoomOut className="w-5 h-5" />
            </button>
            <button onClick={resetView} className="p-2 bg-gray-700 hover:bg-gray-600 rounded transition-colors">
              <Maximize2 className="w-5 h-5" />
            </button>
            <button onClick={exportAsSVG} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded flex items-center gap-2 transition-colors">
              <Download className="w-4 h-4" />
              Export SVG
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Canvas Container */}
        <div className="flex-1 relative bg-gray-900">
          <canvas
            ref={canvasRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onWheel={handleWheel}
            className="w-full h-full cursor-grab active:cursor-grabbing"
          />

          {/* Stats Overlay */}
          <div className="absolute top-4 left-4 bg-gray-800/90 backdrop-blur rounded-lg p-3 text-sm space-y-1">
            <div>Zoom: {(scale * 100).toFixed(0)}%</div>
            <div>Nodes: {graphData.nodes?.length || 0}</div>
            <div>Edges: {graphData.edges?.length || 0}</div>
            <div className="text-xs text-gray-400 mt-2">Layout: {layoutType}</div>
          </div>

          {/* Hint Overlay */}
          {!selectedNode && (
            <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-blue-600/90 backdrop-blur rounded-lg px-4 py-2 text-sm">
              💡 Click on any node to highlight its connections
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="w-80 bg-gray-800 border-l border-gray-700 overflow-y-auto custom-scrollbar">
          {selectedNode && connectionStats && (
            <div className="p-4 border-b border-gray-700">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-lg">Selected Node</h3>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <div
                    className="w-4 h-4 rounded-full"
                    style={{ backgroundColor: NODE_COLORS[selectedNode.type] || '#6B7280' }}
                  />
                  <span className="text-gray-400">Type:</span>
                  <span className="font-medium">{selectedNode.type}</span>
                </div>
                {selectedNode.name && (
                  <div>
                    <span className="text-gray-400">Name:</span>
                    <div className="font-medium break-all">{selectedNode.name}</div>
                  </div>
                )}
                {selectedNode.path && (
                  <div>
                    <span className="text-gray-400">Path:</span>
                    <div className="text-xs font-mono break-all bg-gray-900 p-2 rounded mt-1">
                      {selectedNode.path}
                    </div>
                  </div>
                )}
                {selectedNode.language && (
                  <div>
                    <span className="text-gray-400">Language:</span>
                    <span className="font-medium ml-2">{selectedNode.language}</span>
                  </div>
                )}
                {selectedNode.lines && (
                  <div>
                    <span className="text-gray-400">Lines:</span>
                    <span className="font-medium ml-2">{selectedNode.lines}</span>
                  </div>
                )}
              </div>

              {/* Connection Statistics */}
              <div className="mt-4 pt-4 border-t border-gray-700">
                <h4 className="font-medium mb-2 text-sm">Connections</h4>
                
                {/* Outgoing Connections */}
                {connectionStats.outgoingConnections.length > 0 && (
                  <div className="mb-3">
                    <p className="text-xs text-gray-400 mb-2">Outgoing ({connectionStats.outgoingConnections.length})</p>
                    <div className="space-y-1">
                      {Object.entries(connectionStats.connections)
                        .filter(([key]) => !key.startsWith('incoming_'))
                        .map(([type, count]) => (
                          <div key={type} className="flex items-center justify-between text-xs bg-gray-900/50 p-2 rounded">
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-0.5" style={{ backgroundColor: EDGE_COLORS[type] || '#6B7280' }} />
                              <span>{type}</span>
                            </div>
                            <span className="text-gray-400">{count}</span>
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                {/* Incoming Connections */}
                {connectionStats.incomingConnections.length > 0 && (
                  <div>
                    <p className="text-xs text-gray-400 mb-2">Incoming ({connectionStats.incomingConnections.length})</p>
                    <div className="space-y-1">
                      {Object.entries(connectionStats.connections)
                        .filter(([key]) => key.startsWith('incoming_'))
                        .map(([type, count]) => {
                          const actualType = type.replace('incoming_', '');
                          return (
                            <div key={type} className="flex items-center justify-between text-xs bg-gray-900/50 p-2 rounded">
                              <div className="flex items-center gap-2">
                                <div className="w-3 h-0.5" style={{ backgroundColor: EDGE_COLORS[actualType] || '#6B7280' }} />
                                <span>{actualType}</span>
                              </div>
                              <span className="text-gray-400">{count}</span>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}
              </div>

              <button
                onClick={() => setSelectedNode(null)}
                className="mt-4 w-full px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm transition-colors"
              >
                Clear Selection
              </button>
            </div>
          )}

          {/* Legend */}
          <div className="p-4">
            <h3 className="font-semibold mb-3">Legend</h3>
            <div className="space-y-2 text-sm">
              <h4 className="text-gray-400 text-xs uppercase mb-2">Node Types</h4>
              {Object.entries(NODE_COLORS).map(([type, color]) => (
                <div key={type} className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded-full" style={{ backgroundColor: color }} />
                  <span className="capitalize">{type}</span>
                </div>
              ))}

              <h4 className="text-gray-400 text-xs uppercase mt-4 mb-2">Edge Types</h4>
              {Object.entries(EDGE_COLORS).map(([type, color]) => (
                <div key={type} className="flex items-center gap-2">
                  <div className="w-8 h-0.5" style={{ backgroundColor: color }} />
                  <span className="text-xs">{type}</span>
                </div>
              ))}
            </div>

            <div className="mt-6 pt-4 border-t border-gray-700">
              <h3 className="font-semibold mb-2">Controls</h3>
              <ul className="text-xs text-gray-400 space-y-1.5">
                <li>• Click & drag to pan</li>
                <li>• Mouse wheel to zoom</li>
                <li>• Click nodes to highlight connections</li>
                <li>• Edge labels show relationship types</li>
                <li>• Switch layouts for clarity</li>
                <li>• Export as SVG</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}