import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { getExecutionTraces, getFileContent } from "../../lib/api/client";
import { useAnalysisStore } from "../../store/analysis.store";
import LayerDetails from "./LayerDetails";
import { ReactFlow, Background, Controls } from "@xyflow/react";
import { 
  Loader2, Search, X, Zap, Network, ArrowDown, Shield, 
  Database, Settings, Code, AlertCircle, Sparkles, Key, Eye, HelpCircle
} from "lucide-react";
import { Badge } from "../ui/badge";
import { Card } from "../ui/card";
import { Button } from "../ui/button";

// Colors and categories mapping
const CATEGORY_STYLES: Record<string, { label: string; border: string; bg: string; text: string; icon: any }> = {
  controller: { label: "Controller", border: "border-purple-500/70", bg: "bg-purple-950/20", text: "text-purple-300", icon: Settings },
  service:    { label: "Service",    border: "border-amber-500/70",  bg: "bg-amber-950/20",  text: "text-amber-300",  icon: Zap },
  helper:     { label: "Helper",     border: "border-blue-500/70",   bg: "bg-blue-950/20",   text: "text-blue-300",   icon: Shield },
  repository: { label: "Repository", border: "border-emerald-500/70",bg: "bg-emerald-950/20",text: "text-emerald-300",icon: Network },
  database:   { label: "Database",   border: "border-rose-500/70",   bg: "bg-rose-950/20",   text: "text-rose-300",   icon: Database },
  middleware: { label: "Middleware", border: "border-orange-500/70", bg: "bg-orange-950/20", text: "text-orange-305", icon: Shield },
};

interface ExecutionTraceProps {
  result: any;
  onSwitchTab?: (tab: any) => void;
  onSetImpactFile?: (file: string) => void;
  initialRouteId?: string;
}

