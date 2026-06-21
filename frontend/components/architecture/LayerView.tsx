import React, { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { ReactFlow, Background, Controls, Node as ReactFlowNode, Edge as ReactFlowEdge } from "@xyflow/react";
import { getArchitectureLayers } from "../../lib/api/client";
import LayerNode from "./LayerNode";
import LayerFileNode from "./LayerFileNode";
import LayerDetails from "./LayerDetails";
import { Loader2, Layers } from "lucide-react";
import { useAnalysisStore } from "../../store/analysis.store";

const NODE_TYPES = {
  layerNode: LayerNode,
  layerFileNode: LayerFileNode,
};

export default function LayerView({ result }: { result: any }) {
  const { currentJobId } = useAnalysisStore();
  const [expandedLayer, setExpandedLayer] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [selectedFileLayer, setSelectedFileLayer] = useState<string>("");

  // Fetch categorized layers from backend
  const { data: layersData, isLoading } = useQuery({
    queryKey: ["archLayers", currentJobId],
    queryFn: () => getArchitectureLayers(currentJobId!),
    enabled: !!currentJobId,
  });

  // Local fallback classifier if backend query is not resolved yet or empty
  const layers = useMemo(() => {
    if (layersData?.layers) {
      return layersData.layers;
    }
    
    // Fallback logic
    const files = result?.files || [];
    const dbInfo = result?.metadata?.databaseInfo;
    const classified: Record<string, string[]> = {
      routes: [],
      controllers: [],
      services: [],
      repositories: [],
      models: [],
      database: []
    };

    const rules = [
      { key: "routes", regex: /\broutes\b|\broute\b|\.route\b|src\/routes\//i },
      { key: "controllers", regex: /\bcontrollers\b|\bcontroller\b|\.controller\b|src\/controllers\//i },
      { key: "services", regex: /\bservices\b|\bservice\b|\.service\b|src\/services\//i },
      { key: "repositories", regex: /\brepositories\b|\brepository\b|\brepo\b|\.repository\b|\.repo\b|src\/repositories\//i },
      { key: "models", regex: /\bmodels\b|\bmodel\b|\bentities\b|\bentity\b|\.model\b|\.entity\b|src\/models\//i },
    ];

    for (const f of files) {
      const pathLower = f.path.toLowerCase();
      if (pathLower.startsWith("route:") || pathLower.startsWith("env:") || pathLower.startsWith("db:") || pathLower.startsWith("entity:")) {
        continue;
      }
      let matched = false;
      for (const r of rules) {
        if (r.regex.test(f.path)) {
          classified[r.key].push(f.path);
          matched = true;
          break;
        }
      }
      if (!matched && /\bprisma\b|schema\.prisma|\bconnection\b|\bdb\b/i.test(f.path)) {
        classified.database.push(f.path);
      }
    }

    if (dbInfo?.type) {
      classified.database.push(`DB: ${dbInfo.type}`);
    }

    return classified;
  }, [layersData, result]);

  // Construct ReactFlow nodes & edges dynamically
  const { nodes, edges } = useMemo(() => {
    const layerKeys = ["routes", "controllers", "services", "repositories", "models", "database"];
    const layerLabels: Record<string, string> = {
      routes: "Routes",
      controllers: "Controllers",
      services: "Services",
      repositories: "Repositories",
      models: "Models",
      database: "Database",
    };

    const flowNodes: ReactFlowNode[] = [];
    const flowEdges: ReactFlowEdge[] = [];

    let currentY = 30;
    const xCenter = 220;

    for (let idx = 0; idx < layerKeys.length; idx++) {
      const key = layerKeys[idx];
      const label = layerLabels[key];
      const files = layers[key] || [];
      const isExpanded = expandedLayer === key;

      // Add the Layer node
      flowNodes.push({
        id: `layer-${key}`,
        type: "layerNode",
        data: {
          label,
          count: files.length,
          isExpanded,
          key,
        },
        position: { x: xCenter - 110, y: currentY },
        style: { width: 220 },
      });

      const parentY = currentY;
      currentY += 90; // space below layer card

      // If this layer is expanded, place its files vertically below it
      if (isExpanded && files.length > 0) {
        // Connect the layer card to the first file node
        flowEdges.push({
          id: `edge-layer-to-first-${key}`,
          source: `layer-${key}`,
          target: `file-${files[0]}`,
          animated: true,
          style: { stroke: "#71717a", strokeWidth: 1.5 },
        });

        files.forEach((file, fileIdx) => {
          flowNodes.push({
            id: `file-${file}`,
            type: "layerFileNode",
            data: {
              label: file.split(/[\\/]/).pop() || file,
              isActive: selectedFile === file,
            },
            position: { x: xCenter - 85, y: currentY },
            style: { width: 170 },
          });

          // Connect consecutive file nodes together in a vertical stack
          if (fileIdx > 0) {
            flowEdges.push({
              id: `edge-file-${files[fileIdx - 1]}-to-${file}`,
              source: `file-${files[fileIdx - 1]}`,
              target: `file-${file}`,
              animated: true,
              style: { stroke: "#3f3f46", strokeWidth: 1 },
            });
          }

          currentY += 50; // offset each file card vertically
        });

        currentY += 30; // extra padding at the bottom of the list
      }

      // Connect this layer to the next layer in the sequence
      if (idx < layerKeys.length - 1) {
        const nextKey = layerKeys[idx + 1];
        // If expanded, connection flows from the last file in the stack; otherwise, from the layer node itself
        const sourceNodeId = isExpanded && files.length > 0 ? `file-${files[files.length - 1]}` : `layer-${key}`;
        
        flowEdges.push({
          id: `edge-layer-${key}-to-${nextKey}`,
          source: sourceNodeId,
          target: `layer-${nextKey}`,
          animated: true,
          style: { stroke: "hsl(var(--primary, 60 100% 50%))", strokeWidth: 2 },
        });
      }
    }

    return { nodes: flowNodes, edges: flowEdges };
  }, [layers, expandedLayer, selectedFile]);

  // Handle node clicks
  const onNodeClick = (_event: React.MouseEvent, node: ReactFlowNode) => {
    if (node.id.startsWith("layer-")) {
      const key = node.data.key as string;
      setExpandedLayer(prev => (prev === key ? null : key));
    } else if (node.id.startsWith("file-")) {
      const filePath = node.id.replace("file-", "");
      setSelectedFile(filePath);
      
      // Figure out which layer this file belongs to
      const layerKeys = Object.keys(layers);
      const layerLabels: Record<string, string> = {
        routes: "Routes",
        controllers: "Controllers",
        services: "Services",
        repositories: "Repositories",
        models: "Models",
        database: "Database",
      };
      for (const key of layerKeys) {
        if ((layers[key] || []).includes(filePath)) {
          setSelectedFileLayer(layerLabels[key] || "Services");
          break;
        }
      }
    }
  };

  if (isLoading) {
    return (
      <div className="h-[480px] flex flex-col items-center justify-center text-zinc-500 gap-2 bg-zinc-950/40 border border-border/60 rounded-2xl">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <span className="text-xs">Analyzing system architecture layers...</span>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 h-[520px] text-left">
      {/* Canvas */}
      <div className="lg:col-span-3 rounded-2xl border border-border/60 bg-zinc-950/60 overflow-hidden relative">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={NODE_TYPES}
          onNodeClick={onNodeClick}
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
          <Layers className="w-3.5 h-3.5 text-primary" />
          <span>Click on any tier box to expand/collapse file listings</span>
        </div>
      </div>

      {/* Inspector Details Sidebar */}
      <div className="lg:col-span-1">
        {selectedFile ? (
          <LayerDetails
            filePath={selectedFile}
            layerName={selectedFileLayer}
            result={result}
            onClose={() => setSelectedFile(null)}
          />
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 border border-dashed border-border/80 rounded-2xl bg-zinc-950/20 text-zinc-550">
            <Layers className="w-10 h-10 text-zinc-700 mb-2" />
            <h4 className="text-xs font-bold text-zinc-300">File Inspector</h4>
            <p className="text-[10px] text-zinc-500 max-w-xs mt-1 leading-relaxed">Expand any layer inside the flow diagram and click a file node to review imports, references, and complexity diagnostics.</p>
          </div>
        )}
      </div>
    </div>
  );
}
