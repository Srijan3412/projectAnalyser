import { motion } from "framer-motion";
import {
  Upload,
  Clock,
  GitBranch,
  Archive,
  Search,
  CheckCircle2,
  XCircle,
  Loader2,
  FileSearch
} from "lucide-react";
import { Progress } from "../ui/progress";

type IngestionStatus = "uploaded" | "queued" | "cloning" | "extracting" | "scanning" | "completed" | "failed" | string;

interface Stage {
  id: IngestionStatus;
  label: string;
  icon: typeof Upload;
  description: string;
}

const stages: Stage[] = [
  { id: "uploaded", label: "Uploaded", icon: Upload, description: "Codebase received" },
  { id: "queued", label: "Queued", icon: Clock, description: "Waiting for queue worker" },
  { id: "cloning", label: "Cloning", icon: GitBranch, description: "Fetching Git repository" },
  { id: "extracting", label: "Extracting", icon: Archive, description: "Decompressing ZIP package" },
  { id: "scanning", label: "Scanning", icon: Search, description: "Running AST parsing pipeline" },
  { id: "completed", label: "Completed", icon: CheckCircle2, description: "Analysis successful" }
];

interface ProgressTrackerProps {
  status: IngestionStatus;
  progress: number;
  jobId?: string | null;
  error?: string | null;
}

export default function ProgressTracker({
  status,
  progress,
  jobId,
  error
}: ProgressTrackerProps) {
  const currentStageIndex = stages.findIndex((s) => s.id === status);
  const isFailed = status === "failed";
  const isComplete = status === "completed";

  const getStageStatus = (stageId: IngestionStatus): "pending" | "active" | "completed" | "failed" => {
    if (isFailed) return "failed";
    const idx = stages.findIndex((s) => s.id === stageId);
    if (idx < currentStageIndex) return "completed";
    if (idx === currentStageIndex) return "active";
    return "pending";
  };

  const getStageColor = (stageStatus: "pending" | "active" | "completed" | "failed") => {
    switch (stageStatus) {
      case "completed":
        return "text-primary bg-primary/10 border-primary/30";
      case "active":
        return "text-primary bg-primary/15 border-primary/40 animate-pulse";
      case "failed":
        return "text-red-500 bg-red-500/10 border-red-500/30";
      default:
        return "text-zinc-500 bg-zinc-800/20 border-zinc-700/30";
    }
  };

  return (
    <div className="w-full max-w-3xl mx-auto">
      <div className="glass-card rounded-2xl p-6 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="font-bold text-white text-lg">Analysis Pipeline</h3>
            <p className="text-sm text-muted-foreground">
              {isFailed
                ? "Pipeline execution failed"
                : isComplete
                ? "Intelligence pipeline complete!"
                : "Parsing codebase syntax trees..."}
            </p>
          </div>
          {jobId && (
            <div className="text-xs text-muted-foreground font-mono bg-zinc-900 px-3 py-1.5 rounded-lg border border-border/50">
              Job: {jobId.slice(0, 8)}...
            </div>
          )}
        </div>

        {/* Progress Bar */}
        <div className="mb-8">
          <div className="flex justify-between text-xs mb-2">
            <span className="text-muted-foreground uppercase tracking-widest font-semibold">Progress</span>
            <span className="text-primary font-bold">{progress}%</span>
          </div>
          <Progress value={progress} showText={false} />
        </div>

        {/* Stages List */}
        <div className="space-y-3 relative">
          {stages.map((stage, index) => {
            const stageStatus = getStageStatus(stage.id);
            const Icon = stage.icon;
            const colorClass = getStageColor(stageStatus);
            const isActive = stageStatus === "active";

            return (
              <motion.div
                key={stage.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
                className={`flex items-center gap-4 p-3 rounded-xl border border-transparent transition-all duration-300 relative z-10 ${
                  isActive ? "bg-zinc-800/40 border-border/50 shadow-md" : ""
                }`}
              >
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center border ${colorClass}`}>
                  {isActive ? (
                    <Loader2 className="animate-spin text-primary" size={18} />
                  ) : stageStatus === "completed" ? (
                    <CheckCircle2 size={18} className="text-primary" />
                  ) : stageStatus === "failed" ? (
                    <XCircle size={18} className="text-red-500" />
                  ) : (
                    <Icon size={18} />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-white text-sm">{stage.label}</span>
                    {isActive && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary/20 text-primary">
                        In Progress
                      </span>
                    )}
                    {stageStatus === "completed" && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary/10 text-primary/80">
                        Completed
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{stage.description}</p>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Ingestion Checklist */}
        {status === "scanning" && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-6 pt-6 border-t border-border/50"
          >
            <h4 className="text-xs font-bold uppercase tracking-widest text-primary mb-4 flex items-center gap-2">
              <FileSearch size={14} />
              AST Analysis Checklist
            </h4>
            <div className="grid grid-cols-2 gap-3 p-3 bg-zinc-900/40 border border-border/50 rounded-xl">
              <CheckItem label="AST Parser Pipeline" isComplete />
              <CheckItem label="Framework Classifier" isComplete />
              <CheckItem label="Route Decorator Engine" isActive />
              <CheckItem label="Static Import Graph" />
            </div>
          </motion.div>
        )}

        {/* Error Display */}
        {isFailed && error && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-6 p-4 rounded-xl bg-red-950/20 border border-red-900/50"
          >
            <div className="flex items-start gap-3">
              <XCircle className="text-red-500 flex-shrink-0 mt-0.5" size={18} />
              <div>
                <p className="text-red-400 font-semibold text-sm">Analysis Pipeline Failed</p>
                <p className="text-red-300/80 text-xs mt-1 leading-relaxed">{error}</p>
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}

function CheckItem({ label, isComplete, isActive }: { label: string; isComplete?: boolean; isActive?: boolean }) {
  return (
    <div className="flex items-center gap-2 text-xs font-medium">
      {isComplete ? (
        <CheckCircle2 size={12} className="text-primary shrink-0" />
      ) : isActive ? (
        <Loader2 size={12} className="text-primary animate-spin shrink-0" />
      ) : (
        <div className="w-3 h-3 rounded-full border border-zinc-700 shrink-0" />
      )}
      <span className={isComplete ? "text-zinc-300" : isActive ? "text-primary font-semibold" : "text-zinc-550"}>
        {label}
      </span>
    </div>
  );
}
