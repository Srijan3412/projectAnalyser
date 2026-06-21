import React from "react";
import { Card } from "../../ui/card";
import { Badge } from "../../ui/badge";
import { Button } from "../../ui/button";
import { 
  X, FileText, ArrowRight, ArrowLeft, Zap, Info, Shield, 
  Database, Play, Code, AlertCircle, RefreshCw, Square, Network, Link, GitMerge
} from "lucide-react";
import { FeatureFlow, FileNode, RouteNode, RepositorySubway } from "@shared/types";

interface SubwayDetailsProps {
  stationId?: string | null; // e.g. "subway:Authentication:src/services/authService.ts"
  featureId?: string | null;   // e.g. "Authentication"
  result: any;
  subway: RepositorySubway;
  features: FeatureFlow[];
  onClose: () => void;
  onSwitchTab?: (tab: any) => void;
  onSetImpactFile?: (file: string) => void;
  onSelectTraceRouteId?: (routeId: string) => void;
  onStartJourney?: (featureId: string) => void;
  onStopJourney?: () => void;
  journeyActive?: boolean;
  journeyNodeId?: string | null;
  impactHighlightActive?: boolean;
  setImpactHighlightActive?: (active: boolean) => void;
}

export default function SubwayDetails({
  stationId,
  featureId,
  result,
  subway,
  features,
  onClose,
  onSwitchTab,
  onSetImpactFile,
  onSelectTraceRouteId,
  onStartJourney,
  onStopJourney,
  journeyActive = false,
  journeyNodeId = null,
  impactHighlightActive = false,
  setImpactHighlightActive,
}: SubwayDetailsProps) {
  
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

  const getFeatureName = (fId: string) => {
    const found = features.find(f => f.id === fId);
    return found ? found.name : (featureNames[fId] || fId);
  };

  // ─── SCOPE 1: Feature Domain Selection ───
  const selectedFeature = featureId ? features.find(f => f.id === featureId) : null;
  
  // Calculate vertical dependents (Who depends on this feature)
  const dependents = selectedFeature 
    ? features.filter(f => f.id !== selectedFeature.id && f.dependencies.includes(selectedFeature.id))
    : [];

  if (selectedFeature && !stationId) {
    const lineInfo = subway.lines.find(l => l.feature === selectedFeature.id);
    const lineStations = lineInfo?.stations || [];

    return (
      <Card className="p-5 flex flex-col h-full bg-zinc-950/95 border border-border/80 shadow-2xl overflow-y-auto text-left space-y-4 select-none">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-border/50">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-3 h-3 rounded-full animate-pulse" style={{ backgroundColor: selectedFeature.color }} />
            <h3 className="text-sm font-bold text-zinc-100 truncate" title={selectedFeature.name}>
              {selectedFeature.name} Subway Line
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
              Line Journey Controller
            </div>
            {journeyActive ? (
              <Button
                onClick={onStopJourney}
                className="w-full text-[10px] font-bold py-2 h-auto bg-red-650 hover:bg-red-700 text-white flex items-center justify-center gap-1.5"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
                Stop Line Journey
              </Button>
            ) : (
              <Button
                onClick={() => onStartJourney(selectedFeature.id)}
                className="w-full text-[10px] font-bold py-2 h-auto bg-primary text-background hover:bg-primary/90 flex items-center justify-center gap-1.5"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                Start Line Journey
              </Button>
            )}
            {journeyActive && journeyNodeId && (
              <div className="text-[8.5px] text-zinc-400 text-center font-mono animate-pulse">
                Currently at: <span className="text-primary font-bold">{journeyNodeId.split(":").pop()?.split(/[\\/]/).pop()}</span>
              </div>
            )}
          </Card>
        )}

        {/* Metrics Grid */}
        <div className="space-y-1">
          <span className="text-[8px] font-bold text-zinc-550 uppercase tracking-widest block">Subway Line Metrics</span>
          <div className="grid grid-cols-2 gap-2">
            <div className="p-2.5 rounded-lg bg-zinc-900/50 border border-border/40 text-center sm:text-left">
              <span className="text-[8px] text-zinc-500 uppercase font-semibold">Stations</span>
              <div className="text-sm font-extrabold text-white mt-0.5">{lineStations.length}</div>
            </div>
            <div className="p-2.5 rounded-lg bg-zinc-900/50 border border-border/40 text-center sm:text-left">
              <span className="text-[8px] text-zinc-550 uppercase font-semibold">Transfers</span>
              <div className="text-sm font-extrabold text-white mt-0.5">
                {lineStations.filter(sId => subway.transfers.includes(sId)).length}
              </div>
            </div>
            <div className="p-2.5 rounded-lg bg-zinc-900/50 border border-border/40 text-center sm:text-left">
              <span className="text-[8px] text-zinc-505 uppercase font-semibold">Complexity Sum</span>
              <div className="text-sm font-extrabold text-white mt-0.5">Σ {selectedFeature.metrics.complexity}</div>
            </div>
            <div className="p-2.5 rounded-lg bg-zinc-900/50 border border-border/40 text-center sm:text-left">
              <span className="text-[8px] text-zinc-550 uppercase font-semibold">DB Terminals</span>
              <div className="text-sm font-extrabold text-white mt-0.5">{selectedFeature.metrics.tables}</div>
            </div>
          </div>
        </div>

        {/* Domain Health & Confidence */}
        <div className="grid grid-cols-2 gap-2">
          <div className="p-2.5 rounded-lg bg-zinc-900/50 border border-border/40">
            <span className="text-[8px] text-zinc-550 uppercase font-semibold block mb-0.5">Line Health</span>
            <Badge variant={selectedFeature.health >= 90 ? "success" : selectedFeature.health >= 70 ? "warning" : "error"} className="text-[9px] font-bold">
              {selectedFeature.health}/100
            </Badge>
          </div>
          <div className="p-2.5 rounded-lg bg-zinc-900/50 border border-border/40">
            <span className="text-[8px] text-zinc-550 uppercase font-semibold block mb-0.5">Confidence</span>
            <div className="text-xs font-bold text-zinc-350">{selectedFeature.confidence}% Conf</div>
          </div>
        </div>

        {/* Stations Sequence Along the Track */}
        <div className="space-y-1.5">
          <span className="text-[8px] font-bold text-zinc-550 uppercase tracking-widest block">Line Station Track Sequence</span>
          <div className="space-y-1 max-h-[140px] overflow-y-auto pr-1">
            {lineStations.map((sId, idx) => {
              const station = subway.stations.find(s => s.id === sId);
              const isTransfer = subway.transfers.includes(sId);
              const filename = sId.split(/[\\/]/).pop() || sId;
              let displayName = filename;
              if (station?.type === "route") {
                displayName = sId.replace("route:", "");
              } else if (station?.type === "database") {
                displayName = `🗄️ ${filename}`;
              }

              return (
                <div key={sId} className="flex items-center gap-2 p-1.5 rounded bg-zinc-900/60 border border-border/40 text-[9.5px]">
                  <span className="text-zinc-500 font-mono w-4 shrink-0 text-right">{idx + 1}.</span>
                  <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: selectedFeature.color }} />
                  <span className="font-mono text-zinc-300 truncate flex-1">{displayName}</span>
                  {isTransfer && (
                    <Badge variant="secondary" className="text-[7.5px] font-bold px-1 py-0 bg-zinc-800 border-zinc-700 text-zinc-400">
                      🔄 Transfer
                    </Badge>
                  )}
                </div>
              );
            })}
          </div>
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
                  {getFeatureName(depId)}
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

  // ─── SCOPE 2: Station Node Selection ───
  if (!stationId) return null;

  // stationId is "subway:FeatureId:stationCleanId"
  const parts = stationId.split(":");
  const currentLineFeatureId = parts[1] || "";
  const stationIdClean = parts.slice(2).join(":"); // e.g. "src/services/authService.ts" or "route:POST:/login" or "db:PostgreSQL"

  // Find the station definition from the subway map data
  const subwayStation = subway.stations.find(s => s.id === stationIdClean);
  if (!subwayStation) return null;

  const type = subwayStation.type;
  
  let labelName = "";
  let filePath = "";
  let entityName = "";
  let routeMethod = "";
  let routePath = "";

  if (type === "route") {
    // stationIdClean is "route:METHOD:PATH"
    const routeParts = stationIdClean.split(":");
    routeMethod = routeParts[1] || "";
    routePath = routeParts.slice(2).join(":") || "";
    labelName = `${routeMethod} ${routePath}`;
  } else if (type === "database") {
    // stationIdClean is "db:DBType"
    entityName = stationIdClean.replace("db:", "");
    labelName = entityName;
  } else {
    // file path
    filePath = stationIdClean;
    labelName = filePath.split(/[\\/]/).pop() || filePath;
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
  } else if (type === "database") {
    dbEntitiesAccessed = [entityName];
  }

  // Check if it's a Transfer Station (intersects multiple features)
  const isTransferStation = subwayStation.features.length > 1;

  return (
    <Card className="p-5 flex flex-col h-full bg-zinc-950/95 border border-border/80 shadow-2xl overflow-y-auto text-left space-y-4 select-none">
      
      {/* Title Header */}
      <div className="flex items-center justify-between pb-3 border-b border-border/50">
        <div className="flex items-center gap-2 min-w-0">
          {type === "route" && <Network className="w-4 h-4 text-emerald-400 shrink-0" />}
          {type === "database" && <Database className="w-4 h-4 text-rose-400 shrink-0" />}
          {type !== "route" && type !== "database" && <FileText className="w-4 h-4 text-blue-400 shrink-0" />}
          <h3 className="text-sm font-bold text-zinc-100 truncate" title={labelName}>
            {labelName}
          </h3>
        </div>
        <button onClick={onClose} className="p-1 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Shared Transfer Interchange Flag (Rajiv Chowk Alert) */}
      {isTransferStation && (
        <Card className="p-3 bg-zinc-900/60 border border-primary/40 space-y-2 shrink-0">
          <div className="flex items-center gap-1.5 text-primary">
            <GitMerge className="w-4 h-4 text-primary animate-pulse" />
            <span className="text-[10px] font-bold uppercase tracking-wider">Transfer Interchange Hub</span>
          </div>
          <p className="text-[9px] text-zinc-400 leading-normal">
            This station bridges multiple business lines. Any breaking modifications here will propagate across multiple domains!
          </p>
          <div className="space-y-1">
            <span className="text-[8px] font-bold text-zinc-550 uppercase tracking-widest block">Connected Tracks</span>
            <div className="flex flex-wrap gap-1.5">
              {subwayStation.features.map(fId => {
                const feat = features.find(f => f.id === fId);
                const color = feat ? feat.color : "#71717a";
                return (
                  <Badge
                    key={fId}
                    variant="secondary"
                    className="text-[9px] font-semibold border-zinc-700 bg-zinc-900 text-zinc-300"
                    style={{ borderLeft: `3px solid ${color}` }}
                  >
                    {feat ? feat.name : fId}
                  </Badge>
                );
              })}
            </div>
          </div>
        </Card>
      )}

      {/* Feature & Station Type badges */}
      <div className="flex gap-2">
        <div className="space-y-1 flex-1">
          <span className="text-[8px] font-bold text-zinc-550 uppercase tracking-widest block">Current Line Context</span>
          <Badge variant="primary" className="text-[9px] uppercase font-bold tracking-wider">
            {getFeatureName(currentLineFeatureId)}
          </Badge>
        </div>
        <div className="space-y-1 flex-1">
          <span className="text-[8px] font-bold text-zinc-550 uppercase tracking-widest block">Station Type</span>
          <Badge variant="secondary" className="text-[9px] uppercase font-bold tracking-wider">
            {type === "route" ? "API Route" : type === "database" ? "Database Terminal" : `${type.toUpperCase()}`}
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
      {type !== "route" && type !== "database" && onSwitchTab && onSetImpactFile && (
        <Card className="p-3 bg-zinc-900/40 border border-border/60 space-y-2 shrink-0">
          <div className="text-[9px] font-bold text-zinc-450 uppercase tracking-widest text-center mb-1">
            Station Actions
          </div>
          <div className="flex flex-col gap-2">
            <Button
              onClick={() => {
                if (onSetImpactFile && onSwitchTab) {
                  onSetImpactFile(filePath);
                  onSwitchTab("impact");
                }
              }}
              className="w-full text-[9.5px] font-bold py-1.5 h-auto bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-border/60"
            >
              Go to Impact Timeline
            </Button>

            {setImpactHighlightActive && (
              <Button
                onClick={() => setImpactHighlightActive(!impactHighlightActive)}
                className={`w-full text-[9.5px] font-bold py-1.5 h-auto flex items-center justify-center gap-1.5 transition-colors ${
                  impactHighlightActive
                    ? "bg-red-650 hover:bg-red-700 text-white"
                    : "bg-primary text-background hover:bg-primary/90"
                }`}
              >
                <GitMerge className="w-3.5 h-3.5" />
                <span>
                  {impactHighlightActive ? "Disable Impact Heatmap" : "Change Propagation Heatmap"}
                </span>
              </Button>
            )}
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
            <span className="text-[8px] font-bold text-zinc-450 uppercase tracking-widest">Database Entities Accessed</span>
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
