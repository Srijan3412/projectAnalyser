import React, { useState, useMemo } from "react";
import { ReactFlow, Background, Controls, Node as ReactFlowNode, Edge as ReactFlowEdge, MarkerType } from "@xyflow/react";
import { FileNode } from "@shared/types";
import { Settings, ArrowRight, ArrowLeft } from "lucide-react";

export default function DependencyGraph({ result }: { result: any }) {
  const [selectedFile, setSelectedFile] = useState("");

  const filesList = useMemo(() => {
    const all = result?.files || [];
    return all.filter((f: FileNode) => {
      const p = f.path.toLowerCase();
      return !p.startsWith("route:") && !p.startsWith("env:") && !p.startsWith("db:") && !p.startsWith("entity:");
    });
  }, [result]);

  const { nodes, edges } = useMemo(() => {
    if (!selectedFile) return { nodes: [], edges: [] };
    
    const fileNode = filesList.find((f: FileNode) => f.path === selectedFile);
    if (!fileNode) return { nodes: [], edges: [] };

    const flowNodes: ReactFlowNode[] = [];
    const flowEdges: ReactFlowEdge[] = [];

    const xCol1 = 50;   // Referenced By (Incoming)
    const xCol2 = 300;  // Central Selected File
    const xCol3 = 550;  // Imports (Outgoing)

    // 1. Central Node
    flowNodes.push({
      id: "center-node",
      type: "default",
      data: {
        label: (
          <div className="p-3 rounded-xl border border-primary bg-primary/10 text-primary font-bold text-center min-w-[180px] shadow-lg">
            <div className="text-[8px] uppercase tracking-wider font-semibold opacity-60">Selected Module</div>
            <div className="text-xs font-mono font-bold truncate" title={fileNode.path}>{fileNode.path.split(/[\\/]/).pop()}</div>
          </div>
        )
      },
      position: { x: xCol2, y: 150 },
      style: { background: "transparent", border: "none", padding: 0 }
    });

    // 2. Incoming Nodes (Referenced By)
    const incoming = fileNode.referencedBy || [];
    incoming.forEach((refPath: string, idx: number) => {
      const refName = refPath.split(/[\\/]/).pop() || refPath;
      flowNodes.push({
        id: `incoming-${refPath}`,
        type: "default",
        data: {
          label: (
            <div className="p-2.5 rounded-xl border border-purple-500/50 bg-purple-950/20 text-purple-300 text-center min-w-[150px]">
              <div className="text-[7.5px] uppercase tracking-wider font-semibold opacity-60">Referenced By</div>
              <div className="text-[10px] font-mono truncate" title={refPath}>{refName}</div>
            </div>
          )
        },
        position: { x: xCol1, y: idx * 80 + 30 },
        style: { background: "transparent", border: "none", padding: 0 }
      });

      flowEdges.push({
        id: `edge-incoming-${refPath}`,
        source: `incoming-${refPath}`,
        target: "center-node",
        animated: true,
        markerEnd: { type: MarkerType.ArrowClosed },
        style: { stroke: "#a78bfa", strokeWidth: 1.5 }
      });
    });

    // 3. Outgoing Nodes (Imports)
    const outgoing = fileNode.internalImports || [];
    outgoing.forEach((impPath: string, idx: number) => {
      const impName = impPath.split(/[\\/]/).pop() || impPath;
      flowNodes.push({
        id: `outgoing-${impPath}`,
        type: "default",
        data: {
          label: (
            <div className="p-2.5 rounded-xl border border-blue-500/50 bg-blue-950/20 text-blue-300 text-center min-w-[150px]">
              <div className="text-[7.5px] uppercase tracking-wider font-semibold opacity-60">Imports</div>
              <div className="text-[10px] font-mono truncate" title={impPath}>{impName}</div>
            </div>
          )
        },
        position: { x: xCol3, y: idx * 80 + 30 },
        style: { background: "transparent", border: "none", padding: 0 }
      });

      flowEdges.push({
        id: `edge-outgoing-${impPath}`,
        source: "center-node",
        target: `outgoing-${impPath}`,
        animated: true,
        markerEnd: { type: MarkerType.ArrowClosed },
        style: { stroke: "#60a5fa", strokeWidth: 1.5 }
      });
    });

    return { nodes: flowNodes, edges: flowEdges };
  }, [selectedFile, filesList]);

  return (
    <div className="space-y-4 text-left">
      {/* File Selector */}
      <div className="flex items-center gap-2">
        <select
          className="text-xs bg-zinc-900/80 border border-border/60 rounded-lg px-3 py-2 text-zinc-300 focus:outline-none focus:border-primary/40 w-full max-w-sm"
          value={selectedFile}
          onChange={(e) => setSelectedFile(e.target.value)}
        >
          <option value="">— Select a file to inspect links —</option>
          {filesList.map((f: FileNode) => (
            <option key={f.path} value={f.path}>
              {f.path.split(/[\\/]/).pop()}
            </option>
          ))}
        </select>
      </div>

      {/* Canvas */}
      <div className="w-full rounded-2xl overflow-hidden border border-border/60 bg-zinc-950/60 relative" style={{ height: "480px" }}>
        {selectedFile ? (
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
            <Settings className="w-12 h-12 text-zinc-700 mb-2 animate-spin-slow" />
            <h4 className="text-xs font-bold text-zinc-300">File Dependency Links</h4>
            <p className="text-[10px] text-zinc-500 max-w-xs mt-1">Select a codebase module to visualize its direct dependencies and incoming references.</p>
          </div>
        )}

        {/* Float Hint */}
        <div className="absolute top-3 left-3 px-3 py-1.5 rounded-lg bg-zinc-900/80 border border-border/60 text-[10px] font-semibold text-zinc-400 pointer-events-none flex items-center gap-1.5 flex-wrap">
          <ArrowLeft className="w-3 h-3 text-purple-400" />
          <span>Referenced By</span>
          <span className="text-zinc-650 font-bold">→</span>
          <span className="text-primary font-bold">Selected File</span>
          <span className="text-zinc-650 font-bold">→</span>
          <ArrowRight className="w-3 h-3 text-blue-400" />
          <span>Imports</span>
        </div>
      </div>
    </div>
  );
}
