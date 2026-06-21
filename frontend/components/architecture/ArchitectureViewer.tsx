"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Layers,
  Network,
  Route,
  Package,
  GitBranch,
  Train,
  Map,
  Activity,
  ChevronRight,
  AlertTriangle,
} from "lucide-react";

import LayerView from "./LayerView";
import FileGraph from "./FileGraph";
import RouteGraph from "./RouteGraph";
import DependencyGraph from "./DependencyGraph";
import ExecutionTrace from "./ExecutionTrace";
import MetroMap from "./MetroMap/MetroMap";
import SubwayMap from "./SubwayMap/SubwayMap";

type ArchMode = "layer" | "file" | "route" | "dependency" | "trace" | "metro" | "subway";

const TABS: { id: ArchMode; label: string; icon: React.ReactNode }[] = [
  { id: "layer",      label: "Layered View",       icon: <Layers size={16} /> },
  { id: "file",       label: "File Graph",          icon: <Network size={16} /> },
  { id: "route",      label: "Route Graph",         icon: <Route size={16} /> },
  { id: "dependency", label: "Dependency Graph",    icon: <Package size={16} /> },
  { id: "trace",      label: "Execution Trace",     icon: <GitBranch size={16} /> },
  { id: "metro",      label: "Metro Map",           icon: <Map size={16} /> },
  { id: "subway",     label: "Subway Map",          icon: <Train size={16} /> },
];

interface ArchitectureViewerProps {
  result: any;
  onSwitchTab?: (tab: any) => void;
  onSetImpactFile?: (file: string) => void;
  onSelectTraceRouteId?: (routeId: string) => void;
}

