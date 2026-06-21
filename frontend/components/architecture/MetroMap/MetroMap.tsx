import React, { useState, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { ReactFlow, Background, Controls, Node as ReactFlowNode, Edge as ReactFlowEdge } from "@xyflow/react";
import { useAnalysisStore } from "../../../store/analysis.store";
import { getFeaturesMap } from "../../../lib/api/client";
import FeatureLegend from "./FeatureLegend";
import FeatureDetails from "./FeatureDetails";
import { Loader2, HelpCircle, Download, Play, Square, Globe, Shield, Settings, Zap, Box, Server } from "lucide-react";
import { FeatureFlow } from "@shared/types";

interface MetroMapProps {
  result: any;
  onSwitchTab?: (tab: any) => void;
  onSetImpactFile?: (file: string) => void;
  onSelectTraceRouteId?: (routeId: string) => void;
}

export default function MetroMap({
  result,
  onSwitchTab,
  onSetImpactFile,
  onSelectTraceRouteId,
}: MetroMapProps) {
  const { currentJobId } = useAnalysisStore();
  
  // Interactive UI State
  const [hoveredFeature, setHoveredFeature] = useState<string | null>(null);
  const [selectedFeature, setSelectedFeature] = useState<string | null>(null);
  const [selectedStationId, setSelectedStationId] = useState<string | null>(null);
  const [healthGlowActive, setHealthGlowActive] = useState<boolean>(false);

  // Transit Journey Mode State
  const [journeyActive, setJourneyActive] = useState<boolean>(false);
  const [journeyFeatureId, setJourneyFeatureId] = useState<string | null>(null);
  const [journeyNodeId, setJourneyNodeId] = useState<string | null>(null);
  const journeyTimerRef = useRef<any>(null);
  
  // ReactFlow instance reference for panning
  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null);

  // 1. Fetch features map from API
  const { data, isLoading } = useQuery({
    queryKey: ["featuresMap", currentJobId],
    queryFn: () => getFeaturesMap(currentJobId!),
    enabled: !!currentJobId,
  });

  const features = useMemo(() => data?.features || [], [data]);

  // Helper to extract file complexity score from static analysis
  const getComplexityScore = (filePath: string) => {
    if (!filePath || !result?.staticAnalysis?.complexity) return 0;
    const info = result.staticAnalysis.complexity.find((c: any) => c.file === filePath);
    return info ? info.score : 0;
  };

  // Helper to classify file categories
  const getStationCategory = (type: string, name: string): "route" | "middleware" | "controller" | "service" | "repository" | "database" => {
    if (type === "route") return "route";
    if (type === "db") return "database";
    const lower = name.toLowerCase();
    if (
      lower.includes("middleware") || 
      lower.includes("guard") || 
      (lower.includes("auth") && (lower.includes("middleware") || lower.includes("guard") || lower.includes("jwt")))
    ) {
      return "middleware";
    }
    if (lower.includes("controller") || lower.includes("handler") || lower.includes("resolver")) {
      return "controller";
    }
    if (lower.includes("repository") || lower.includes("repo") || lower.includes("model") || lower.includes("schema")) {
      return "repository";
    }
    return "service";
  };

  // Custom node icon mapper
  const getStationIcon = (stationType: string) => {
    const iconProps = { className: "w-3 h-3 text-zinc-400 shrink-0" };
    switch (stationType) {
      case "route": return <Globe {...iconProps} />;
      case "middleware": return <Shield {...iconProps} />;
      case "controller": return <Settings {...iconProps} />;
      case "service": return <Zap {...iconProps} />;
      case "repository": return <Box {...iconProps} />;
      case "database": return <Server {...iconProps} />;
      default: return <Zap {...iconProps} />;
    }
  };

  // Map each feature to its ordered stations list
  const featureLines = useMemo(() => {
    const lines: Record<string, any[]> = {};
    features.forEach((feature) => {
      // Map clean routes (e.g. "POST /login")
      const routeStations = feature.routes.map(r => {
        const spaceIdx = r.indexOf(" ");
        const method = spaceIdx > 0 ? r.substring(0, spaceIdx) : "GET";
        const path = spaceIdx > 0 ? r.substring(spaceIdx + 1) : r;
        return {
          id: `station:${feature.id}:route:${method}:${path}`,
          label: r,
          type: "route",
          key: `route:${method}:${path}`,
          raw: r
        };
      });

      // Map files (e.g. "src/services/authService.ts")
      const fileStations = feature.files.map(fPath => {
        const filename = fPath.split(/[\\/]/).pop() || fPath;
        const cat = getStationCategory("file", filename);
        return {
          id: `station:${feature.id}:file:${fPath}`,
          label: filename,
          type: cat,
          key: `file:${fPath}`,
          raw: fPath
        };
      });

      // Map DB tables
      const dbStations = (feature.database || []).map(ent => {
        return {
          id: `station:${feature.id}:db:${ent}`,
          label: ent,
          type: "database",
          key: `db:${ent}`,
          raw: ent
        };
      });

      const categoryOrder: Record<string, number> = {
        route: 0,
        middleware: 1,
        controller: 2,
        service: 3,
        repository: 4,
        database: 5
      };

      const allStations = [...routeStations, ...fileStations, ...dbStations];
      allStations.sort((a, b) => categoryOrder[a.type] - categoryOrder[b.type]);
      lines[feature.id] = allStations;
    });
    return lines;
  }, [features]);

  // Compute Layout Positions (Y by feature index, X by step index with clumping alignment)
  const positions = useMemo(() => {
    const posMap: Record<string, Record<string, { x: number; y: number }>> = {};
    features.forEach((feature, fIdx) => {
      posMap[feature.id] = {};
      const stations = featureLines[feature.id] || [];
      stations.forEach((station, stepIdx) => {
        posMap[feature.id][station.id] = {
          x: stepIdx * 250,
          y: fIdx * 200 + 70
        };
      });
    });

    // Share keys index
    const keyToInstances: Record<string, { featureId: string; stationId: string }[]> = {};
    features.forEach((feature) => {
      const stations = featureLines[feature.id] || [];
      stations.forEach((station) => {
        if (!keyToInstances[station.key]) {
          keyToInstances[station.key] = [];
        }
        keyToInstances[station.key].push({
          featureId: feature.id,
          stationId: station.id
        });
      });
    });

    // Relaxation solver loop
    for (let iter = 0; iter < 3; iter++) {
      Object.entries(keyToInstances).forEach(([_, instances]) => {
        if (instances.length > 1) {
          let maxX = 0;
          instances.forEach((inst) => {
            const pos = posMap[inst.featureId]?.[inst.stationId];
            if (pos && pos.x > maxX) {
              maxX = pos.x;
            }
          });

          instances.forEach((inst) => {
            const pos = posMap[inst.featureId]?.[inst.stationId];
            if (pos) {
              const shift = maxX - pos.x;
              if (shift > 0) {
                const lineStations = featureLines[inst.featureId] || [];
                const stationIdx = lineStations.findIndex((s) => s.id === inst.stationId);
                if (stationIdx >= 0) {
                  for (let i = stationIdx; i < lineStations.length; i++) {
                    const sId = lineStations[i].id;
                    if (posMap[inst.featureId]?.[sId]) {
                      posMap[inst.featureId][sId].x += shift;
                    }
                  }
                }
              }
            }
          });
        }
      });
    }

    return posMap;
  }, [features, featureLines]);

  // 2. Compute ReactFlow Nodes and Edges
  const { nodes, edges } = useMemo(() => {
    if (features.length === 0) return { nodes: [], edges: [] };

    const flowNodes: ReactFlowNode[] = [];
    const flowEdges: ReactFlowEdge[] = [];

    // Find shared keys index for transfer/highlight
    const keyToInstances: Record<string, { featureId: string; stationId: string }[]> = {};
    features.forEach((feature) => {
      const stations = featureLines[feature.id] || [];
      stations.forEach((station) => {
        if (!keyToInstances[station.key]) {
          keyToInstances[station.key] = [];
        }
        keyToInstances[station.key].push({
          featureId: feature.id,
          stationId: station.id
        });
      });
    });

    const hasHighlight = hoveredFeature !== null || selectedFeature !== null;
    const activeFeatureId = selectedFeature || hoveredFeature;

    // Build Station Nodes
    features.forEach((feature) => {
      const stations = featureLines[feature.id] || [];
      const isActiveLine = activeFeatureId === feature.id;

      stations.forEach((station) => {
        const pos = positions[feature.id]?.[station.id];
        if (!pos) return;

        const instances = keyToInstances[station.key] || [];
        const isSharedActive = instances.some(inst => inst.featureId === activeFeatureId);
        const isNodeActive = hasHighlight ? (isActiveLine || isSharedActive) : true;

        const complexity = station.type === "route" || station.type === "database" ? 0 : getComplexityScore(station.raw);
        const hasHighComplexity = complexity > 15;

        // Custom Highlight and Glow Overlay Styling
        let glowStyle: React.CSSProperties = {};
        
        // Check if node is active in Journey
        const isJourneyActiveNode = journeyActive && journeyNodeId === station.id;
        
        if (isJourneyActiveNode) {
          glowStyle = {
            boxShadow: `0 0 25px ${feature.color}, inset 0 0 10px ${feature.color}`,
            border: `2px solid ${feature.color}`,
            transform: "scale(1.08)",
            transition: "all 0.3s ease-in-out"
          };
        } else if (healthGlowActive && isNodeActive) {
          if (hasHighComplexity) {
            glowStyle = {
              boxShadow: "0 0 16px rgba(239, 68, 68, 0.75)",
              border: "1.5px solid rgb(239, 68, 68)"
            };
          } else {
            glowStyle = {
              boxShadow: "0 0 12px rgba(16, 185, 129, 0.45)",
              border: "1.5px solid rgb(16, 185, 129)"
            };
          }
        }

        const isSelectedNode = selectedStationId === station.id;

        flowNodes.push({
          id: station.id,
          type: "default",
          data: {
            label: (
              <div
                onClick={() => {
                  setSelectedStationId(station.id);
                  setSelectedFeature(null); // Deselect feature details when clicking node
                }}
                className={`p-3 rounded-xl border text-center min-w-[170px] bg-zinc-950/90 backdrop-blur-md transition-all duration-300 ${
                  isSelectedNode
                    ? "border-primary ring-2 ring-primary bg-primary/10 scale-105"
                    : "border-border/60 hover:border-primary/50"
                }`}
                style={{
                  opacity: isNodeActive ? 1.0 : 0.25,
                  cursor: "pointer",
                  ...glowStyle
                }}
              >
                <div className="flex items-center gap-1.5 justify-center mb-1">
                  <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: feature.color }} />
                  {getStationIcon(station.type)}
                  <span className="text-[7.5px] font-bold uppercase tracking-widest text-zinc-450">{station.type}</span>
                </div>
                <div className="text-[10px] font-mono font-bold truncate text-zinc-200" title={station.raw}>
                  {station.label}
                </div>
                {healthGlowActive && (station.type !== "route" && station.type !== "database") && (
                  <div className="text-[7.5px] mt-1 font-semibold uppercase tracking-wider">
                    {hasHighComplexity ? (
                      <span className="text-red-400">Risk: {complexity} (High)</span>
                    ) : (
                      <span className="text-emerald-400">Complexity: {complexity || "Low"}</span>
                    )}
                  </div>
                )}
              </div>
            )
          },
          position: pos,
          style: { background: "transparent", border: "none", padding: 0 }
        });
      });
    });

    // Build Horizontal Tube Lines (Thickness based on feature size)
    features.forEach((feature) => {
      const stations = featureLines[feature.id] || [];
      const isActiveLine = activeFeatureId === feature.id;
      const isLineDimmed = hasHighlight && !isActiveLine;
      
      // Calculate Line Thickness based on file count
      const lineThickness = Math.max(3, Math.min(8, 3 + (feature.files.length + feature.routes.length) * 0.25));

      for (let i = 0; i < stations.length - 1; i++) {
        const sNode = stations[i];
        const tNode = stations[i + 1];
        flowEdges.push({
          id: `edge:${feature.id}:${sNode.id}:${tNode.id}`,
          source: sNode.id,
          target: tNode.id,
          animated: isActiveLine || (journeyActive && journeyFeatureId === feature.id),
          style: {
            stroke: feature.color,
            strokeWidth: isActiveLine ? lineThickness + 2 : lineThickness,
            opacity: isLineDimmed ? 0.15 : 0.8,
            transition: "stroke-width 0.2s, opacity 0.2s"
          }
        });
      }
    });

    // Build Vertical Interchange Dash Lines
    Object.entries(keyToInstances).forEach(([_, instances]) => {
      if (instances.length > 1) {
        const sortedInst = [...instances].sort((a: any, b: any) => {
          const fIdxA = features.findIndex((f: FeatureFlow) => f.id === a.featureId);
          const fIdxB = features.findIndex((f: FeatureFlow) => f.id === b.featureId);
          return fIdxA - fIdxB;
        });

        for (let i = 0; i < sortedInst.length - 1; i++) {
          const src = sortedInst[i];
          const dest = sortedInst[i + 1];

          const isSharedActive = activeFeatureId === src.featureId || activeFeatureId === dest.featureId;
          const isDimmed = hasHighlight && !isSharedActive;

          flowEdges.push({
            id: `transfer:${src.stationId}:${dest.stationId}`,
            source: src.stationId,
            target: dest.stationId,
            animated: false,
            style: {
              stroke: "#71717a",
              strokeWidth: 6,
              strokeDasharray: "4 4",
              opacity: isDimmed ? 0.12 : 0.7,
              transition: "opacity 0.2s"
            }
          });
        }
      }
    });

    return { nodes: flowNodes, edges: flowEdges };
  }, [features, featureLines, positions, hoveredFeature, selectedFeature, selectedStationId, healthGlowActive, journeyActive, journeyNodeId, result]);

  // Journey Controller Engine
  const startJourney = (featureId: string) => {
    if (journeyTimerRef.current) clearInterval(journeyTimerRef.current);

    const stations = featureLines[featureId] || [];
    if (stations.length === 0) return;

    setJourneyActive(true);
    setJourneyFeatureId(featureId);
    setSelectedFeature(featureId);
    setSelectedStationId(stations[0].id);

    let index = 0;
    setJourneyNodeId(stations[0].id);

    // Pan to first node
    const firstPos = positions[featureId]?.[stations[0].id];
    if (firstPos && reactFlowInstance) {
      reactFlowInstance.setCenter(firstPos.x + 85, firstPos.y + 30, { zoom: 1.1, duration: 800 });
    }

    journeyTimerRef.current = setInterval(() => {
      index++;
      if (index >= stations.length) {
        // Complete Journey
        clearInterval(journeyTimerRef.current);
        setJourneyActive(false);
        setJourneyNodeId(null);
        setJourneyFeatureId(null);
        if (reactFlowInstance) reactFlowInstance.fitView({ duration: 1000 });
      } else {
        const node = stations[index];
        setJourneyNodeId(node.id);
        setSelectedStationId(node.id); // open inspector

        // Center on the active station node
        const pos = positions[featureId]?.[node.id];
        if (pos && reactFlowInstance) {
          reactFlowInstance.setCenter(pos.x + 85, pos.y + 30, { zoom: 1.1, duration: 800 });
        }
      }
    }, 1500); // 1.5 seconds per station
  };

  const stopJourney = () => {
    if (journeyTimerRef.current) clearInterval(journeyTimerRef.current);
    setJourneyActive(false);
    setJourneyNodeId(null);
    setJourneyFeatureId(null);
    if (reactFlowInstance) reactFlowInstance.fitView({ duration: 800 });
  };

  // Vector SVG Exporter Script
  const exportToSvg = () => {
    if (nodes.length === 0) return;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    nodes.forEach(n => {
      const x = n.position.x;
      const y = n.position.y;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    });

    const padding = 150;
    const width = (maxX - minX) + padding * 2;
    const height = (maxY - minY) + padding * 2;

    let svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX - padding} ${minY - padding} ${width} ${height}" width="${width}" height="${height}" style="background-color: #09090b; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;">`;

    // Canvas Background Rect
    svgContent += `<rect x="${minX - padding}" y="${minY - padding}" width="${width}" height="${height}" fill="#09090b" />`;

    // Draw background dot patterns
    for (let gx = Math.floor((minX - padding) / 20) * 20; gx < maxX + padding; gx += 20) {
      for (let gy = Math.floor((minY - padding) / 20) * 20; gy < maxY + padding; gy += 20) {
        svgContent += `<circle cx="${gx}" cy="${gy}" r="0.75" fill="#27272a" />`;
      }
    }

    // Draw Line Tracks (Edges)
    edges.forEach(e => {
      const sourceNode = nodes.find(n => n.id === e.source);
      const targetNode = nodes.find(n => n.id === e.target);
      if (!sourceNode || !targetNode) return;

      const stroke = e.style?.stroke || "#71717a";
      const strokeWidth = e.style?.strokeWidth || 4;
      const dashArray = e.style?.strokeDasharray ? `stroke-dasharray="4 4"` : "";

      svgContent += `<line x1="${sourceNode.position.x + 85}" y1="${sourceNode.position.y + 30}" x2="${targetNode.position.x + 85}" y2="${targetNode.position.y + 30}" stroke="${stroke}" stroke-width="${strokeWidth}" ${dashArray} />`;
    });

    // Draw Stations (Nodes)
    nodes.forEach(n => {
      const x = n.position.x;
      const y = n.position.y;
      const parts = n.id.split(":");
      const featureId = parts[1];
      const type = parts[2];

      let labelText = "";
      if (type === "route") {
        labelText = `${parts[3]} ${parts.slice(4).join(":")}`;
      } else if (type === "file") {
        labelText = parts.slice(3).join(":").split(/[\\/]/).pop() || "";
      } else {
        labelText = parts.slice(3).join(":");
      }

      const feature = features.find(f => f.id === featureId);
      const color = feature ? feature.color : "#a1a1aa";

      svgContent += `
        <g>
          <rect x="${x}" y="${y}" width="170" height="60" rx="10" fill="#09090b" stroke="${color}" stroke-width="1.5" />
          <circle cx="${x + 18}" cy="${y + 18}" r="3.5" fill="${color}" />
          <text x="${x + 28}" y="${y + 21}" fill="#a1a1aa" font-size="7" font-weight="bold" letter-spacing="1">${type.toUpperCase()}</text>
          <text x="${x + 15}" y="${y + 42}" fill="#e4e4e7" font-size="9" font-weight="bold" font-family="monospace">${labelText}</text>
        </g>
      `;
    });

    svgContent += `</svg>`;

    // Trigger file download in browser
    const blob = new Blob([svgContent], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${result?.overview?.repoName || "repository"}-metro-map.svg`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <div className="h-[480px] flex flex-col items-center justify-center text-zinc-550 gap-2 bg-zinc-950/40 border border-border/60 rounded-2xl">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <span className="text-xs font-semibold">Discovering and mapping code features...</span>
      </div>
    );
  }

  // Handle selected items for Details scope
  const activeDetailsScope = selectedStationId || selectedFeature;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 h-[600px] text-left">
      {/* Legend Column */}
      <div className="lg:col-span-1 h-full overflow-hidden">
        <FeatureLegend
          features={features}
          result={result}
          hoveredFeature={hoveredFeature}
          setHoveredFeature={setHoveredFeature}
          selectedFeature={selectedFeature}
          setSelectedFeature={(fId) => {
            setSelectedFeature(fId);
            setSelectedStationId(null); // clear node selection when feature legend is selected
          }}
        />
      </div>

      {/* ReactFlow Canvas Column */}
      <div className="lg:col-span-2 rounded-2xl overflow-hidden border border-border/60 bg-zinc-950/60 relative h-full">
        {/* Map Control Buttons: Glow Switch + SVG Exporter */}
        <div className="absolute top-3 right-3 z-10 flex items-center gap-2 bg-zinc-900/90 border border-border/60 rounded-xl px-3 py-1.5 backdrop-blur-md shadow-lg">
          <button
            onClick={exportToSvg}
            className="flex items-center gap-1.5 bg-zinc-950 border border-border/60 hover:border-zinc-500 hover:text-white px-2 py-1 rounded-lg text-[9px] font-extrabold text-zinc-350 shadow-sm transition"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export SVG</span>
          </button>
          
          <div className="w-[1px] h-3.5 bg-border/60" />

          <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest">Health Glow</span>
          <button
            onClick={() => setHealthGlowActive(!healthGlowActive)}
            className={`w-8 h-4.5 rounded-full transition-colors relative flex items-center ${
              healthGlowActive ? "bg-primary" : "bg-zinc-700"
            }`}
          >
            <div
              className={`w-3.5 h-3.5 rounded-full bg-zinc-950 transition-transform ${
                healthGlowActive ? "translate-x-4" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>

        {/* Legend Hint overlay */}
        <div className="absolute top-3 left-3 z-10 px-3 py-1.5 rounded-lg bg-zinc-900/95 border border-border/60 text-[9.5px] font-bold text-zinc-400 pointer-events-none flex items-center gap-1.5">
          <HelpCircle className="w-3.5 h-3.5 text-zinc-550 shrink-0" />
          <span>Software Metro Map Dashboard</span>
        </div>

        <ReactFlow
          nodes={nodes}
          edges={edges}
          onInit={(instance) => setReactFlowInstance(instance)}
          fitView
          panOnDrag
          zoomOnScroll
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          proOptions={{ hideAttribution: true }}
        >
          <Background color="#222" gap={20} />
          <Controls />
        </ReactFlow>
      </div>

      {/* Details/Inspector Column */}
      <div className="lg:col-span-1 h-full overflow-hidden">
        {activeDetailsScope ? (
          <FeatureDetails
            stationId={selectedStationId}
            featureId={selectedFeature}
            result={result}
            features={features}
            onClose={() => {
              setSelectedStationId(null);
              setSelectedFeature(null);
            }}
            onSwitchTab={onSwitchTab}
            onSetImpactFile={onSetImpactFile}
            onSelectTraceRouteId={onSelectTraceRouteId}
            onStartJourney={startJourney}
            onStopJourney={stopJourney}
            journeyActive={journeyActive}
            journeyNodeId={journeyNodeId}
          />
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 border border-dashed border-border/80 rounded-2xl bg-zinc-950/20 text-zinc-550">
            <HelpCircle className="w-10 h-10 text-zinc-700 mb-2 animate-pulse" />
            <h4 className="text-xs font-bold text-zinc-300">Map Inspector</h4>
            <p className="text-[10px] text-zinc-500 max-w-xs mt-1 leading-relaxed">
              Click on a station node or select a business feature on the legend to inspect metrics, check complexity ratings, or trigger Journey Mode.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
