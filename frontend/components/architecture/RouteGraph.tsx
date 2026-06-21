import React, { useState, useMemo } from "react";
import { ReactFlow, Background, Controls, Node as ReactFlowNode, Edge as ReactFlowEdge } from "@xyflow/react";
import { RouteNode } from "@shared/types";
import { Network, Zap } from "lucide-react";

const LAYER_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  Routes:      { bg: "bg-blue-950/60", border: "border-blue-500/70",   text: "text-blue-300" },
  Controllers: { bg: "bg-purple-950/60", border: "border-purple-500/70", text: "text-purple-300" },
  Services:    { bg: "bg-amber-950/60", border: "border-amber-500/70", text: "text-amber-300" },
  Repositories:{ bg: "bg-emerald-950/60", border: "border-emerald-500/70", text: "text-emerald-300" },
  Database:    { bg: "bg-rose-950/60", border: "border-rose-500/70", text: "text-rose-300" },
};

export default function RouteGraph({ result }: { result: any }) {
  const [selectedRouteId, setSelectedRouteId] = useState("");

  const routesList = useMemo(() => {
    return result?.routes || [];
  }, [result]);

  const { nodes, edges } = useMemo(() => {
    if (!result?.architecture?.graph || !selectedRouteId) return { nodes: [], edges: [] };
    const archGraph = result.architecture.graph;

    // Find nodes in this route's execution path
    const relevantIds = new Set<string>();
    relevantIds.add(selectedRouteId);

    const flow = (result.metadata?.databaseInfo?.flows ?? []).find(
      (f: any) => `ROUTE:${f.method}:${f.route}` === selectedRouteId
    );
    const route = routesList.find(
      (r: RouteNode) => `ROUTE:${r.method}:${r.path}` === selectedRouteId
    );

    if (route?.chain) route.chain.forEach((c: string) => relevantIds.add(c));
    if (flow?.chain) flow.chain.forEach((c: string) => relevantIds.add(c));
    if (flow?.entities) flow.entities.forEach((e: string) => relevantIds.add(`ENTITY:${e}`));
    const dbType = result.metadata?.databaseInfo?.type ?? "Database";
    relevantIds.add(`DB:${dbType}`);

    const filteredNodes = (archGraph.nodes as any[]).filter(n => relevantIds.has(n.id));

    const layerOrder = ["Routes", "Controllers", "Services", "Repositories", "Database"];
    const sorted = [...filteredNodes].sort((a, b) =>
      layerOrder.indexOf(a.layer) - layerOrder.indexOf(b.layer)
    );

    const flowNodes: ReactFlowNode[] = sorted.map((node, i) => {
      const colors = LAYER_COLORS[node.layer] || LAYER_COLORS.Services;
      return {
        id: node.id,
        type: "default",
        data: {
          label: (
            <div className={`p-3 rounded-xl border text-center min-w-[180px] bg-zinc-900/80 backdrop-blur-sm ${colors.bg} ${colors.border} ${colors.text} font-bold shadow-lg`}>
              <div className="text-[8px] font-bold uppercase tracking-wider mb-1 opacity-60">{node.layer}</div>
              <div className="text-xs font-mono font-bold" title={node.label}>{node.label}</div>
            </div>
          )
        },
        position: { x: 250, y: i * 110 + 30 },
        style: { background: "transparent", border: "none", padding: 0 }
      };
    });

    const nodeIdsSet = new Set(flowNodes.map(n => n.id));
    const flowEdges: ReactFlowEdge[] = (archGraph.edges as any[])
      .filter(e => nodeIdsSet.has(e.source) && nodeIdsSet.has(e.target))
      .map(edge => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        animated: true,
        style: { stroke: "hsl(var(--primary, 60 100% 50%))", strokeWidth: 2 }
      }));

    return { nodes: flowNodes, edges: flowEdges };
  }, [result, selectedRouteId, routesList]);

  return (
    <div className="space-y-4 text-left">
      {/* Route Selector */}
      <div className="flex items-center gap-2">
        <select
          className="text-xs bg-zinc-900/80 border border-border/60 rounded-lg px-3 py-2 text-zinc-300 focus:outline-none focus:border-primary/40 w-full max-w-sm"
          value={selectedRouteId}
          onChange={(e) => setSelectedRouteId(e.target.value)}
        >
          <option value="">— Select a route request path —</option>
          {routesList.map((r: RouteNode) => (
            <option key={`ROUTE:${r.method}:${r.path}`} value={`ROUTE:${r.method}:${r.path}`}>
              {r.method} {r.path}
            </option>
          ))}
        </select>
      </div>

      {/* Canvas */}
      <div className="w-full rounded-2xl overflow-hidden border border-border/60 bg-zinc-950/60 relative" style={{ height: "480px" }}>
        {selectedRouteId ? (
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
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-zinc-550">
            <Zap className="w-12 h-12 text-zinc-700 mb-2 animate-pulse" />
            <h4 className="text-xs font-bold text-zinc-300">Route Execution Flow</h4>
            <p className="text-[10px] text-zinc-500 max-w-xs mt-1">Select an HTTP route path from the dropdown to animate its sequence chain.</p>
          </div>
        )}

        {/* Float Hint */}
        <div className="absolute top-3 left-3 px-3 py-1.5 rounded-lg bg-zinc-900/80 border border-border/60 text-[10px] font-semibold text-zinc-400 pointer-events-none flex items-center gap-1.5">
          <Network className="w-3.5 h-3.5 text-primary" />
          <span>Route endpoint request tracing</span>
        </div>
      </div>
    </div>
  );
}
