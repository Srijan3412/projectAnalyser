import { motion } from "framer-motion";
import {
  Shield,
  ShieldCheck,
  Key,
  Lock,
  FileCode,
  Route,
  AlertTriangle,
  CheckCircle2
} from "lucide-react";
import { Badge } from "../ui/badge";

interface AuthDetectorProps {
  authType: string;
  evidence: string[];
}

const authBadges: Record<string, { icon: typeof Shield; color: string; bgColor: string; border: string }> = {
  JWT: { icon: Key, color: "text-amber-400", bgColor: "bg-amber-500/10", border: "border-amber-500/20" },
  "OAuth 2.0": { icon: Lock, color: "text-blue-400", bgColor: "bg-blue-500/10", border: "border-blue-500/20" },
  Supabase: { icon: Shield, color: "text-emerald-400", bgColor: "bg-emerald-500/10", border: "border-emerald-500/20" },
  "Supabase Auth": { icon: Shield, color: "text-emerald-400", bgColor: "bg-emerald-500/10", border: "border-emerald-500/20" },
  Firebase: { icon: ShieldCheck, color: "text-orange-400", bgColor: "bg-orange-500/10", border: "border-orange-500/20" },
  "Firebase Auth": { icon: ShieldCheck, color: "text-orange-400", bgColor: "bg-orange-500/10", border: "border-orange-500/20" },
  Clerk: { icon: ShieldCheck, color: "text-purple-400", bgColor: "bg-purple-500/10", border: "border-purple-500/20" },
  "Session-based": { icon: Lock, color: "text-zinc-400", bgColor: "bg-zinc-800/40", border: "border-zinc-700/30" },
  None: { icon: AlertTriangle, color: "text-red-400", bgColor: "bg-red-500/10", border: "border-red-500/20" }
};

export default function AuthDetector({ authType, evidence }: AuthDetectorProps) {
  const isNone = !authType || authType === "None detected" || authType === "None";

  if (isNone) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-red-950/20 backdrop-blur-xl rounded-xl p-6 border border-red-900/40 text-left"
      >
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="text-red-400" size={24} />
          </div>
          <div>
            <h3 className="font-bold text-white mb-1">No Authentication Detected</h3>
            <p className="text-xs text-red-300/80 leading-relaxed">
              This repository does not appear to have environment variables or configurations matching JWT, Firebase, Clerk, OAuth, or Session-based authentication.
            </p>
          </div>
        </div>
      </motion.div>
    );
  }

  const badge = authBadges[authType] || authBadges["JWT"];
  const Icon = badge.icon;
  const confidence = evidence.length > 0 ? Math.min(100, Math.round(50 + evidence.length * 15)) : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-zinc-900/60 backdrop-blur-xl rounded-xl p-6 border border-border/60 text-left"
    >
      <div className="flex items-start gap-4">
        <div className={`w-12 h-12 rounded-lg ${badge.bgColor} border ${badge.border} flex items-center justify-center flex-shrink-0`}>
          <Icon className={badge.color} size={24} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-2 flex-wrap">
            <h3 className="font-bold text-white text-base">Authentication Guard</h3>
            <Badge variant="success" className="text-xs px-2.5 py-0.5 font-bold">
              {authType}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mb-4">
            Confidence: <span className="text-primary font-bold">{confidence}%</span>
          </p>

          {/* Evidence Panel */}
          <div className="bg-zinc-950/40 rounded-lg p-4 border border-zinc-800/60">
            <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3 flex items-center gap-2">
              <FileCode size={12} className="text-primary" />
              Evidence Found
            </h4>
            <div className="space-y-2">
              {evidence.map((item, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, x: -5 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="flex items-start gap-2 text-xs"
                >
                  {item.includes("route") || item.includes("endpoint") ? (
                    <Route size={14} className="text-primary flex-shrink-0 mt-0.5" />
                  ) : (
                    <CheckCircle2 size={14} className="text-emerald-500 flex-shrink-0 mt-0.5" />
                  )}
                  <span className="text-zinc-350">{item}</span>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
