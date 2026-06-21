import React, { useMemo } from "react";
import { Shield, Database, FileText, Activity, AlertTriangle, CheckCircle2, Award } from "lucide-react";
import { FeatureFlow, FileNode } from "@shared/types";
import { Badge } from "../../ui/badge";

interface FeatureLegendProps {
  features: FeatureFlow[];
  result: any;
  hoveredFeature: string | null;
  setHoveredFeature: (id: string | null) => void;
  selectedFeature: string | null;
  setSelectedFeature: (id: string | null) => void;
}

export default function FeatureLegend({
  features,
  result,
  hoveredFeature,
  setHoveredFeature,
  selectedFeature,
  setSelectedFeature,
}: FeatureLegendProps) {
  
  // Calculate Feature Importance Leaderboard: sorted by total incoming dependencies
  const rankedFeatures = useMemo(() => {
    const files: FileNode[] = result?.files || [];
    return features.map(f => {
      // Sum incoming referrers for all files in this feature
      const totalReferrers = f.files.reduce((sum, fPath) => {
        const fileNode = files.find(fn => fn.path === fPath);
        return sum + (fileNode?.referencedBy?.length || 0);
      }, 0);
      return {
        ...f,
        score: totalReferrers
      };
    }).sort((a, b) => b.score - a.score);
  }, [features, result]);

  // Health Score Style Helper
  const getHealthStyle = (score: number) => {
    if (score >= 90) return { color: "text-emerald-400 border-emerald-800/40 bg-emerald-950/20", icon: CheckCircle2 };
    if (score >= 70) return { color: "text-amber-400 border-amber-800/40 bg-amber-950/20", icon: AlertTriangle };
    return { color: "text-red-400 border-red-800/40 bg-red-950/20", icon: AlertTriangle };
  };

  return (
    <div className="flex flex-col bg-zinc-950/40 border border-border/60 rounded-2xl p-4 space-y-4 overflow-hidden h-full select-none">
      
      {/* Title & Info */}
      <div className="border-b border-border/50 pb-2.5 shrink-0">
        <h4 className="text-xs font-bold uppercase tracking-widest text-primary flex items-center gap-1.5">
          <Activity className="w-3.5 h-3.5 text-primary animate-pulse" />
          <span>Business Features</span>
        </h4>
        <p className="text-[10px] text-zinc-550 mt-1 leading-normal">
          Hover/click a metro line to highlight domains or inspect details.
        </p>
      </div>

      {/* Main Features List */}
      <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-0">
        {features.map((feature) => {
          const isHovered = hoveredFeature === feature.id;
          const isSelected = selectedFeature === feature.id;
          const isActive = isSelected || isHovered;
          
          const healthStyle = getHealthStyle(feature.health);
          const HealthIcon = healthStyle.icon;

          return (
            <div
              key={feature.id}
              onMouseEnter={() => setHoveredFeature(feature.id)}
              onMouseLeave={() => setHoveredFeature(null)}
              onClick={() => setSelectedFeature(isSelected ? null : feature.id)}
              className={`p-3 rounded-xl border cursor-pointer transition-all duration-300 text-left ${
                isActive
                  ? "bg-zinc-900/80 border-primary shadow-lg scale-[1.01]"
                  : "bg-zinc-900/30 border-border/40 hover:border-border/80"
              }`}
              style={{
                borderLeft: `4.5px solid ${feature.color}`,
              }}
            >
              {/* Header: Name and Auth badge */}
              <div className="flex items-start justify-between gap-1.5">
                <span className="text-xs font-bold text-zinc-200 truncate pr-1">
                  {feature.name}
                </span>
                <div className="flex gap-1 shrink-0 items-center">
                  {feature.auth && (
                    <Badge variant="success" className="text-[7px] px-1 py-0 border-emerald-500/20 bg-emerald-950/20 text-emerald-400">
                      🔒 Auth
                    </Badge>
                  )}
                </div>
              </div>

              {/* Advanced Diagnostics (Confidence & Health) */}
              <div className="flex items-center gap-2 mt-1.5 text-[9px] font-semibold">
                {/* Health Rating Badge */}
                <div className={`px-1.5 py-0.5 rounded border flex items-center gap-1 font-bold ${healthStyle.color}`}>
                  <HealthIcon className="w-2.5 h-2.5 shrink-0" />
                  <span>{feature.health} Health</span>
                </div>
                
                {/* Confidence meter */}
                <span className="text-zinc-450 text-[8.5px]">
                  {feature.confidence}% Confidence
                </span>
              </div>

              {/* Quick stats mini bar */}
              <div className="flex flex-wrap gap-1.5 mt-2.5 pt-2 border-t border-border/20">
                {feature.metrics.routes > 0 && (
                  <span className="flex items-center gap-0.5 text-[8.5px] text-zinc-450 font-mono">
                    <Activity className="w-2.5 h-2.5 text-zinc-600" />
                    {feature.metrics.routes} R
                  </span>
                )}
                {(feature.metrics.services > 0 || feature.metrics.repositories > 0) && (
                  <span className="flex items-center gap-0.5 text-[8.5px] text-zinc-450 font-mono">
                    <FileText className="w-2.5 h-2.5 text-zinc-600" />
                    {feature.metrics.services + feature.metrics.repositories} S
                  </span>
                )}
                {feature.metrics.tables > 0 && (
                  <span className="flex items-center gap-0.5 text-[8.5px] text-zinc-450 font-mono">
                    <Database className="w-2.5 h-2.5 text-zinc-600" />
                    {feature.metrics.tables} DB
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Feature Timeline / Dependency Importance Leaderboard */}
      <div className="border-t border-border/50 pt-3 shrink-0 bg-zinc-900/10 rounded-b-xl p-2.5 space-y-2">
        <h5 className="text-[9.5px] font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1">
          <Award className="w-3.5 h-3.5 text-primary" />
          <span>Dependency Importance</span>
        </h5>
        
        <div className="space-y-1.5 max-h-[100px] overflow-y-auto pr-1">
          {rankedFeatures.slice(0, 3).map((rf, rIdx) => (
            <div key={rf.id} className="flex items-center justify-between p-1.5 rounded bg-zinc-950/60 border border-border/40">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[8px] font-bold w-4 h-4 rounded-full bg-zinc-900 border border-border flex items-center justify-center text-zinc-400 shrink-0">
                  {rIdx + 1}
                </span>
                <span className="text-[9.5px] font-semibold text-zinc-300 truncate">{rf.name}</span>
              </div>
              <Badge variant="secondary" className="text-[7.5px] font-bold px-1.5 py-0">
                Score: {rf.score}
              </Badge>
            </div>
          ))}
        </div>
      </div>
      
    </div>
  );
}
