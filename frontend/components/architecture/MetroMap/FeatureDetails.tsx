import React from "react";
import { Card } from "../../ui/card";
import { Badge } from "../../ui/badge";
import { Button } from "../../ui/button";
import { 
  X, FileText, ArrowRight, ArrowLeft, Zap, Info, Shield, 
  Database, Play, Code, AlertCircle, RefreshCw, Square, Network, Link
} from "lucide-react";
import { FeatureFlow, FileNode, RouteNode } from "@shared/types";

interface FeatureDetailsProps {
  stationId?: string | null;
  featureId?: string | null;
  result: any;
  features: FeatureFlow[];
  onClose: () => void;
  onSwitchTab?: (tab: any) => void;
  onSetImpactFile?: (file: string) => void;
  onSelectTraceRouteId?: (routeId: string) => void;
  onStartJourney?: (featureId: string) => void;
  onStopJourney?: () => void;
  journeyActive?: boolean;
  journeyNodeId?: string | null;
}

export default function FeatureDetails({
  stationId,
  featureId,
  result,
  features,
  onClose,
  onSwitchTab,
  onSetImpactFile,
  onSelectTraceRouteId,
  onStartJourney,
  onStopJourney,
  journeyActive = false,
  journeyNodeId = null,
}: FeatureDetailsProps) {
  
  // Format Size Helper
  const formatBytes = (bytes: number) => {
    if (!bytes) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  const featureNames: Record<string, string> = {
    auth: "Authentication",
    users: "User Management",
    billing: "Billing & Payments",
    admin: "Admin Control Panel",
    analytics: "Analytics & Logging",
    notifications: "Notifications",
    general: "Core System",
  };

  // ─── SCOPE 1: Feature Domain Selection ───
  const selectedFeature = featureId ? features.find(f => f.id === featureId) : null;
  
  // Calculate vertical dependents (Who depends on this feature)
  const dependents = selectedFeature 
    ? features.filter(f => f.id !== selectedFeature.id && f.dependencies.includes(selectedFeature.id))
    : [];

  if (selectedFeature && !stationId) {
    return (
      <Card className="p-5 flex flex-col h-full bg-zinc-950/95 border border-border/80 shadow-2xl overflow-y-auto text-left space-y-4 select-none">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-border/50">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-3 h-3 rounded-full animate-pulse" style={{ backgroundColor: selectedFeature.color }} />
            <h3 className="text-sm font-bold text-zinc-100 truncate" title={selectedFeature.name}>
              {selectedFeature.name}
            </h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Feature Journey Controller */}
        {onStartJourney && onStopJourney && (
          <Card className="p-3 bg-zinc-900/40 border border-border/60 space-y-2 shrink-0">
            <div className="text-[9px] font-bold text-zinc-450 uppercase tracking-widest text-center">
              Feature Journey Controller
            </div>
            {journeyActive ? (
              <Button
                onClick={onStopJourney}
                className="w-full text-[10px] font-bold py-2 h-auto bg-red-650 hover:bg-red-700 text-white flex items-center justify-center gap-1.5"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
                Stop Transit Journey
              </Button>
            ) : (
              <Button
                onClick={() => onStartJourney(selectedFeature.id)}
                className="w-full text-[10px] font-bold py-2 h-auto bg-primary text-background hover:bg-primary/90 flex items-center justify-center gap-1.5"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                Play Transit Journey
              </Button>
            )}
            {journeyActive && journeyNodeId && (
              <div className="text-[8.5px] text-zinc-400 text-center font-mono animate-pulse">
                Arriving at: <span className="text-primary font-bold">{journeyNodeId.split(":").pop()?.split(/[\\/]/).pop()}</span>
              </div>
            )}
          </Card>
        )}

        {/* Metrics Grid */}
        <div className="space-y-1">
          <span className="text-[8px] font-bold text-zinc-550 uppercase tracking-widest block">Feature Metrics</span>
          <div className="grid grid-cols-2 gap-2">
            <div className="p-2.5 rounded-lg bg-zinc-900/50 border border-border/40 text-center sm:text-left">
              <span className="text-[8px] text-zinc-500 uppercase font-semibold">Routes</span>
              <div className="text-sm font-extrabold text-white mt-0.5">{selectedFeature.metrics.routes}</div>
            </div>
            <div className="p-2.5 rounded-lg bg-zinc-900/50 border border-border/40 text-center sm:text-left">
              <span className="text-[8px] text-zinc-550 uppercase font-semibold">Services</span>
              <div className="text-sm font-extrabold text-white mt-0.5">{selectedFeature.metrics.services}</div>
            </div>
            <div className="p-2.5 rounded-lg bg-zinc-900/50 border border-border/40 text-center sm:text-left">
              <span className="text-[8px] text-zinc-505 uppercase font-semibold">Repositories</span>
              <div className="text-sm font-extrabold text-white mt-0.5">{selectedFeature.metrics.repositories}</div>
            </div>
            <div className="p-2.5 rounded-lg bg-zinc-900/50 border border-border/40 text-center sm:text-left">
              <span className="text-[8px] text-zinc-550 uppercase font-semibold">DB Tables</span>
              <div className="text-sm font-extrabold text-white mt-0.5">{selectedFeature.metrics.tables}</div>
            </div>
          </div>
        </div>

        {/* Domain Health & Confidence */}
        <div className="grid grid-cols-2 gap-2">
          <div className="p-2.5 rounded-lg bg-zinc-900/50 border border-border/40">
            <span className="text-[8px] text-zinc-550 uppercase font-semibold block mb-0.5">Feature Health</span>
            <Badge variant={selectedFeature.health >= 90 ? "success" : selectedFeature.health >= 70 ? "warning" : "error"} className="text-[9px] font-bold">
              {selectedFeature.health}/100
            </Badge>
          </div>
          <div className="p-2.5 rounded-lg bg-zinc-900/50 border border-border/40">
            <span className="text-[8px] text-zinc-550 uppercase font-semibold block mb-0.5">Confidence</span>
            <div className="text-xs font-bold text-zinc-350">{selectedFeature.confidence}% Conf</div>
          </div>
        </div>

        {/* Complexity Sum */}
        <div className="p-3 rounded-xl bg-zinc-900/50 border border-border/40 flex items-center justify-between">
          <div className="flex items-center gap-1">
            <Zap className="w-3.5 h-3.5 text-rose-400" />
            <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider">Complexity Index Sum</span>
          </div>
          <span className="text-xs font-mono font-extrabold text-rose-400">
            Σ {selectedFeature.metrics.complexity}
          </span>
        </div>

        {/* Cross Feature Dependencies ("Depends On") */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-1">
            <ArrowRight className="w-3.5 h-3.5 text-blue-400 shrink-0" />
            <span className="text-[8.5px] font-bold text-zinc-400 uppercase tracking-widest">Depends On Features ({selectedFeature.dependencies.length})</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {selectedFeature.dependencies.length > 0 ? (
              selectedFeature.dependencies.map(depId => (
                <Badge key={depId} variant="secondary" className="text-[9px] bg-zinc-900 border border-border/60 text-zinc-300 font-medium">
                  {featureNames[depId] || depId}
                </Badge>
              ))
            ) : (
              <span className="text-[9.5px] text-zinc-650 italic pl-1">No feature dependencies</span>
            )}
          </div>
        </div>

        {/* Vertical Dependents ("Used By") */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-1">
            <ArrowLeft className="w-3.5 h-3.5 text-purple-400 shrink-0" />
            <span className="text-[8.5px] font-bold text-zinc-400 uppercase tracking-widest">Used By Features ({dependents.length})</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {dependents.length > 0 ? (
              dependents.map(dep => (
                <Badge key={dep.id} variant="secondary" className="text-[9px] bg-zinc-900 border border-border/60 text-zinc-300 font-medium">
                  {dep.name}
                </Badge>
              ))
            ) : (
              <span className="text-[9.5px] text-zinc-650 italic pl-1">Not used by other domains</span>
            )}
          </div>
        </div>

      </Card>
    );
  }

  // ─── SCOPE 2: Station Node Selection (Original Node scope) ───
  if (!stationId) return null;

  const parts = stationId.split(":");
  const featureIdOfNode = parts[1] || "";
  const type = parts[2] || "";
  
  let labelName = "";
  let filePath = "";
  let entityName = "";
  let routeMethod = "";
  let routePath = "";

  if (type === "route") {
    routeMethod = parts[3] || "";
    routePath = parts.slice(4).join(":") || "";
    labelName = `${routeMethod} ${routePath}`;
  } else if (type === "file") {
    filePath = parts.slice(3).join(":") || "";
    labelName = filePath.split(/[\\/]/).pop() || filePath;
  } else if (type === "db") {
    entityName = parts.slice(3).join(":") || "";
    labelName = entityName;
  }

  // 1. Fetch FileNode info if file path is available
  const files: FileNode[] = result?.files || [];
  const fileNode = filePath ? files.find((f) => f.path === filePath) : null;

  // 2. Fetch RouteNode info if route is selected
  const routes: RouteNode[] = result?.routes || [];
  
  // 3. Find Complexity from Static Analysis
  const complexityInfo = filePath
    ? result?.staticAnalysis?.complexity?.find((c: any) => c.file === filePath)
    : null;
  const godInfo = filePath
    ? result?.staticAnalysis?.godServices?.find((g: any) => g.file === filePath)
    : null;

  // 4. Find Routes utilizing this file in their execution chain
  const routesUsingIt = filePath
    ? routes.filter((r) => r.file === filePath || r.chain?.some((c) => c.toLowerCase().includes(labelName.toLowerCase())))
    : [];

  // 5. Find Database Entity Operations
  const dbInfo = result?.metadata?.databaseInfo;
  const dbFlows = dbInfo?.flows || [];
  
  // Find DB entities accessed by this file or route
  let dbEntitiesAccessed: string[] = [];
  if (type === "route") {
    const matchedFlow = dbFlows.find(
      (f: any) => f.route === routePath && f.method.toUpperCase() === routeMethod.toUpperCase()
    );
    if (matchedFlow?.entities) {
      dbEntitiesAccessed = matchedFlow.entities;
    }
  } else if (type === "file" && dbInfo?.entities) {
    const fileBase = labelName.replace(/\.[^.]+$/, "").toLowerCase();
    const matchedEntity = dbInfo.entities.find((e: any) => 
      e.entity.toLowerCase().includes(fileBase) || 
      fileBase.includes(e.entity.toLowerCase())
    );
    if (matchedEntity) {
      dbEntitiesAccessed = [matchedEntity.entity];
    }
  } else if (type === "db") {
    dbEntitiesAccessed = [entityName];
  }

  return (
    <Card className="p-5 flex flex-col h-full bg-zinc-950/95 border border-border/80 shadow-2xl overflow-y-auto text-left space-y-4 select-none">
      
      {/* Title Header */}
      <div className="flex items-center justify-between pb-3 border-b border-border/50">
        <div className="flex items-center gap-2 min-w-0">
          {type === "route" && <Globe className="w-4 h-4 text-emerald-400 shrink-0" />}
          {type === "file" && <FileText className="w-4 h-4 text-blue-400 shrink-0" />}
          {type === "db" && <Database className="w-4 h-4 text-rose-400 shrink-0" />}
          <h3 className="text-sm font-bold text-zinc-100 truncate" title={labelName}>
            {labelName}
          </h3>
        </div>
        <button onClick={onClose} className="p-1 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Feature & Station Type badges */}
      <div className="flex gap-2">
        <div className="space-y-1 flex-1">
          <span className="text-[8px] font-bold text-zinc-550 uppercase tracking-widest block">Feature</span>
          <Badge variant="primary" className="text-[9px] uppercase font-bold tracking-wider">
            {featureNames[featureIdOfNode] || "Core Module"}
          </Badge>
        </div>
        <div className="space-y-1 flex-1">
          <span className="text-[8px] font-bold text-zinc-550 uppercase tracking-widest block">Station Type</span>
          <Badge variant="secondary" className="text-[9px] uppercase font-bold tracking-wider">
            {type === "route" ? "API Route" : type === "db" ? "DB Table" : "Code Module"}
          </Badge>
        </div>
      </div>

      {/* Action panel for Route Station */}
      {type === "route" && (
        <Card className="p-3 bg-zinc-900/40 border border-border/60 space-y-2 shrink-0">
          <div className="text-[9px] font-bold text-zinc-450 uppercase tracking-widest text-center mb-1">
            Station Action
          </div>
          <Button
            onClick={() => {
              if (onSelectTraceRouteId && onSwitchTab) {
                onSelectTraceRouteId(`${routeMethod.toUpperCase()}:${routePath}`);
                onSwitchTab("arch");
              }
            }}
            className="w-full text-[10px] font-bold py-2 h-auto bg-primary text-background hover:bg-primary/90 flex items-center justify-center gap-1.5"
          >
            <Zap className="w-3.5 h-3.5 fill-background stroke-background animate-pulse" />
            View Execution Trace
          </Button>
        </Card>
      )}

      {/* Action panel for File Station */}
      {type === "file" && onSwitchTab && onSetImpactFile && (
        <Card className="p-3 bg-zinc-900/40 border border-border/60 space-y-2 shrink-0">
          <div className="text-[9px] font-bold text-zinc-450 uppercase tracking-widest text-center mb-1">
            Station Actions
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => {
                if (onSetImpactFile && onSwitchTab) {
                  onSetImpactFile(filePath);
                  onSwitchTab("impact");
                }
              }}
              className="flex-1 text-[9.5px] font-bold py-1.5 h-auto bg-primary text-background hover:bg-primary/90"
            >
              Change Impact
            </Button>
          </div>
        </Card>
      )}

      {/* Details for file/node */}
      {fileNode && (
        <>
          {/* Stats Grid */}
          <div className="grid grid-cols-2 gap-2">
            <div className="p-2.5 rounded-xl bg-zinc-900/60 border border-border/50 text-center sm:text-left">
              <span className="text-[8px] text-muted-foreground uppercase font-semibold">Size</span>
              <div className="text-xs font-extrabold text-white mt-0.5">{formatBytes(fileNode.size)}</div>
            </div>
            <div className="p-2.5 rounded-xl bg-zinc-900/60 border border-border/50 text-center sm:text-left">
              <span className="text-[8px] text-muted-foreground uppercase font-semibold">Lines</span>
              <div className="text-xs font-extrabold text-white mt-0.5">{fileNode.lineCount}</div>
            </div>
          </div>

          {/* Complexity Indicator */}
          {(complexityInfo || godInfo) && (
            <div className="p-3 rounded-xl bg-rose-950/10 border border-rose-900/30 space-y-1.5">
              <div className="flex items-center gap-1.5 text-rose-400">
                <Zap className="w-3.5 h-3.5 animate-pulse" />
                <span className="text-[9px] font-bold uppercase tracking-wider">Complexity Status</span>
              </div>
              <div className="space-y-1 text-xs">
                {complexityInfo && (
                  <div className="flex justify-between items-center text-[10.5px]">
                    <span className="text-zinc-400">Complexity Index:</span>
                    <Badge variant={complexityInfo.rating === "risky" ? "error" : "warning"} className="text-[8.5px] font-bold">
                      {complexityInfo.score} ({complexityInfo.rating.toUpperCase()})
                    </Badge>
                  </div>
                )}
                {godInfo && (
                  <div className="flex justify-between items-center text-[10.5px] text-purple-400 font-bold mt-1">
                    <span>Code Design Risk:</span>
                    <span>GOD SERVICE DETECTED</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Routes Using It */}
          {routesUsingIt.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-[8px] font-bold text-zinc-550 uppercase tracking-widest block">Routes Using This File ({routesUsingIt.length})</span>
              <div className="space-y-1 max-h-[100px] overflow-y-auto pr-1">
                {routesUsingIt.map((r, ri) => (
                  <div key={ri} className="flex items-center gap-1.5 p-1.5 rounded bg-zinc-900/60 border border-border/40 text-[9.5px] font-mono text-zinc-300">
                    <span className="text-[8.5px] font-bold text-primary shrink-0">{r.method}</span>
                    <span className="truncate">{r.path}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Imports */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-1">
              <ArrowRight className="w-3.5 h-3.5 text-blue-400 shrink-0" />
              <span className="text-[8px] font-bold text-zinc-450 uppercase tracking-widest">Imports ({fileNode.internalImports?.length ?? 0})</span>
            </div>
            <div className="space-y-1 max-h-[100px] overflow-y-auto pr-1">
              {fileNode.internalImports && fileNode.internalImports.length > 0 ? (
                fileNode.internalImports.map((imp) => (
                  <div key={imp} className="p-1.5 rounded bg-zinc-900/60 border border-border/40 text-[9.5px] font-mono text-zinc-300 truncate" title={imp}>
                    {imp.split(/[\\/]/).pop()}
                  </div>
                ))
              ) : (
                <span className="text-[9.5px] text-zinc-650 italic block pl-1">No local imports</span>
              )}
            </div>
          </div>

          {/* Referenced By */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-1">
              <ArrowLeft className="w-3.5 h-3.5 text-purple-400 shrink-0" />
              <span className="text-[8px] font-bold text-zinc-450 uppercase tracking-widest">Referenced By ({fileNode.referencedBy?.length ?? 0})</span>
            </div>
            <div className="space-y-1 max-h-[100px] overflow-y-auto pr-1">
              {fileNode.referencedBy && fileNode.referencedBy.length > 0 ? (
                fileNode.referencedBy.map((ref) => (
                  <div key={ref} className="p-1.5 rounded bg-zinc-900/60 border border-border/40 text-[9.5px] font-mono text-zinc-300 truncate" title={ref}>
                    {ref.split(/[\\/]/).pop()}
                  </div>
                ))
              ) : (
                <span className="text-[9.5px] text-zinc-650 italic block pl-1">No incoming references</span>
              )}
            </div>
          </div>
        </>
      )}

      {/* Database entities accessed */}
      {dbEntitiesAccessed.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1">
            <Database className="w-3.5 h-3.5 text-rose-400 shrink-0" />
            <span className="text-[8px] font-bold text-zinc-450 uppercase tracking-widest">Database Tables Accessed</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {dbEntitiesAccessed.map((ent) => (
              <Badge key={ent} variant="secondary" className="text-[9px] font-mono px-2 py-0.5 bg-rose-950/20 text-rose-450 border border-rose-900/30">
                {ent}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Path Info */}
      {filePath && (
        <div className="p-3 rounded-xl bg-zinc-900/40 border border-border/40 space-y-1">
          <div className="flex items-center gap-1.5 text-zinc-450">
            <Info className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-[8px] font-bold uppercase tracking-wider">File Path</span>
          </div>
          <code className="block text-[9.5px] font-mono text-zinc-450 break-all leading-normal">
            {filePath}
          </code>
        </div>
      )}
    </Card>
  );
}

// Simple fallback component for Lucide references
function Globe(props: any) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
      <path d="M2 12h20" />
    </svg>
  );
}