export default function ExecutionTrace({ result, onSwitchTab, onSetImpactFile, initialRouteId }: ExecutionTraceProps) {
  const { currentJobId } = useAnalysisStore();
  const [selectedRouteId, setSelectedRouteId] = useState<string>(initialRouteId || "");
  const [routeSearch, setRouteSearch] = useState<string>("");

  React.useEffect(() => {
    if (initialRouteId) {
      setSelectedRouteId(initialRouteId);
    }
  }, [initialRouteId]);
  
  // View mode toggle: timeline vs node-link graph
  const [viewMode, setViewMode] = useState<"timeline" | "graph">("timeline");
  
  // File Inspector & Preview States
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [selectedFileLayer, setSelectedFileLayer] = useState<string>("");
  const [previewFile, setPreviewFile] = useState<string | null>(null);

  // Fetch execution traces from API
  const { data, isLoading } = useQuery({
    queryKey: ["executionTraces", currentJobId],
    queryFn: () => getExecutionTraces(currentJobId!),
    enabled: !!currentJobId,
  });

  // Fetch code preview contents
  const { data: fileCodeData, isLoading: isCodeLoading } = useQuery({
    queryKey: ["fileCode", currentJobId, previewFile],
    queryFn: () => getFileContent(currentJobId!, previewFile!),
    enabled: !!currentJobId && !!previewFile,
  });

  const traces = useMemo(() => data?.traces || [], [data]);

  // Find currently selected trace
  const activeTrace = useMemo(() => {
    if (!selectedRouteId) return null;
    return traces.find(t => `${t.method}:${t.route}` === selectedRouteId);
  }, [selectedRouteId, traces]);

  // Filter routes based on search
  const filteredTraces = useMemo(() => {
    return traces.filter(t => 
      t.route.toLowerCase().includes(routeSearch.toLowerCase()) ||
      t.method.toLowerCase().includes(routeSearch.toLowerCase())
    );
  }, [traces, routeSearch]);

  // Helper to map name back to workspace file
  const getFileNodeForName = (nodeName: string) => {
    if (!result?.files) return null;
    return result.files.find((f: any) => {
      const base = f.path.split(/[\\/]/).pop() || "";
      const nameWithoutExt = base.replace(/\.[^.]+$/, "");
      return nameWithoutExt.toLowerCase() === nodeName.toLowerCase();
    });
  };

  const handleNodeClick = (nodeName: string) => {
    const fileNode = getFileNodeForName(nodeName);
    if (fileNode) {
      setSelectedFile(fileNode.path);
      const cat = activeTrace?.steps.find(s => s.name === nodeName)?.type || "service";
      setSelectedFileLayer(CATEGORY_STYLES[cat]?.label || "Services");
    } else {
      setSelectedFile(null);
    }
  };

  const handleRouteSelect = (routeId: string) => {
    setSelectedRouteId(routeId);
    setSelectedFile(null); // Clear inspector
  };

  // Convert execution trace steps to ReactFlow graph representation
  const { rfNodes, rfEdges } = useMemo(() => {
    if (!activeTrace) return { rfNodes: [], rfEdges: [] };

    const flowNodes = activeTrace.steps.map((step, idx) => {
      const cat = step.type;
      const style = CATEGORY_STYLES[cat] || CATEGORY_STYLES.helper;
      const Icon = style.icon;
      const hasFile = !!getFileNodeForName(step.name);

      return {
        id: `step-${idx}`,
        type: "default",
        data: {
          label: (
            <div
              onClick={() => hasFile && handleNodeClick(step.name)}
              className={`p-3.5 rounded-xl border text-center min-w-[170px] bg-zinc-900/90 backdrop-blur-md transition-all duration-300 ${style.border} ${style.bg} ${style.text} ${hasFile ? "cursor-pointer hover:scale-105" : ""}`}
            >
              <div className="flex items-center gap-2 justify-center mb-1.5">
                <Icon className="w-3.5 h-3.5 animate-pulse" />
                <span className="text-[8px] font-bold uppercase tracking-widest opacity-60">{style.label}</span>
              </div>
              <div className="text-[11px] font-mono font-bold truncate" title={step.name}>{step.name}</div>
            </div>
          )
        },
        position: { x: 180, y: idx * 115 + 30 },
        style: { background: "transparent", border: "none", padding: 0 }
      };
    });

    const flowEdges = activeTrace.steps.slice(0, -1).map((_, idx) => ({
      id: `edge-${idx}`,
      source: `step-${idx}`,
      target: `step-${idx + 1}`,
      animated: true,
      style: { stroke: "hsl(var(--primary, 60 100% 50%))", strokeWidth: 2 }
    }));

    return { rfNodes: flowNodes, rfEdges: flowEdges };
  }, [activeTrace]);

  const selectedFileNode = useMemo(() => {
    if (!selectedFile || !result?.files) return null;
    return result.files.find((f: any) => f.path === selectedFile);
  }, [selectedFile, result]);

  if (isLoading) {
    return (
      <div className="h-[480px] flex flex-col items-center justify-center text-zinc-500 gap-2 bg-zinc-950/40 border border-border/60 rounded-2xl">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <span className="text-xs">Generating execution traces from API mappings...</span>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 h-[600px] text-left">
      {/* 1. Routes List Pane */}
      <div className="lg:col-span-1 flex flex-col bg-zinc-950/40 border border-border/60 rounded-2xl p-4 space-y-3 overflow-hidden">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            className="w-full pl-8 pr-8 py-1.5 text-xs bg-zinc-900/80 border border-border/60 rounded-lg text-zinc-300 focus:outline-none focus:border-primary/40"
            placeholder="Search API endpoints..."
            value={routeSearch}
            onChange={e => setRouteSearch(e.target.value)}
          />
          {routeSearch && (
            <button onClick={() => setRouteSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-white">
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
          {filteredTraces.length > 0 ? (
            filteredTraces.map((t, idx) => {
              const routeId = `${t.method}:${t.route}`;
              const active = routeId === selectedRouteId;
              
              const methodColors: Record<string, string> = {
                GET: "bg-emerald-950/40 text-emerald-400 border-emerald-800/60",
                POST: "bg-blue-950/40 text-blue-400 border-blue-800/60",
                PUT: "bg-amber-950/40 text-amber-400 border-amber-800/60",
                PATCH: "bg-orange-950/40 text-orange-400 border-orange-800/60",
                DELETE: "bg-red-950/40 text-red-400 border-red-800/60",
              };
              const mc = methodColors[t.method.toUpperCase()] ?? "bg-zinc-800/40 text-zinc-400 border-zinc-700/60";

              return (
                <div
                  key={idx}
                  onClick={() => handleRouteSelect(routeId)}
                  className={`p-2.5 rounded-xl border cursor-pointer transition-all duration-200 ${
                    active 
                      ? "bg-primary/10 border-primary/40" 
                      : "bg-zinc-900/40 border-border/40 hover:border-border/80"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`px-1.5 py-0.5 rounded text-[8.5px] font-bold font-mono border shrink-0 ${mc}`}>
                        {t.method.toUpperCase()}
                      </span>
                      <code className="text-[10px] font-mono text-zinc-300 truncate" title={t.route}>
                        {t.route}
                      </code>
                    </div>
                    {t.reachability && (
                      <Badge variant="success" className="text-[7px] py-0 px-1 border-emerald-500/30 scale-90 shrink-0">
                        DB
                      </Badge>
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="text-center py-8 text-zinc-650 text-[10px] italic">No matching routes found</div>
          )}
        </div>
      </div>

      {/* 2. Middle Execution Trace Pane */}
      <div className="lg:col-span-2 flex flex-col bg-zinc-950/60 border border-border/60 rounded-2xl p-4 overflow-hidden relative">
        {activeTrace ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Trace Title & Controls */}
            <div className="flex items-center justify-between pb-3 border-b border-border/50 mb-3">
              <div className="flex items-center gap-2 min-w-0">
                <Zap className="w-4 h-4 text-primary shrink-0 animate-pulse" />
                <h4 className="text-xs font-bold text-zinc-200 uppercase tracking-widest truncate">
                  {activeTrace.method} {activeTrace.route}
                </h4>
              </div>
              
              {/* Toggle view mode */}
              <div className="flex bg-zinc-900/80 p-0.5 rounded-lg border border-border/50 gap-0.5 shrink-0 scale-90">
                {(["timeline", "graph"] as const).map(mode => (
                  <button
                    key={mode}
                    onClick={() => setViewMode(mode)}
                    className={`px-2 py-1 rounded text-[8.5px] font-bold uppercase tracking-wider transition-all duration-200 ${
                      viewMode === mode ? "bg-primary text-background" : "text-muted-foreground hover:text-white"
                    }`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>

            {/* Recruiter-Grade Diagnostics Header Panel */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-2 mb-3 bg-zinc-900/40 p-3 rounded-xl border border-border/40">
              {/* Confidence Meter */}
              <div className="flex flex-col justify-center items-center md:border-r border-border/30 pr-1 text-center">
                <span className="text-[8px] font-bold text-zinc-550 uppercase tracking-widest">Confidence</span>
                <div className="flex items-center gap-1 mt-0.5">
                  <Sparkles className="w-3.5 h-3.5 text-primary shrink-0" />
                  <span className="text-sm font-extrabold text-white">{activeTrace.confidence}%</span>
                </div>
              </div>

              {/* Reachability Badge */}
              <div className="flex flex-col justify-center items-center md:border-r border-border/30 px-1 text-center">
                <span className="text-[8px] font-bold text-zinc-550 uppercase tracking-widest">DB Reachable</span>
                {activeTrace.reachability ? (
                  <Badge variant="success" className="text-[8px] mt-1 font-bold">REACHABLE</Badge>
                ) : (
                  <Badge variant="secondary" className="text-[8px] mt-1 font-semibold opacity-60">NO DB ACTIVITY</Badge>
                )}
              </div>

              {/* Authentication Flow Info */}
              <div className="flex flex-col justify-center items-center md:border-r border-border/30 px-1 text-center">
                <span className="text-[8px] font-bold text-zinc-550 uppercase tracking-widest">Auth Flow</span>
                {activeTrace.authType ? (
                  <Badge variant="primary" className="text-[8.5px] mt-1 font-bold bg-emerald-950/40 text-emerald-400 border-emerald-800/60 uppercase">
                    {activeTrace.authType}
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="text-[8px] mt-1 font-semibold opacity-60 uppercase">PUBLIC</Badge>
                )}
              </div>

              {/* Quick Metrics Bar */}
              <div className="flex flex-col justify-center items-center text-center">
                <span className="text-[8px] font-bold text-zinc-550 uppercase tracking-widest">Complexity</span>
                <div className="text-xs font-mono font-bold text-primary mt-1">
                  Σ {activeTrace.metrics.complexity}
                </div>
              </div>
            </div>

            {/* Interactive Timeline vs ReactFlow Canvas */}
            <div className="flex-1 min-h-0 overflow-y-auto mb-3">
              {viewMode === "timeline" ? (
                <div className="space-y-0.5 flex flex-col items-center py-2">
                  {activeTrace.steps.map((step, index) => {
                    const style = CATEGORY_STYLES[step.type] || CATEGORY_STYLES.helper;
                    const Icon = style.icon;
                    const hasFile = !!getFileNodeForName(step.name);

                    return (
                      <React.Fragment key={index}>
                        <motion.div
                          initial={{ opacity: 0, y: 15 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: index * 0.12, duration: 0.25 }}
                          className="w-full max-w-sm"
                        >
                          <div
                            onClick={() => hasFile && handleNodeClick(step.name)}
                            className={`p-2.5 rounded-xl border flex items-center justify-between transition-all duration-200 ${
                              hasFile 
                                ? "cursor-pointer hover:scale-[1.02] bg-zinc-900/40 hover:bg-zinc-900/60 border-border/60 hover:border-primary/40 shadow-sm" 
                                : "cursor-default bg-zinc-950/30 border-border/30 opacity-70"
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className={`w-6 h-6 rounded-lg border flex items-center justify-center shrink-0 ${style.text} ${style.bg} ${style.border}`}>
                                <Icon className="w-3 h-3" />
                              </div>
                              <div className="min-w-0 text-left">
                                <span className={`text-[7.5px] font-bold uppercase tracking-wider block opacity-70 ${style.text}`}>
                                  {style.label}
                                </span>
                                <span className="text-[11px] font-mono font-bold text-zinc-200 truncate block">
                                  {step.name}
                                </span>
                              </div>
                            </div>
                            {hasFile && (
                              <Badge variant="secondary" className="text-[8px] tracking-wide shrink-0 font-bold">
                                INSPECT
                              </Badge>
                            )}
                          </div>
                        </motion.div>
                        
                        {index < activeTrace.steps.length - 1 && (
                          <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: index * 0.12 + 0.06 }}
                            className="py-1 shrink-0"
                          >
                            <ArrowDown className="w-3.5 h-3.5 text-zinc-700" />
                          </motion.div>
                        )}
                      </React.Fragment>
                    );
                  })}
                </div>
              ) : (
                <div className="w-full h-full rounded-xl border border-border/40 bg-zinc-950/60 overflow-hidden relative">
                  <ReactFlow
                    nodes={rfNodes}
                    edges={rfEdges}
                    fitView
                    panOnDrag
                    zoomOnScroll
                    nodesDraggable={false}
                    nodesConnectable={false}
                    elementsSelectable={false}
                    proOptions={{ hideAttribution: true }}
                  >
                    <Background color="#222" gap={15} />
                    <Controls />
                  </ReactFlow>
                </div>
              )}
            </div>

            {/* Trace Meta Info (Env variables list) */}
            {activeTrace.envVars.length > 0 && (
              <div className="mt-auto border-t border-border/40 pt-2.5 bg-zinc-900/10 shrink-0">
                <div className="flex items-center gap-1.5 text-zinc-450 text-[9px] font-bold uppercase tracking-wider mb-1.5">
                  <Key className="w-3 h-3 text-primary shrink-0" />
                  <span>Mapped Environment Configs ({activeTrace.envVars.length})</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {activeTrace.envVars.map(env => (
                    <code key={env} className="text-[9px] font-mono bg-zinc-900/60 border border-border/60 px-1.5 py-0.5 rounded text-primary">
                      {env}
                    </code>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-zinc-550">
            <Zap className="w-12 h-12 text-zinc-700 mb-2 animate-pulse" />
            <h4 className="text-xs font-bold text-zinc-300">Execution Trace Explorer</h4>
            <p className="text-[10px] text-zinc-500 max-w-xs mt-1 leading-relaxed">
              Select an API route from the endpoints menu on the left to analyze its controller, service layers, helpers, and database connections.
            </p>
          </div>
        )}
      </div>

      {/* 3. Right details panel / Inspector */}
      <div className="lg:col-span-1">
        {selectedFile ? (
          <div className="h-full flex flex-col space-y-3">
            <LayerDetails
              filePath={selectedFile}
              layerName={selectedFileLayer}
              result={result}
              onClose={() => setSelectedFile(null)}
            />
            
            {/* View Source & View Impact Buttons */}
            {selectedFileNode && (
              <Card className="p-3 bg-zinc-900/40 border border-border/60 space-y-2 shrink-0">
                <div className="text-[9.5px] font-bold text-zinc-400 uppercase tracking-widest block text-center mb-1">
                  Inspector Actions
                </div>
                <div className="flex gap-2">
                  <Button 
                    onClick={() => setPreviewFile(selectedFile)}
                    className="flex-1 text-[9px] font-bold py-1.5 h-auto bg-zinc-900 border border-border/60 hover:bg-zinc-800"
                  >
                    <Code className="w-3 h-3 mr-1 text-primary" />
                    View Source
                  </Button>

                  {onSwitchTab && onSetImpactFile && (
                    <Button 
                      onClick={() => {
                        onSetImpactFile(selectedFile);
                        onSwitchTab("impact");
                      }}
                      className="flex-1 text-[9px] font-bold py-1.5 h-auto bg-primary text-background hover:bg-primary/90"
                    >
                      <Eye className="w-3 h-3 mr-1 text-background" />
                      View Impact
                    </Button>
                  )}
                </div>
                <div className="text-[8px] text-zinc-550 text-center mt-1 leading-tight">
                  Affected Modules: <span className="text-primary font-bold">{selectedFileNode.referencedBy?.length || 0} direct</span>, {(selectedFileNode.referencedBy?.length || 0) * 2} estimated total.
                </div>
              </Card>
            )}
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 border border-dashed border-border/80 rounded-2xl bg-zinc-950/20 text-zinc-550">
            <Network className="w-10 h-10 text-zinc-700 mb-2" />
            <h4 className="text-xs font-bold text-zinc-300">Module Inspector</h4>
            <p className="text-[10px] text-zinc-500 max-w-xs mt-1 leading-relaxed">
              Click on any trace node marked with the "INSPECT" badge to audit imports, dependents, complexity, and file specs.
            </p>
          </div>
        )}
      </div>

      {/* 4. Code Preview Drawer Overlay */}
      {previewFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <Card className="w-full max-w-3xl h-[85vh] bg-zinc-950 border border-border/80 shadow-2xl flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border/50 bg-zinc-900/40">
              <div className="flex items-center gap-2 min-w-0">
                <Code className="w-4 h-4 text-primary shrink-0" />
                <span className="text-xs font-bold text-zinc-200 font-mono truncate">{previewFile.split(/[\\/]/).pop() || previewFile}</span>
                <span className="text-[9px] text-muted-foreground opacity-60 ml-2 font-mono truncate">{previewFile}</span>
              </div>
              <button 
                onClick={() => setPreviewFile(null)} 
                className="p-1 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition"
              >
                <X className="w-4.5 h-4.5" />
              </button>
            </div>

            {/* Code Content */}
            <div className="flex-1 overflow-auto p-4 bg-zinc-950">
              {isCodeLoading ? (
                <div className="h-full flex flex-col items-center justify-center text-zinc-500 gap-2">
                  <Loader2 className="w-7 h-7 animate-spin text-primary" />
                  <span className="text-xs">Loading file source code...</span>
                </div>
              ) : fileCodeData?.content ? (
                <pre className="text-left font-mono text-[10.5px] leading-relaxed text-zinc-350 select-text">
                  <code>{fileCodeData.content}</code>
                </pre>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-zinc-500 gap-2 text-center p-6">
                  <AlertCircle className="w-8 h-8 text-rose-500/80 mb-2" />
                  <span className="text-xs font-bold text-zinc-300">Failed to Retrieve Content</span>
                  <span className="text-[10px] text-zinc-550 max-w-xs mt-0.5">The file could not be read. Verify that the file exists in the repository workspace.</span>
                </div>
              )}
            </div>
            
            {/* Footer */}
            <div className="px-5 py-3.5 border-t border-border/50 bg-zinc-900/20 text-right">
              <Button 
                onClick={() => setPreviewFile(null)} 
                className="text-[10px] py-1.5 h-auto bg-zinc-900 border border-border/60 hover:bg-zinc-800"
              >
                Close Preview
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
