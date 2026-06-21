import React, { useState, useMemo } from "react";
import { ReactFlow, Background, Controls, Node as ReactFlowNode, Edge as ReactFlowEdge } from "@xyflow/react";
import { Search, X, Eye, Network } from "lucide-react";
import { Button } from "../ui/button";
import { FileNode } from "@shared/types";

// Helper function to extract focused node subgraphs (BFS)
function getFocusedNodes(result: any, focusQuery: string, depth: number = 2): Set<string> {
  if (!focusQuery.trim() || !result?.files) return new Set();
  const files: FileNode[] = result.files;

  // Find seed node(s)
  const seeds = files.filter((f: FileNode) =>
    f.path.toLowerCase().includes(focusQuery.toLowerCase()) ||
    f.path.split(/[\\/]/).pop()?.toLowerCase().includes(focusQuery.toLowerCase())
  ).map((f: FileNode) => f.path);

  if (seeds.length === 0) return new Set();

  const visited = new Set<string>(seeds);
  let frontier = [...seeds];

  const fileMap = new Map<string, FileNode>(files.map((f: FileNode) => [f.path, f]));

  for (let d = 0; d < depth; d++) {
    const next: string[] = [];
    for (const id of frontier) {
      const node = fileMap.get(id);
      if (!node) continue;
      for (const imp of (node.internalImports ?? [])) {
        if (!visited.has(imp)) { visited.add(imp); next.push(imp); }
      }
      for (const ref of (node.referencedBy ?? [])) {
        if (!visited.has(ref)) { visited.add(ref); next.push(ref); }
      }
    }
    frontier = next;
  }

  return visited;
}

const LAYER_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  Routes:      { bg: "bg-blue-950/60", border: "border-blue-500/70",   text: "text-blue-300" },
  Controllers: { bg: "bg-purple-950/60", border: "border-purple-500/70", text: "text-purple-300" },
  Services:    { bg: "bg-amber-950/60", border: "border-amber-500/70", text: "text-amber-300" },
  Repositories:{ bg: "bg-emerald-950/60", border: "border-emerald-500/70", text: "text-emerald-300" },
  Database:    { bg: "bg-rose-950/60", border: "border-rose-500/70", text: "text-rose-300" },
};

export default function FileGraph({ result }: { result: any }) {
  const [focusQuery, setFocusQuery] = useState("");
  const [focusActive, setFocusActive] = useState(false);

  const focusedNodes = useMemo(() => {
    return focusActive && focusQuery ? getFocusedNodes(result, focusQuery) : new Set<string>();
  }, [focusActive, focusQuery, result]);

  const { nodes, edges } = useMemo(() => {
    if (!result?.architecture?.graph) return { nodes: [], edges: [] };
    const archGraph = result.architecture.graph;

    const hasFocus = focusedNodes.size > 0;
    const positions: Record<string, { x: number; y: number }> = {};
    
    const flowNodes = (archGraph.nodes as any[])
      .filter((n) => !hasFocus || focusedNodes.has(n.id))
      .map((node, i) => {
        const angle = (i / Math.max(1, archGraph.nodes.length)) * 2 * Math.PI;
        const r = Math.min(360, 100 + archGraph.nodes.length * 8);
        const x = 500 + r * Math.cos(angle);
        const y = 400 + r * Math.sin(angle);
        positions[node.id] = { x, y };
        
        const colors = LAYER_COLORS[node.layer] || LAYER_COLORS.Services;
        
        return {
          id: node.id,
          type: "default",
          data: {
            label: (
              <div className={`p-2.5 rounded-xl border text-center min-w-[120px] transition-all duration-300 bg-zinc-900/80 backdrop-blur-sm ${colors.border} ${colors.text}`}>
                <div className="text-[8px] font-bold uppercase tracking-wider mb-0.5 opacity-60">{node.layer}</div>
                <div className="text-[10px] font-mono font-bold truncate" title={node.label}>{node.label}</div>
              </div>
            )
          },
          position: { x, y },
          style: { background: "transparent", border: "none", padding: 0 }
        };
      });

    const nodeIdsSet = new Set(flowNodes.map(n => n.id));
    const flowEdges = (archGraph.edges as any[])
      .filter((e) => !hasFocus || (nodeIdsSet.has(e.source) && nodeIdsSet.has(e.target)))
      .map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        animated: edge.animated,
        style: { stroke: "#3f3f46", strokeWidth: 1 }
      }));

    return { nodes: flowNodes, edges: flowEdges };
  }, [result, focusedNodes]);

  return (
    <div className="space-y-4 text-left">
      {/* Controls */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            className="w-full pl-8 pr-8 py-1.5 text-xs bg-zinc-900/80 border border-border/60 rounded-lg text-zinc-300 focus:outline-none focus:border-primary/40"
            placeholder="Focus on file (e.g. authService)..."
            value={focusQuery}
            onChange={e => setFocusQuery(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") setFocusActive(true); }}
          />
          {focusQuery && (
            <button onClick={() => { setFocusQuery(""); setFocusActive(false); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-white">
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
        <Button onClick={() => setFocusActive(true)} className="text-[10px] px-3 py-1.5 h-auto">
          <Eye className="w-3 h-3 mr-1" />Focus
        </Button>
        {focusActive && focusedNodes.size > 0 && (
          <span className="text-[9px] text-primary font-semibold">Showing {focusedNodes.size} related nodes</span>
        )}
      </div>

      {/* Canvas */}
      <div className="w-full rounded-2xl overflow-hidden border border-border/60 bg-zinc-950/60 relative" style={{ height: "480px" }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          fitView
          panOnDrag
          zoomOnScroll
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          proOptions={{ hideAttribution: true }}
        >
          <Background color="#27272a" gap={20} />
          <Controls />
        </ReactFlow>

        {/* Float Hint */}
        <div className="absolute top-3 left-3 px-3 py-1.5 rounded-lg bg-zinc-900/80 border border-border/60 text-[10px] font-semibold text-zinc-400 pointer-events-none flex items-center gap-1.5">
          <Network className="w-3.5 h-3.5 text-primary" />
          <span>Circular Dependency imports visualizer</span>
        </div>
      </div>
    </div>
  );
}
