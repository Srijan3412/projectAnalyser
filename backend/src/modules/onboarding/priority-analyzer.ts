/**
 * Phase 12 — Onboarding Engine: Priority Analyzer
 *
 * Ranks files by how critical they are for understanding the codebase.
 * Uses: referencedBy count (graph centrality), filename patterns, and category weights.
 */
import path from "path";
import { AnalysisResult } from "@shared/types";
import { RankedFile, FileCategory } from "./types.js";

// Category weights — higher = more important for a new dev to read
const CATEGORY_WEIGHT: Record<FileCategory, number> = {
  bootstrap:  50,
  routing:    40,
  auth:       45,
  service:    35,
  repository: 30,
  database:   35,
  config:     25,
  other:       5,
};

function classifyFile(filename: string): FileCategory {
  const f = filename.toLowerCase();
  if (/server|app|main|index|bootstrap/.test(f)) return "bootstrap";
  if (/route|router/.test(f)) return "routing";
  if (/auth|login|token|session|jwt|passport/.test(f)) return "auth";
  if (/service/.test(f)) return "service";
  if (/repository|repo/.test(f)) return "repository";
  if (/database|db|prisma|migration|schema/.test(f)) return "database";
  if (/config|env|setting|constant/.test(f)) return "config";
  return "other";
}

export class PriorityAnalyzer {
  /**
   * Rank all files in the repository by their importance for onboarding.
   * Returns top N ranked files.
   */
  static rank(result: AnalysisResult, topN = 15): RankedFile[] {
    const entryPath = result.metadata?.entryPoints?.[0]?.filePath || result.metadata?.entryPoint;

    const ranked: RankedFile[] = result.files
      .filter((f) => !f.path.includes("node_modules") && !f.path.includes(".d.ts"))
      .map((f) => {
        const filename = path.basename(f.path);
        const category = classifyFile(filename);
        const referencedBy = f.referencedBy?.length || 0;

        // Score = graph centrality (referencedBy × 5, capped at 50) + category weight (0–50)
        const centralityScore = Math.min(50, referencedBy * 5);
        const categoryScore = CATEGORY_WEIGHT[category];
        // Bonus for entry point
        const entryBonus = entryPath && f.path.includes(entryPath) ? 20 : 0;

        const importanceScore = Math.min(100, centralityScore + categoryScore + entryBonus);

        return {
          file: filename,
          fullPath: f.path,
          category,
          importanceScore,
          referencedBy,
        };
      });

    // Sort descending by importance score, then alphabetically
    ranked.sort((a, b) => b.importanceScore - a.importanceScore || a.file.localeCompare(b.file));

    // Always ensure the entry point is first
    if (entryPath) {
      const entryFile = path.basename(entryPath);
      const entryIdx = ranked.findIndex((r) => r.file === entryFile || r.fullPath.includes(entryPath));
      if (entryIdx > 0) {
        const [entry] = ranked.splice(entryIdx, 1);
        ranked.unshift(entry);
      }
    }

    return ranked.slice(0, topN);
  }
}
