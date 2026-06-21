import { motion } from "framer-motion";
import { Code, FileCode, Percent, TrendingUp } from "lucide-react";
import { Badge } from "../ui/badge";

interface LanguageBreakdownProps {
  languages: Record<string, number>;
  totalLines?: number;
  entryPoints: Array<{ filePath?: string; path?: string; confidence: number }>;
}

const languageColors: Record<string, { bg: string; bar: string; text: string }> = {
  TypeScript: { bg: "bg-blue-500/10", bar: "bg-blue-500", text: "text-blue-400" },
  JavaScript: { bg: "bg-amber-500/10", bar: "bg-amber-500", text: "text-amber-400" },
  Python: { bg: "bg-green-500/10", bar: "bg-green-500", text: "text-green-400" },
  Go: { bg: "bg-cyan-500/10", bar: "bg-cyan-500", text: "text-cyan-400" },
  Rust: { bg: "bg-orange-500/10", bar: "bg-orange-500", text: "text-orange-400" },
  Java: { bg: "bg-red-500/10", bar: "bg-red-500", text: "text-red-400" },
  CSS: { bg: "bg-purple-500/10", bar: "bg-purple-500", text: "text-purple-400" },
  HTML: { bg: "bg-pink-500/10", bar: "bg-pink-500", text: "text-pink-400" },
  JSON: { bg: "bg-zinc-500/10", bar: "bg-zinc-500", text: "text-zinc-450" },
  Markdown: { bg: "bg-zinc-650/10", bar: "bg-zinc-600", text: "text-zinc-400" }
};

export default function LanguageBreakdown({ languages, totalLines: customTotalLines, entryPoints }: LanguageBreakdownProps) {
  const calculatedTotalLines = Object.values(languages).reduce((a, b) => a + b, 0);
  const totalLines = customTotalLines || calculatedTotalLines || 1;
  const sortedLanguages = Object.entries(languages).sort((a, b) => b[1] - a[1]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 text-left">
      {/* Language Breakdown Graph */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-zinc-900/60 backdrop-blur-xl rounded-xl p-6 border border-border/60 shadow-sm"
      >
        <h3 className="text-xs font-bold text-primary uppercase tracking-widest mb-4 flex items-center gap-2">
          <Code size={16} />
          Language Breakdown
        </h3>

        <div className="space-y-4">
          {sortedLanguages.map(([language, lines], index) => {
            const percentage = Math.min(100, (lines / totalLines) * 100);
            const colors = languageColors[language] || { bg: "bg-zinc-500/10", bar: "bg-primary", text: "text-primary" };

            return (
              <motion.div
                key={language}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <div className={`w-2.5 h-2.5 rounded-full ${colors.bar}`} />
                    <span className="text-xs text-white font-medium">{language}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-muted-foreground">{lines.toLocaleString()} lines</span>
                    <span className={`font-semibold ${colors.text}`}>{percentage.toFixed(1)}%</span>
                  </div>
                </div>
                <div className="h-1.5 bg-zinc-850 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${percentage}%` }}
                    transition={{ duration: 0.5, delay: index * 0.05 }}
                    className={`h-full rounded-full ${colors.bar}`}
                  />
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Total Lines */}
        <div className="mt-6 pt-4 border-t border-border/50 flex items-center justify-between">
          <span className="text-muted-foreground text-xs font-medium">Total Lines of Code</span>
          <span className="text-lg font-extrabold text-white">{totalLines.toLocaleString()}</span>
        </div>
      </motion.div>

      {/* Core Entrypoints */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-zinc-900/60 backdrop-blur-xl rounded-xl p-6 border border-border/60 shadow-sm"
      >
        <h3 className="text-xs font-bold text-primary uppercase tracking-widest mb-4 flex items-center gap-2">
          <FileCode size={16} />
          Core Entrypoints
        </h3>

        <div className="space-y-3">
          {entryPoints.map((entry, index) => {
            const entryPath = entry.filePath || entry.path || "Unknown";
            return (
              <motion.div
                key={entryPath}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 + index * 0.05 }}
                className="flex items-center justify-between p-3 rounded-lg bg-zinc-800/40 border border-border/40"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                    <TrendingUp size={16} className="text-primary" />
                  </div>
                  <span className="font-mono text-xs text-zinc-300 truncate max-w-xs">{entryPath}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="w-16 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full" style={{ width: `${entry.confidence * 100}%` }} />
                  </div>
                  <span className="text-[10px] text-muted-foreground w-8 text-right font-medium">
                    {Math.round(entry.confidence * 100)}%
                  </span>
                </div>
              </motion.div>
            );
          })}
        </div>

        <p className="mt-4 text-[10px] text-muted-foreground flex items-center gap-1">
          <Percent size={12} className="text-primary" />
          Confidence scores based on AST Analysis & imports classification.
        </p>
      </motion.div>
    </div>
  );
}