export default function ArchitectureViewer({
  result,
  onSwitchTab,
  onSetImpactFile,
  onSelectTraceRouteId,
}: ArchitectureViewerProps) {
  const [activeMode, setActiveMode] = useState<ArchMode>("layer");

  // Derive sidebar info from result
  const features: { name: string; color: string; fileCount: number; health: number; confidence: number }[] =
    React.useMemo(() => {
      const raw = result?.architecture?.features || result?.features || [];
      if (raw.length > 0) return raw.map((f: any) => ({
        name: f.name || f.id,
        color: f.color || "#10b981",
        fileCount: f.files?.length || f.fileCount || 0,
        health: f.health ?? 80,
        confidence: f.confidence ?? 0.5,
      }));

      // Fallback: derive from file paths
      const files: any[] = result?.files || [];
      const groups: Record<string, string[]> = {};
      for (const f of files) {
        const path: string = f.path || "";
        if (path.startsWith("ROUTE:") || path.startsWith("ENV:") || path.startsWith("DB:") || path.startsWith("ENTITY:")) continue;
        const seg = path.split("/");
        const domain = seg.length > 2 ? seg[1] : seg[0] || "Core";
        if (!groups[domain]) groups[domain] = [];
        groups[domain].push(path);
      }

      const palette = ["#10b981","#3b82f6","#f59e0b","#a855f7","#ef4444","#06b6d4","#ec4899","#f97316"];
      return Object.entries(groups).slice(0, 8).map(([name, fs], i) => ({
        name,
        color: palette[i % palette.length],
        fileCount: fs.length,
        health: Math.max(10, 100 - fs.length * 2),
        confidence: 0.5 + Math.random() * 0.4,
      }));
    }, [result]);

  const totalFiles = result?.overview?.totalFiles || result?.files?.length || 0;
  const totalRoutes = result?.overview?.totalRoutes || result?.routes?.length || 0;

  const sidebarTitle = activeMode === "subway" || activeMode === "metro"
    ? "TRANSIT NETWORK LINES"
    : activeMode === "layer"
    ? "ARCHITECTURE LAYERS"
    : "CODEBASE FEATURES";

  const sidebarDesc = activeMode === "subway"
    ? "A city-wide transit network map. Hover or click a subway line to highlight domains."
    : activeMode === "metro"
    ? "Hover/click a metro line to highlight domains or inspect details."
    : activeMode === "layer"
    ? "Click tier box to expand file listings or start a tier tour."
    : "Click any node to inspect file details and dependencies.";

  // PageRank — top files by incoming reference count
  const topFiles = React.useMemo(() => {
    const files: any[] = (result?.files || []).filter((f: any) => {
      const p = f.path || "";
      return !p.startsWith("ROUTE:") && !p.startsWith("ENV:") && !p.startsWith("DB:") && !p.startsWith("ENTITY:");
    });
    return files
      .map((f: any) => ({
        name: (f.path || "").split("/").pop() || f.path,
        score: (f.referencedBy?.length || 0) * 10 + (f.lineCount || 0) / 10,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }, [result]);

  return (
    <div className="flex flex-col h-full w-full bg-zinc-950 rounded-2xl overflow-hidden border border-border/40">
      {/* ── Top Tab Navigation ───────────────────────────────────────── */}
      <div className="flex items-center justify-center gap-1 px-6 py-3 border-b border-border/30 bg-zinc-900/80 backdrop-blur-md shrink-0">
        {TABS.map((tab) => {
          const isActive = activeMode === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveMode(tab.id)}
              className={`flex flex-col items-center gap-0.5 px-4 py-2 rounded-xl text-xs font-semibold tracking-wide transition-all duration-200 min-w-[72px] ${
                isActive
                  ? "bg-primary text-background shadow-lg shadow-primary/20"
                  : "text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/60"
              }`}
            >
              {tab.icon}
              <span className="mt-0.5 leading-tight text-center">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* ── Body: Sidebar + Canvas ────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Left Sidebar */}
        <aside className="w-52 shrink-0 flex flex-col border-r border-border/30 bg-zinc-900/60 overflow-y-auto">
          {/* Title */}
          <div className="p-4 border-b border-border/20">
            <div className="flex items-center gap-2 mb-1">
              <Activity size={13} className="text-primary" />
              <h3 className="text-[11px] font-extrabold text-primary uppercase tracking-widest leading-tight">
                {sidebarTitle}
              </h3>
            </div>
            <p className="text-[10px] text-zinc-500 leading-relaxed">{sidebarDesc}</p>
          </div>

          {/* Feature Lines */}
          <div className="p-3 space-y-2 flex-1">
            {features.slice(0, 6).map((feat, i) => {
              const healthBad = feat.health < 40;
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="bg-zinc-900/80 border border-zinc-800/80 rounded-xl p-3 cursor-pointer hover:border-zinc-600/60 transition-all duration-200"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: feat.color }}
                    />
                    <span className="text-[11px] font-bold text-white truncate flex-1">
                      {feat.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-[10px]">
                    {healthBad && <AlertTriangle size={11} className="text-red-400 shrink-0" />}
                    <span className={`font-bold ${healthBad ? "text-red-400" : "text-zinc-300"}`}>
                      {feat.health}
                    </span>
                    <span className="text-zinc-500">Health</span>
                    <span className="text-zinc-300 font-bold ml-auto">
                      {Math.round(feat.confidence * 100)}%
                    </span>
                    <span className="text-zinc-500">Conf</span>
                  </div>
                  <div className="mt-2 flex items-center gap-1 text-[10px] text-zinc-500">
                    <ChevronRight size={10} />
                    <span>{feat.fileCount} files</span>
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* PageRank Importance */}
          {topFiles.length > 0 && (
            <div className="p-3 border-t border-border/20 shrink-0">
              <div className="flex items-center gap-1.5 mb-2">
                <span className="text-[9px] font-extrabold text-zinc-500 uppercase tracking-widest">
                  Pagerank Importance
                </span>
              </div>
              <div className="space-y-1.5">
                {topFiles.map((f, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-[9px] text-zinc-600 font-bold w-3">{i + 1}</span>
                    <span className="text-[10px] text-zinc-400 truncate flex-1 font-mono">{f.name}</span>
                    <div className="bg-zinc-800 text-zinc-300 text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                      {Math.round(f.score)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </aside>

        {/* Main Canvas */}
        <div className="flex-1 relative overflow-hidden bg-zinc-950">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeMode}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="absolute inset-0"
            >
              {activeMode === "layer" && <LayerView result={result} />}
              {activeMode === "file" && <FileGraph result={result} />}
              {activeMode === "route" && <RouteGraph result={result} />}
              {activeMode === "dependency" && <DependencyGraph result={result} />}
              {activeMode === "trace" && (
                <ExecutionTrace
                  result={result}
                  onSwitchTab={onSwitchTab}
                  onSetImpactFile={onSetImpactFile}
                />
              )}
              {activeMode === "metro" && (
                <MetroMap
                  result={result}
                  onSwitchTab={onSwitchTab}
                  onSetImpactFile={onSetImpactFile}
                  onSelectTraceRouteId={(routeId) => {
                    onSelectTraceRouteId?.(routeId);
                    setActiveMode("trace");
                  }}
                />
              )}
              {activeMode === "subway" && (
                <SubwayMap
                  result={result}
                  onSwitchTab={onSwitchTab}
                  onSetImpactFile={onSetImpactFile}
                  onSelectTraceRouteId={(routeId) => {
                    onSelectTraceRouteId?.(routeId);
                    setActiveMode("trace");
                  }}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
