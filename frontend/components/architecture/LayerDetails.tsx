import React from "react";
import { Card } from "../ui/card";
import { Badge } from "../ui/badge";
import { X, FileText, ArrowRight, ArrowLeft, Zap, Info } from "lucide-react";
import { FileNode } from "@shared/types";

interface LayerDetailsProps {
  filePath: string;
  layerName: string;
  result: any;
  onClose: () => void;
}

export default function LayerDetails({ filePath, layerName, result, onClose }: LayerDetailsProps) {
  const files: FileNode[] = result.files || [];
  const fileNode = files.find(f => f.path === filePath);
  
  // Find complexity from static analysis report
  const staticReport = result.staticAnalysis;
  const complexityInfo = staticReport?.complexity?.find((c: any) => c.file === filePath);
  const godInfo = staticReport?.godServices?.find((g: any) => g.file === filePath);

  const formatBytes = (bytes: number) => {
    if (!bytes) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  const filename = filePath.split(/[\\/]/).pop() || filePath;

  return (
    <Card className="p-5 flex flex-col h-full bg-zinc-950/95 border border-border/80 shadow-2xl overflow-y-auto text-left space-y-4">
      {/* Title Header */}
      <div className="flex items-center justify-between pb-3 border-b border-border/50">
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="w-4 h-4 text-primary shrink-0" />
          <h3 className="text-sm font-bold text-zinc-100 truncate" title={filename}>{filename}</h3>
        </div>
        <button onClick={onClose} className="p-1 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Layer Badge */}
      <div className="space-y-1">
        <span className="text-[9px] font-bold text-zinc-550 uppercase tracking-widest block">Architecture Layer</span>
        <Badge variant="primary" className="text-[10px] uppercase font-bold tracking-wider">{layerName}</Badge>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-2">
        <div className="p-3 rounded-xl bg-zinc-900/60 border border-border/50 text-center sm:text-left">
          <span className="text-[8px] text-muted-foreground uppercase font-semibold">File Size</span>
          <div className="text-sm font-extrabold text-white mt-0.5">{fileNode ? formatBytes(fileNode.size) : "—"}</div>
        </div>
        <div className="p-3 rounded-xl bg-zinc-900/60 border border-border/50 text-center sm:text-left">
          <span className="text-[8px] text-muted-foreground uppercase font-semibold">Lines of Code</span>
          <div className="text-sm font-extrabold text-white mt-0.5">{fileNode ? fileNode.lineCount : "—"}</div>
        </div>
      </div>

      {/* Complexity and God metrics */}
      {(complexityInfo || godInfo) && (
        <div className="p-3 rounded-xl bg-rose-950/10 border border-rose-900/30 space-y-2">
          <div className="flex items-center gap-1.5 text-rose-400">
            <Zap className="w-4 h-4" />
            <span className="text-[10px] font-bold uppercase tracking-wider">Complexity Analyzer</span>
          </div>
          
          <div className="space-y-1.5 text-xs">
            {complexityInfo && (
              <div className="flex justify-between items-center text-[11px]">
                <span className="text-zinc-400">Complexity Score:</span>
                <Badge variant={complexityInfo.rating === "risky" ? "error" : "warning"} className="text-[9px] font-bold">
                  {complexityInfo.score} ({complexityInfo.rating})
                </Badge>
              </div>
            )}
            
            {godInfo && (
              <div className="flex justify-between items-center text-[11px]">
                <span className="text-zinc-400">God Service Status:</span>
                <span className="text-purple-400 font-semibold text-[10px]">GOD SERVICE</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Imports (Dependencies) */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5">
          <ArrowRight className="w-3.5 h-3.5 text-blue-400" />
          <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest">Imports ({fileNode?.internalImports?.length ?? 0})</span>
        </div>
        <div className="space-y-1.5 max-h-[140px] overflow-y-auto pr-1">
          {fileNode?.internalImports && fileNode.internalImports.length > 0 ? (
            fileNode.internalImports.map(imp => (
              <div key={imp} className="p-1.5 rounded bg-zinc-900/60 border border-border/40 text-[10px] font-mono text-zinc-300 truncate" title={imp}>
                {imp.split(/[\\/]/).pop()}
              </div>
            ))
          ) : (
            <span className="text-[10px] text-zinc-550 italic block pl-1">No internal module imports</span>
          )}
        </div>
      </div>

      {/* Referenced By (Incoming references) */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5">
          <ArrowLeft className="w-3.5 h-3.5 text-purple-400" />
          <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest">Referenced By ({fileNode?.referencedBy?.length ?? 0})</span>
        </div>
        <div className="space-y-1.5 max-h-[140px] overflow-y-auto pr-1">
          {fileNode?.referencedBy && fileNode.referencedBy.length > 0 ? (
            fileNode.referencedBy.map(ref => (
              <div key={ref} className="p-1.5 rounded bg-zinc-900/60 border border-border/40 text-[10px] font-mono text-zinc-300 truncate" title={ref}>
                {ref.split(/[\\/]/).pop()}
              </div>
            ))
          ) : (
            <span className="text-[10px] text-zinc-550 italic block pl-1">No incoming references found</span>
          )}
        </div>
      </div>

      {/* Path info */}
      <div className="p-3 rounded-xl bg-zinc-900/40 border border-border/40 space-y-1">
        <div className="flex items-center gap-1.5 text-zinc-450">
          <Info className="w-3 h-3 text-muted-foreground" />
          <span className="text-[8.5px] font-bold uppercase tracking-wider">Workspace Path</span>
        </div>
        <code className="block text-[9.5px] font-mono text-zinc-450 break-all leading-normal">{filePath}</code>
      </div>
    </Card>
  );
}
