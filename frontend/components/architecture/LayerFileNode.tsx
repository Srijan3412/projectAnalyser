import React from "react";
import { Handle, Position } from "@xyflow/react";
import { FileCode } from "lucide-react";

export default function LayerFileNode({ data }: { data: any }) {
  const { label, isActive } = data;

  return (
    <div className={`p-2.5 rounded-xl border bg-zinc-950/80 backdrop-blur-md transition-all duration-200 shadow-md min-w-[170px] ${isActive ? "border-primary text-primary bg-primary/5" : "border-border/60 text-zinc-300 hover:border-zinc-400"}`}>
      <Handle type="target" position={Position.Top} className="opacity-0" />
      <div className="flex items-center gap-2 text-left">
        <FileCode className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
        <span className="text-[10.5px] font-mono font-bold truncate max-w-[130px]" title={label}>{label}</span>
      </div>
      <Handle type="source" position={Position.Bottom} className="opacity-0" />
    </div>
  );
}
