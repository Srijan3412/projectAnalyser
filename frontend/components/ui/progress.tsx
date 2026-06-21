import React from "react";

interface ProgressProps {
  value: number; // 0 to 100
  className?: string;
  showText?: boolean;
}

export function Progress({ value, className = "", showText = false }: ProgressProps) {
  const percentage = Math.min(Math.max(value, 0), 100);

  return (
    <div className={`w-full ${className}`}>
      {showText && (
        <div className="flex justify-between text-xs text-muted-foreground font-semibold mb-1.5">
          <span>Processing</span>
          <span>{percentage}%</span>
        </div>
      ) }
      <div className="w-full h-2 rounded-full bg-zinc-800 overflow-hidden border border-border/30">
        <div
          className="h-full bg-gradient-to-r from-primary to-emerald-400 transition-all duration-500 ease-out"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
