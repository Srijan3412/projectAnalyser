import React from "react";
import { Handle, Position } from "@xyflow/react";
import { Badge } from "../ui/badge";
import { Shield, Network, Terminal, Layers, Database } from "lucide-react";

const LAYER_ICONS: Record<string, React.ReactNode> = {
  Routes: <Network className="w-4.5 h-4.5" />,
  Controllers: <Terminal className="w-4.5 h-4.5" />,
  Services: <Layers className="w-4.5 h-4.5" />,
  Repositories: <Shield className="w-4.5 h-4.5" />,
  Database: <Database className="w-4.5 h-4.5" />,
};

const LAYER_THEMES: Record<string, { bg: string; border: string; text: string; accent: string }> = {
  Routes: { bg: "bg-blue-950/40", border: "border-blue-500/50", text: "text-blue-300", accent: "blue" },
  Controllers: { bg: "bg-purple-950/40", border: "border-purple-500/50", text: "text-purple-300", accent: "purple" },
  Services: { bg: "bg-amber-950/40", border: "border-amber-500/50", text: "text-amber-300", accent: "amber" },
  Repositories: { bg: "bg-emerald-950/40", border: "border-emerald-500/50", text: "text-emerald-300", accent: "emerald" },
  Database: { bg: "bg-rose-950/40", border: "border-rose-500/50", text: "text-rose-300", accent: "rose" },
};

export default function LayerNode({ data }: { data: any }) {
  const { label, count, isExpanded } = data;
  const theme = LAYER_THEMES[label] || LAYER_THEMES.Services;

  return (
    <div className={`p-4 rounded-2xl border bg-zinc-900/90 backdrop-blur-md transition-all duration-300 shadow-xl min-w-[220px] ${theme.border}`}>
      <Handle type="target" position={Position.Top} className="opacity-0" />
      
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className={`p-1.5 rounded-lg ${theme.bg} ${theme.text}`}>
            {LAYER_ICONS[label] || <Layers className="w-4 h-4" />}
          </div>
          <div className="text-left">
            <h4 className="text-xs font-bold text-zinc-100">{label}</h4>
            <span className="text-[10px] text-muted-foreground">{count} files</span>
          </div>
        </div>
        
        <Badge className={`text-[9px] uppercase tracking-wider font-bold shrink-0 ${isExpanded ? "bg-primary text-background" : "bg-zinc-800 text-zinc-400"}`}>
          {isExpanded ? "Expanded" : "View"}
        </Badge>
      </div>

      <Handle type="source" position={Position.Bottom} className="opacity-0" />
    </div>
  );
}
