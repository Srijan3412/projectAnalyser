import React, { useState, useMemo, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { ReactFlow, Background, Controls, MiniMap, Node as ReactFlowNode, Edge as ReactFlowEdge } from "@xyflow/react";
import { useAnalysisStore } from "../../../store/analysis.store";
import { getSubwayMap, getFeaturesMap, getImpactAnalysis } from "../../../lib/api/client";
import SubwayLegend from "./SubwayLegend";
import SubwayDetails from "./SubwayDetails";
import { Loader2, HelpCircle, Download, Play, Square, Globe, Shield, Settings, Zap, Box, Server, GitMerge, ChevronDown, Search, X, Network, ChevronLeft, ChevronRight } from "lucide-react";
import { FeatureFlow, RepositorySubway, SubwayStation, SubwayLine, RouteNode } from "@shared/types";
import { Badge } from "../../ui/badge";


interface SubwayMapProps {
  result: any;
  onSwitchTab?: (tab: any) => void;
  onSetImpactFile?: (file: string) => void;
  onSelectTraceRouteId?: (routeId: string) => void;
}

export default function SubwayMap({
  result,
  onSwitchTab,
  onSetImpactFile,
  onSelectTraceRouteId,
}: SubwayMapProps) {
  const { currentJobId } = useAnalysisStore();
  
  // Interactive UI State
  const [hoveredFeature, setHoveredFeature] = useState<string | null>(null);
  const [selectedFeature, setSelectedFeature] = useState<string | null>(null);
  const [selectedStationId, setSelectedStationId] = useState<string | null>(null); // e.g. "subway:Authentication:src/services/authService.ts"
  const [healthGlowActive, setHealthGlowActive] = useState<boolean>(false);

  // Transit Journey Mode State
  const [journeyActive, setJourneyActive] = useState<boolean>(false);
  const [journeyFeatureId, setJourneyFeatureId] = useState<string | null>(null);
  const [journeyNodeId, setJourneyNodeId] = useState<string | null>(null);
  const journeyTimerRef = useRef<any>(null);
  
  // ReactFlow instance reference for panning
  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null);

  // Focus Mode & Route Highlight State
  const [focusQuery, setFocusQuery] = useState<string>("");
  const [hoveredRoute, setHoveredRoute] = useState<any | null>(null);

  // Premium Phase E States
  const [focusDepth, setFocusDepth] = useState<number>(1);
  const [tourActive, setTourActive] = useState<boolean>(false);
  const [tourStepIndex, setTourStepIndex] = useState<number>(0);
  const [healthOverlayActive, setHealthOverlayActive] = useState<boolean>(false);
  const [impactHighlightActive, setImpactHighlightActive] = useState<boolean>(false);

  // 1. Fetch features map from API
  const { data: featuresData, isLoading: isFeaturesLoading } = useQuery({
    queryKey: ["featuresMap", currentJobId],
    queryFn: () => getFeaturesMap(currentJobId!),
    enabled: !!currentJobId,
  });

  // 2. Fetch subway data and layout from API
  const { data: subwayData, isLoading: isSubwayLoading } = useQuery({
    queryKey: ["subwayMap", currentJobId],
    queryFn: () => getSubwayMap(currentJobId!),
    enabled: !!currentJobId,
  });

  const features = useMemo(() => featuresData?.features || [], [featuresData]);
  const subway = useMemo(() => subwayData?.subway, [subwayData]);
  const layout = useMemo(() => subwayData?.layout, [subwayData]);

  // Helper to extract file complexity score from static analysis
  const getComplexityScore = (filePath: string) => {
    if (!filePath || !result?.staticAnalysis?.complexity) return 0;
    const info = result.staticAnalysis.complexity.find((c: any) => c.file === filePath);
    return info ? info.score : 0;
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

  // BFS Helper to find all focused nodes and their neighbors within focusDepth hops
  const getFocusNeighbors = useMemo(() => {
    const matched = new Set<string>();
    if (!focusQuery.trim() || !subway) return matched;

    // 1. Initial matches
    subway.stations.forEach((s: any) => {
      const isMatch = s.id.toLowerCase().includes(focusQuery.toLowerCase()) ||
                      s.type.toLowerCase().includes(focusQuery.toLowerCase()) ||
                      s.features.some((f: string) => f.toLowerCase().includes(focusQuery.toLowerCase()));
      if (isMatch) {
        matched.add(s.id);
      }
    });

    // 2. BFS neighbor traversal
    let frontier = Array.from(matched);
    const visited = new Set<string>(matched);
    const files = result?.files || [];
    const fileMap = new Map<string, any>(files.map((f: any) => [f.path, f]));

    for (let d = 0; d < focusDepth; d++) {
      const nextFrontier: string[] = [];
      for (const nodeId of frontier) {
        const fileNode = fileMap.get(nodeId);
        if (fileNode) {
          (fileNode.internalImports || []).forEach((imp: string) => {
            if (!visited.has(imp)) {
              visited.add(imp);
              nextFrontier.push(imp);
            }
          });
          (fileNode.referencedBy || []).forEach((ref: string) => {
            if (!visited.has(ref)) {
              visited.add(ref);
              nextFrontier.push(ref);
            }
          });
        }
        
        if (nodeId.startsWith("route:")) {
          const routeParts = nodeId.split(":");
          const method = routeParts[1];
          const rPath = routeParts.slice(2).join(":");
          const routeNode = result.routes?.find((r: any) => r.method === method && r.path === rPath);
          if (routeNode) {
            if (routeNode.file && !visited.has(routeNode.file)) {
              visited.add(routeNode.file);
              nextFrontier.push(routeNode.file);
            }
            if (routeNode.chain) {
              routeNode.chain.forEach((c: string) => {
                if (!visited.has(c)) {
                  visited.add(c);
                  nextFrontier.push(c);
                }
              });
            }
          }
        }
      }
      frontier = nextFrontier;
    }
    return visited;
  }, [focusQuery, focusDepth, subway, result]);

  // Resolve architecture tour steps
  const tourSteps = useMemo(() => {
    if (!result?.onboarding?.architectureTour) return [];
    
    return result.onboarding.architectureTour.map((filePath: string) => {
      const filename = filePath.split(/[\\/]/).pop() || filePath;
      
      const learnMatch = result.onboarding.learningPath?.find(
        (lp: any) => lp.file === filePath
      );
      
      const critMatch = result.onboarding.criticalFiles?.find(
        (cf: any) => cf.file === filePath
      );

      return {
        file: filePath,
        filename,
        role: critMatch?.role || learnMatch?.label || "Core Request Flow Component",
        reason: learnMatch?.reason || "Crucial file traversed during request execution."
      };
    });
  }, [result]);

  // Resolve selected file path for impact heatmap
  const selectedStationCleanId = useMemo(() => {
    if (!selectedStationId) return null;
    const parts = selectedStationId.split(":");
    const stationIdClean = parts.slice(2).join(":");
    const station = subway?.stations.find((s: any) => s.id === stationIdClean);
    if (station && station.type !== "route" && station.type !== "database") {
      return stationIdClean;
    }
    return null;
  }, [selectedStationId, subway]);

  const { data: impactData } = useQuery({
    queryKey: ["subwayImpact", currentJobId, selectedStationCleanId],
    queryFn: () => getImpactAnalysis(currentJobId!, selectedStationCleanId!),
    enabled: !!currentJobId && !!selectedStationCleanId && impactHighlightActive,
  });

  // Camera tracking: Glides ReactFlow to center on selected station
  useEffect(() => {
    if (selectedStationId && reactFlowInstance && !journeyActive) {
      const pos = layout?.nodes.find((n: any) => n.id === selectedStationId)?.position;
      if (pos) {
        reactFlowInstance.setCenter(pos.x + 85, pos.y + 30, { zoom: 1.25, duration: 800 });
      }
    }
  }, [selectedStationId, reactFlowInstance, layout, journeyActive]);

  // Clear impact highlighting when closing detail
  const handleCloseDetail = () => {
    setSelectedStationId(null);
    setSelectedFeature(null);
    setImpactHighlightActive(false);
  };

  const getTourNodeIdForFile = (filePath: string) => {
    const match = layout?.nodes.find((n: any) => {
      const parts = n.id.split(":");
      const stationIdClean = parts.slice(2).join(":");
      return stationIdClean === filePath;
    });
    return match ? match.id : null;
  };

  const handleTourStepChange = (newIndex: number) => {
    if (newIndex < 0 || newIndex >= tourSteps.length) return;
    setTourStepIndex(newIndex);
    
    const targetFile = tourSteps[newIndex].file;
    const nodeId = getTourNodeIdForFile(targetFile);
    if (nodeId) {
      setSelectedStationId(nodeId);
      const pos = layout?.nodes.find((n: any) => n.id === nodeId)?.position;
      if (pos && reactFlowInstance) {
        reactFlowInstance.setCenter(pos.x + 85, pos.y + 30, { zoom: 1.25, duration: 800 });
      }
    }
  };

  const startTour = () => {
    setTourActive(true);
    setTourStepIndex(0);
    setHoveredRoute(null);
    setFocusQuery("");
    setImpactHighlightActive(false);
    
    if (tourSteps.length > 0) {
      const firstFile = tourSteps[0].file;
      const nodeId = getTourNodeIdForFile(firstFile);
      if (nodeId) {
        setSelectedStationId(nodeId);
        const pos = layout?.nodes.find((n: any) => n.id === nodeId)?.position;
        if (pos && reactFlowInstance) {
          reactFlowInstance.setCenter(pos.x + 85, pos.y + 30, { zoom: 1.25, duration: 800 });
        }
      }
    }
  };

  // Helper to resolve the execution path nodes for the hovered route
  const hoveredRoutePathInfo = useMemo(() => {
    if (!hoveredRoute || !layout) return { nodes: new Set<string>() };
    const pathNodes = new Set<string>();
    
    // 1. Add route node itself
    const targetStationId = `route:${hoveredRoute.method}:${hoveredRoute.path}`;
    layout.nodes.forEach((n: any) => {
      const parts = n.id.split(":");
      const stationIdClean = parts.slice(2).join(":");
      if (stationIdClean === targetStationId) {
        pathNodes.add(n.id);
      }
    });

    // 2. Add files in chain
    if (hoveredRoute.chain) {
      hoveredRoute.chain.forEach((fPath: string) => {
        layout.nodes.forEach((n: any) => {
          const parts = n.id.split(":");
          const stationIdClean = parts.slice(2).join(":");
          if (stationIdClean === fPath) {
            pathNodes.add(n.id);
          }
        });
      });
    }

    // 3. Add database node if route accesses database
    const dbInfo = result.metadata?.databaseInfo;
    if (dbInfo) {
      const matchedFlow = dbInfo.flows?.find(
        (f: any) => f.route === hoveredRoute.path && f.method.toUpperCase() === hoveredRoute.method.toUpperCase()
      );
      if (matchedFlow) {
        const dbStationId = `db:${dbInfo.type || "PostgreSQL"}`;
        layout.nodes.forEach((n: any) => {
          const parts = n.id.split(":");
          const stationIdClean = parts.slice(2).join(":");
          if (stationIdClean === dbStationId) {
            pathNodes.add(n.id);
          }
        });
      }
    }

    return { nodes: pathNodes };
  }, [hoveredRoute, layout, result, subway]);

  // Map backend layout nodes and edges into custom enriched ReactFlow nodes and edges
  const { nodes, edges } = useMemo(() => {
    if (!subway || !layout || features.length === 0) return { nodes: [], edges: [] };

    const flowNodes: ReactFlowNode[] = [];
    const flowEdges: ReactFlowEdge[] = [];

    const hasHighlight = hoveredFeature !== null || selectedFeature !== null;
    const activeFeatureId = selectedFeature || hoveredFeature;

    const hasFocus = focusQuery.trim().length > 0;

    // 1. Process Nodes
    layout.nodes.forEach((rawNode) => {
      const parts = rawNode.id.split(":");
      const nodeFeatureId = parts[1]; // e.g. "Authentication"
      const stationIdClean = parts.slice(2).join(":"); // e.g. "src/services/authService.ts"

      const stationInfo = subway.stations.find((s: SubwayStation) => s.id === stationIdClean);
      const feature = features.find(f => f.id === nodeFeatureId);
      if (!stationInfo || !feature) return;

      // Determine Focus Matching via BFS matched set (getFocusNeighbors)
      const isNodeActive = !hasFocus || getFocusNeighbors.has(stationIdClean);

      // Route Path Highlighting Status
      const isRoutePathNode = hoveredRoute !== null && hoveredRoutePathInfo.nodes.has(rawNode.id);

      // Change Propagation Impact Status
      const isImpactSource = impactHighlightActive && selectedStationCleanId === stationIdClean;
      const isDirectDependent = impactHighlightActive && impactData?.impact?.directDependents?.includes(stationIdClean);
      const isTransitiveDependent = impactHighlightActive && impactData?.impact?.transitiveDependents?.includes(stationIdClean);
      const isImpactAffected = isImpactSource || isDirectDependent || isTransitiveDependent;

      // Node Opacity computation
      let nodeOpacity = 1.0;
      if (hoveredRoute !== null) {
        nodeOpacity = isRoutePathNode ? 1.0 : 0.08;
      } else if (impactHighlightActive) {
        nodeOpacity = isImpactAffected ? 1.0 : 0.08;
      } else if (hasFocus) {
        nodeOpacity = isNodeActive ? 1.0 : 0.12;
      } else if (hasHighlight) {
        // Feature Highlight
        const isActiveLine = activeFeatureId === nodeFeatureId;
        const isSharedActive = stationInfo.features.some((fId: string) => fId === activeFeatureId);
        nodeOpacity = (isActiveLine || isSharedActive) ? 1.0 : 0.25;
      }

      // Health Overlay Color Determination
      let healthColor = "#10b981"; // Healthy Green default
      let healthLabel = "Healthy";
      const fileComplexity = getComplexityScore(stationIdClean);
      const fileIsGod = result?.staticAnalysis?.godServices?.some((g: any) => g.file === stationIdClean);
      const fileIsDead = result?.staticAnalysis?.deadCode?.some((d: any) => d.file === stationIdClean);
      
      if (stationInfo.type !== "route" && stationInfo.type !== "database") {
        if (fileComplexity > 20 || fileIsGod) {
          healthColor = "#ef4444"; // Red (High Risk)
          healthLabel = fileIsGod ? "God Service" : "High Complexity";
        } else if (fileComplexity > 10 || fileIsDead) {
          healthColor = "#f59e0b"; // Yellow (Medium Risk)
          healthLabel = fileIsDead ? "Dead Code" : "Moderate Risk";
        }
      }

      const complexity = stationInfo.type === "route" || stationInfo.type === "database" ? 0 : fileComplexity;
      const hasHighComplexity = complexity > 15;

      // Custom Highlight and Glow Overlay Styling
      let glowStyle: React.CSSProperties = {};
      
      // Check if node is active in Journey
      const isJourneyActiveNode = journeyActive && journeyNodeId === rawNode.id;
      
      if (isJourneyActiveNode) {
        glowStyle = {
          boxShadow: `0 0 25px ${feature.color}, inset 0 0 10px ${feature.color}`,
          border: `2px solid ${feature.color}`,
          transform: "scale(1.08)",
          transition: "all 0.3s ease-in-out"
        };
      } else if (isImpactSource) {
        glowStyle = {
          boxShadow: "0 0 25px #ef4444, inset 0 0 10px #ef4444",
          border: "2.5px solid #ef4444",
          transform: "scale(1.08)",
          transition: "all 0.3s ease-in-out"
        };
      } else if (isDirectDependent) {
        glowStyle = {
          boxShadow: "0 0 18px #f97316, inset 0 0 8px #f97316",
          border: "2px solid #f97316",
          transform: "scale(1.04)",
          transition: "all 0.2s"
        };
      } else if (isTransitiveDependent) {
        glowStyle = {
          boxShadow: "0 0 12px #f59e0b, inset 0 0 4px #f59e0b",
          border: "1.5px solid #f59e0b",
          transform: "scale(1.02)",
          transition: "all 0.2s"
        };
      } else if (isRoutePathNode) {
        glowStyle = {
          boxShadow: `0 0 22px ${feature.color}, inset 0 0 8px ${feature.color}`,
          border: `2.5px solid ${feature.color}`,
          transform: "scale(1.06)",
          transition: "all 0.2s ease-in-out",
        };
      } else if (healthOverlayActive && isNodeActive) {
        glowStyle = {
          boxShadow: `0 0 16px ${healthColor}a0`,
          border: `1.5px solid ${healthColor}`,
          transition: "all 0.2s"
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

      const isSelectedNode = selectedStationId === rawNode.id;
      const filename = stationIdClean.split(/[\\/]/).pop() || stationIdClean;
      let labelName = filename;
      if (stationInfo.type === "route") {
        const routeParts = stationIdClean.split(":");
        labelName = `${routeParts[1]} ${routeParts.slice(2).join(":")}`;
      } else if (stationInfo.type === "database") {
        labelName = stationIdClean.replace("db:", "");
      }

      const isTransfer = stationInfo.features.length > 1;

      flowNodes.push({
        id: rawNode.id,
        type: "default",
        data: {
          label: (
            <div
              onClick={() => {
                setSelectedStationId(rawNode.id);
                setSelectedFeature(null); // Deselect feature details when clicking node
              }}
              className={`p-3 rounded-xl border text-center min-w-[175px] bg-zinc-950/90 backdrop-blur-md transition-all duration-300 ${
                isSelectedNode
                  ? "border-primary ring-2 ring-primary bg-primary/10 scale-105"
                  : "border-border/60 hover:border-primary/50"
              }`}
              style={{
                opacity: nodeOpacity,
                cursor: "pointer",
                ...glowStyle
              }}
            >
              <div className="flex items-center gap-1.5 justify-center mb-1">
                <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: healthOverlayActive ? healthColor : feature.color }} />
                {getStationIcon(stationInfo.type)}
                <span className="text-[7.5px] font-bold uppercase tracking-widest text-zinc-450">{stationInfo.type}</span>
                {isTransfer && (
                  <Badge variant="secondary" className="text-[6.5px] font-extrabold px-1 py-0 bg-primary/10 text-primary border-primary/20 scale-[0.9] shrink-0">
                    🔄 TRF
                  </Badge>
                )}
              </div>
              <div className="text-[10px] font-mono font-bold truncate text-zinc-200" title={stationIdClean}>
                {labelName}
              </div>
              {healthOverlayActive && (stationInfo.type !== "route" && stationInfo.type !== "database") ? (
                <div className="text-[7.5px] mt-1 font-bold uppercase tracking-wider" style={{ color: healthColor }}>
                  {healthLabel}
                </div>
              ) : (
                healthGlowActive && (stationInfo.type !== "route" && stationInfo.type !== "database") && (
                  <div className="text-[7.5px] mt-1 font-semibold uppercase tracking-wider">
                    {hasHighComplexity ? (
                      <span className="text-red-400">Risk: {complexity} (High)</span>
                    ) : (
                      <span className="text-emerald-400">Complexity: {complexity || "Low"}</span>
                    )}
                  </div>
                )
              )}
            </div>
          )
        },
        position: rawNode.position,
        style: { background: "transparent", border: "none", padding: 0 },
        zIndex: isRoutePathNode || isJourneyActiveNode || isImpactAffected ? 100 : 1,
      });
    });

    // 2. Process Edges
    layout.edges.forEach((rawEdge) => {
      const edgeId = rawEdge.id;
      const isTransferEdge = edgeId.startsWith("subway-transfer:");
      
      let stroke = rawEdge.style?.stroke || "#71717a";
      let opacity = rawEdge.style?.opacity || 0.8;
      let strokeWidth = rawEdge.style?.strokeWidth || 4;

      const hasHighlight = hoveredFeature !== null || selectedFeature !== null;
      const activeFeatureId = selectedFeature || hoveredFeature;

      const getCleanId = (flowNodeId: string) => flowNodeId.split(":").slice(2).join(":");
      const srcClean = getCleanId(rawEdge.source);
      const destClean = getCleanId(rawEdge.target);

      const isRoutePathEdgeSimple = hoveredRoute !== null && 
        hoveredRoutePathInfo.nodes.has(rawEdge.source) && 
        hoveredRoutePathInfo.nodes.has(rawEdge.target);

      // Change Propagation Edge Status
      const isImpactSourceSrc = impactHighlightActive && selectedStationCleanId === srcClean;
      const isImpactSourceDest = impactHighlightActive && selectedStationCleanId === destClean;
      const srcAffected = impactHighlightActive && (isImpactSourceSrc || impactData?.impact?.directDependents?.includes(srcClean) || impactData?.impact?.transitiveDependents?.includes(srcClean));
      const destAffected = impactHighlightActive && (isImpactSourceDest || impactData?.impact?.directDependents?.includes(destClean) || impactData?.impact?.transitiveDependents?.includes(destClean));
      const isImpactEdge = impactHighlightActive && srcAffected && destAffected;

      let edgeOpacity = opacity;
      let edgeStrokeWidth = strokeWidth;
      let isEdgeAnimated = rawEdge.animated;

      if (isTransferEdge) {
        // e.g. "subway-transfer:authService.ts:subway:Auth:authService.ts:subway:Users:authService.ts"
        const srcParts = rawEdge.source.split(":");
        const destParts = rawEdge.target.split(":");
        const srcFeat = srcParts[1];
        const destFeat = destParts[1];
        const isSharedActive = activeFeatureId === srcFeat || activeFeatureId === destFeat;
        
        if (hoveredRoute !== null) {
          edgeOpacity = isRoutePathEdgeSimple ? 1.0 : 0.04;
          edgeStrokeWidth = isRoutePathEdgeSimple ? 8 : 6;
          isEdgeAnimated = isRoutePathEdgeSimple;
        } else if (impactHighlightActive) {
          edgeOpacity = isImpactEdge ? 0.95 : 0.04;
          edgeStrokeWidth = isImpactEdge ? 8 : 6;
          isEdgeAnimated = isImpactEdge;
        } else if (hasFocus) {
          const srcMatches = getFocusNeighbors.has(srcClean);
          const destMatches = getFocusNeighbors.has(destClean);
          edgeOpacity = (srcMatches && destMatches) ? 0.7 : 0.05;
        } else {
          if (hasHighlight && !isSharedActive) {
            edgeOpacity = 0.12;
          } else {
            edgeOpacity = 0.7;
          }
        }

        flowEdges.push({
          ...rawEdge,
          className: isEdgeAnimated ? "animated-path" : "",
          style: {
            ...rawEdge.style,
            stroke: "#71717a",
            strokeWidth: edgeStrokeWidth,
            strokeDasharray: "4 4",
            opacity: edgeOpacity,
            transition: "opacity 0.2s"
          }
        });
      } else {
        // Feature Track Edge: "subway-edge:FeatureId:subway:FeatureId:SrcNode:subway:FeatureId:DestNode"
        const featureId = edgeId.split(":")[1];
        const isActiveLine = activeFeatureId === featureId;
        const isLineDimmed = hasHighlight && !isActiveLine;

        if (hoveredRoute !== null) {
          edgeOpacity = isRoutePathEdgeSimple ? 1.0 : 0.04;
          edgeStrokeWidth = isRoutePathEdgeSimple ? strokeWidth + 3.5 : strokeWidth;
          isEdgeAnimated = isRoutePathEdgeSimple;
        } else if (impactHighlightActive) {
          edgeOpacity = isImpactEdge ? 0.95 : 0.04;
          edgeStrokeWidth = isImpactEdge ? strokeWidth + 2.5 : strokeWidth;
          isEdgeAnimated = isImpactEdge;
        } else if (hasFocus) {
          const srcMatches = getFocusNeighbors.has(srcClean);
          const destMatches = getFocusNeighbors.has(destClean);
          edgeOpacity = (srcMatches && destMatches) ? 0.8 : 0.05;
        } else {
          if (isLineDimmed) {
            edgeOpacity = 0.15;
          } else {
            edgeOpacity = 0.8;
          }
        }

        const featureColor = features.find(f => f.id === featureId)?.color || stroke;

        flowEdges.push({
          ...rawEdge,
          className: isEdgeAnimated ? "animated-path" : "",
          animated: isEdgeAnimated || isActiveLine || (journeyActive && journeyFeatureId === featureId),
          style: {
            ...rawEdge.style,
            stroke: featureColor,
            strokeWidth: isActiveLine || isRoutePathEdgeSimple || isImpactEdge ? edgeStrokeWidth + 2 : edgeStrokeWidth,
            opacity: edgeOpacity,
            transition: "stroke-width 0.2s, opacity 0.2s"
          }
        });
      }
    });

    return { nodes: flowNodes, edges: flowEdges };
  }, [subway, layout, features, hoveredFeature, selectedFeature, selectedStationId, healthGlowActive, journeyActive, journeyNodeId, result, focusQuery, hoveredRoute, hoveredRoutePathInfo, focusDepth, getFocusNeighbors, healthOverlayActive, impactHighlightActive, impactData, selectedStationCleanId]);

  // Journey Controller Engine
  const startJourney = (featureId: string) => {
    const lineInfo = subway?.lines.find((l: SubwayLine) => l.feature === featureId);
    const stations = lineInfo?.stations || [];
    if (stations.length === 0) return;

    setJourneyActive(true);
    setJourneyFeatureId(featureId);
    setSelectedFeature(featureId);
    
    let index = 0;
    const firstNodeId = `subway:${featureId}:${stations[0]}`;
    setJourneyNodeId(firstNodeId);
    setSelectedStationId(firstNodeId);

    // Pan to first node
    const firstPos = layout?.nodes.find(n => n.id === firstNodeId)?.position;
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
        const nextNodeId = `subway:${featureId}:${stations[index]}`;
        setJourneyNodeId(nextNodeId);
        setSelectedStationId(nextNodeId); // open inspector

        // Center on the active station node
        const pos = layout?.nodes.find(n => n.id === nextNodeId)?.position;
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
    if (!layout || layout.nodes.length === 0) return;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    layout.nodes.forEach(n => {
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
      const sourceNode = layout.nodes.find(n => n.id === e.source);
      const targetNode = layout.nodes.find(n => n.id === e.target);
      if (!sourceNode || !targetNode) return;

      const stroke = e.style?.stroke || "#71717a";
      const strokeWidth = e.style?.strokeWidth || 4;
      const dashArray = e.style?.strokeDasharray ? `stroke-dasharray="4 4"` : "";

      svgContent += `<line x1="${sourceNode.position.x + 85}" y1="${sourceNode.position.y + 30}" x2="${targetNode.position.x + 85}" y2="${targetNode.position.y + 30}" stroke="${stroke}" stroke-width="${strokeWidth}" ${dashArray} />`;
    });

    // Draw Stations (Nodes)
    layout.nodes.forEach(n => {
      const x = n.position.x;
      const y = n.position.y;
      const parts = n.id.split(":");
      const featureId = parts[1];
      const stationIdClean = parts.slice(2).join(":");

      const stationInfo = subway?.stations.find((s: SubwayStation) => s.id === stationIdClean);
      const type = stationInfo?.type || "service";
      const feature = features.find(f => f.id === featureId);
      const color = feature ? feature.color : "#a1a1aa";

      let labelText = stationIdClean.split(/[\\/]/).pop() || "";
      if (type === "route") {
        const routeParts = stationIdClean.split(":");
        labelText = `${routeParts[1]} ${routeParts.slice(2).join(":")}`;
      } else if (type === "database") {
        labelText = stationIdClean.replace("db:", "");
      }

      svgContent += `
        <g>
          <rect x="${x}" y="${y}" width="175" height="60" rx="10" fill="#09090b" stroke="${color}" stroke-width="1.5" />
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
    link.download = `${result?.overview?.repoName || "repository"}-subway-map.svg`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (isFeaturesLoading || isSubwayLoading || !subway || !layout) {
    return (
      <div className="h-[480px] flex flex-col items-center justify-center text-zinc-550 gap-2 bg-zinc-950/40 border border-border/60 rounded-2xl">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <span className="text-xs font-semibold">Generating unified city-wide subway network layout...</span>
      </div>
    );
  }

  // Handle selected items for Details scope
  const activeDetailsScope = selectedStationId || selectedFeature;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 h-[600px] text-left">
      {/* Legend Column */}
      <div className="lg:col-span-1 h-full overflow-hidden">
        <SubwayLegend
          subway={subway}
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

          <span className="text-[9px] font-bold text-zinc-450 uppercase tracking-widest">Health Glow</span>
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

          <div className="w-[1px] h-3.5 bg-border/60" />

          <span className="text-[9px] font-bold text-zinc-450 uppercase tracking-widest">Health Overlay</span>
          <button
            onClick={() => {
              setHealthOverlayActive(!healthOverlayActive);
              if (!healthOverlayActive) setHealthGlowActive(false);
            }}
            className={`w-8 h-4.5 rounded-full transition-colors relative flex items-center ${
              healthOverlayActive ? "bg-emerald-500" : "bg-zinc-700"
            }`}
          >
            <div
              className={`w-3.5 h-3.5 rounded-full bg-zinc-950 transition-transform ${
                healthOverlayActive ? "translate-x-4" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>

        {/* Left Toolbar controls: Focus Search & Route Dropdown */}
        <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5">
          {/* Focus Mode Search Input & Depth Selector */}
          <div className="flex items-center gap-1 bg-zinc-900/90 border border-border/60 rounded-xl px-2.5 py-1.5 shadow-sm backdrop-blur-md">
            <div className="relative flex items-center">
              <Search className="w-3.5 h-3.5 text-zinc-500 mr-1.5 shrink-0" />
              <input
                type="text"
                placeholder="Focus (e.g. authService)..."
                value={focusQuery}
                onChange={(e) => setFocusQuery(e.target.value)}
                className="bg-transparent text-[10px] text-zinc-200 placeholder-zinc-500 focus:outline-none w-32 sm:w-44"
              />
              {focusQuery && (
                <button
                  onClick={() => setFocusQuery("")}
                  className="text-zinc-500 hover:text-white ml-1 shrink-0"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              )}
            </div>

            {focusQuery && (
              <>
                <div className="w-[1px] h-3 bg-border/60 mx-1.5" />
                <div className="flex items-center gap-1 text-[9px] font-bold text-zinc-450 uppercase tracking-wider">
                  <span>Depth</span>
                  <div className="flex items-center bg-zinc-950/80 rounded-lg p-0.5 border border-border/40">
                    {[1, 2, 3].map((d) => (
                      <button
                        key={d}
                        onClick={() => setFocusDepth(d)}
                        className={`px-1.5 py-0.5 rounded-md text-[8px] font-bold transition-all ${
                          focusDepth === d
                            ? "bg-primary text-black font-extrabold"
                            : "text-zinc-400 hover:text-white"
                        }`}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          {tourSteps.length > 0 && (
            <button
              onClick={startTour}
              className="flex items-center gap-1.5 bg-primary hover:bg-primary/95 text-background px-3 py-1.5 rounded-xl text-[10px] font-extrabold shadow-sm transition animate-bounce hover:animate-none"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Tour Architecture</span>
            </button>
          )}

          {/* Route Highlight Selector Dropdown */}
          <div className="relative group">
            <button className="flex items-center gap-1.5 bg-zinc-900/90 border border-border/60 hover:border-zinc-500 hover:text-white px-2.5 py-1.5 rounded-xl text-[10px] font-bold text-zinc-300 shadow-sm transition">
              <Network className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span className="max-w-[65px] sm:max-w-none truncate">Highlight Route</span>
              <ChevronDown className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
            </button>
            
            {/* Dropdown Menu */}
            <div className="absolute left-0 mt-1 hidden group-hover:block w-64 bg-zinc-950 border border-border/80 rounded-xl shadow-2xl p-2 max-h-60 overflow-y-auto z-50">
              <div className="text-[8px] font-bold text-zinc-550 uppercase tracking-widest px-2 py-1 border-b border-border/20 mb-1">
                Hover to Highlight Path
              </div>
              {result.routes && result.routes.length > 0 ? (
                result.routes.map((r: RouteNode, ri: number) => {
                  const isHovered = hoveredRoute?.path === r.path && hoveredRoute?.method === r.method;
                  return (
                    <div
                      key={ri}
                      onMouseEnter={() => setHoveredRoute(r)}
                      onMouseLeave={() => setHoveredRoute(null)}
                      className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[9.5px] font-mono cursor-pointer transition-colors ${
                        isHovered ? "bg-zinc-900 text-white" : "text-zinc-350 hover:bg-zinc-900/50 hover:text-white"
                      }`}
                    >
                      <span className={`px-1 py-0.5 rounded text-[8px] font-bold border shrink-0 ${
                        r.method.toUpperCase() === "GET" ? "bg-emerald-950/40 text-emerald-400 border-emerald-800/40" :
                        r.method.toUpperCase() === "POST" ? "bg-blue-950/40 text-blue-400 border-blue-800/40" :
                        "bg-zinc-900/40 text-zinc-400 border-zinc-800/40"
                      }`}>
                        {r.method}
                      </span>
                      <span className="truncate flex-1">{r.path}</span>
                    </div>
                  );
                })
              ) : (
                <div className="text-[10px] text-zinc-550 italic px-2 py-1.5">No routes found</div>
              )}
            </div>
          </div>
        </div>

        <ReactFlow
          nodes={nodes}
          edges={edges}
          onInit={(instance) => setReactFlowInstance(instance)}
          onNodeMouseEnter={(event, node) => {
            const parts = node.id.split(":");
            const stationIdClean = parts.slice(2).join(":");
            const station = subway.stations.find((s: SubwayStation) => s.id === stationIdClean);
            if (station?.type === "route") {
              const routeParts = stationIdClean.split(":");
              const method = routeParts[1];
              const path = routeParts.slice(2).join(":");
              const match = result.routes?.find((r: any) => r.method === method && r.path === path);
              if (match) {
                setHoveredRoute(match);
              }
            }
          }}
          onNodeMouseLeave={() => {
            setHoveredRoute(null);
          }}
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
          <MiniMap
            style={{
              backgroundColor: "rgba(9, 9, 11, 0.95)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              borderRadius: "0.75rem",
            }}
            nodeColor={(node) => {
              const parts = node.id.split(":");
              const nodeFeatureId = parts[1];
              const feat = features.find(f => f.id === nodeFeatureId);
              return feat ? feat.color : "#27272a";
            }}
            maskColor="rgba(0, 0, 0, 0.6)"
          />
        </ReactFlow>

        {tourActive && tourSteps.length > 0 && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 w-80 sm:w-96 bg-zinc-950/90 border border-primary/50 rounded-2xl p-4 shadow-2xl backdrop-blur-md text-left">
            <div className="flex items-center justify-between pb-2 border-b border-border/40">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-primary animate-ping" />
                <span className="text-[10px] font-black uppercase tracking-wider text-primary">Architecture Tour</span>
              </div>
              <button
                onClick={() => {
                  setTourActive(false);
                  handleCloseDetail();
                }}
                className="p-1 rounded-lg hover:bg-zinc-900 text-zinc-500 hover:text-white transition"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="mt-2.5 space-y-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[9px] font-extrabold text-zinc-500 shrink-0">
                  STEP {tourStepIndex + 1} OF {tourSteps.length}
                </span>
                <span className="text-[9px] font-mono text-zinc-400 truncate max-w-[200px]" title={tourSteps[tourStepIndex].file}>
                  {tourSteps[tourStepIndex].filename}
                </span>
              </div>

              <div className="text-xs font-bold text-zinc-150">
                {tourSteps[tourStepIndex].role}
              </div>

              <p className="text-[10px] text-zinc-400 leading-relaxed font-normal">
                {tourSteps[tourStepIndex].reason}
              </p>
            </div>

            <div className="mt-4 flex items-center justify-between">
              <button
                onClick={() => handleTourStepChange(tourStepIndex - 1)}
                disabled={tourStepIndex === 0}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-border/60 bg-zinc-900/50 hover:bg-zinc-800 text-[9.5px] font-bold text-zinc-350 disabled:opacity-30 disabled:pointer-events-none transition"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Prev</span>
              </button>

              <button
                onClick={() => handleTourStepChange(tourStepIndex + 1)}
                disabled={tourStepIndex === tourSteps.length - 1}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-border/60 bg-zinc-900/50 hover:bg-zinc-800 text-[9.5px] font-bold text-zinc-350 disabled:opacity-30 disabled:pointer-events-none transition"
              >
                <span>Next</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Details/Inspector Column */}
      <div className="lg:col-span-1 h-full overflow-hidden">
        {activeDetailsScope ? (
          <SubwayDetails
            stationId={selectedStationId}
            featureId={selectedFeature}
            result={result}
            subway={subway}
            features={features}
            onClose={handleCloseDetail}
            onSwitchTab={onSwitchTab}
            onSetImpactFile={onSetImpactFile}
            onSelectTraceRouteId={onSelectTraceRouteId}
            onStartJourney={startJourney}
            onStopJourney={stopJourney}
            journeyActive={journeyActive}
            journeyNodeId={journeyNodeId}
            impactHighlightActive={impactHighlightActive}
            setImpactHighlightActive={setImpactHighlightActive}
          />
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 border border-dashed border-border/80 rounded-2xl bg-zinc-950/20 text-zinc-550">
            <HelpCircle className="w-10 h-10 text-zinc-700 mb-2 animate-pulse" />
            <h4 className="text-xs font-bold text-zinc-300">Transit Inspector</h4>
            <p className="text-[10px] text-zinc-500 max-w-xs mt-1 leading-relaxed">
              Click on any station node or select a line on the legend to inspect cross-feature transfers, dependency hierarchies, or start a line journey.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
