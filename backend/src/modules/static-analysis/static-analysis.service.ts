import path from "path";
import fs from "fs/promises";
import { FileNode } from "@shared/types";
import { RepositoryGraph } from "../graph/types.js";
import { GraphQueryService } from "../graph/graph-query.service.js";
import {
  StaticAnalysisReport,
  DeadCodeResult,
  UnusedExportResult,
  CycleResult,
  LargeFileResult,
  GodServiceResult,
  ComplexityResult,
} from "@shared/types";
import { logger } from "../../core/logger/index.js";

// ─── Entry-point heuristics ───────────────────────────────────────────────────
const ENTRY_PATTERNS = /^(index|main|server|app|entry|start)\.(ts|tsx|js|jsx)$/i;
const CONFIG_PATTERNS = /\.(config|env|test|spec)\.(ts|tsx|js|jsx)$|^jest\.|^eslint\.|^prettier\.|^babel\./i;
const SPECIAL_PREFIXES = /^(ROUTE:|ENV:|DB:|ENTITY:)/;

// ─── Dead Code Analyzer ───────────────────────────────────────────────────────

export class DeadCodeAnalyzer {
  static analyze(files: FileNode[], graph: RepositoryGraph, entryPoints: string[] = []): DeadCodeResult[] {
    const results: DeadCodeResult[] = [];
    const entrySet = new Set(entryPoints.map(p => path.basename(p)));

    for (const file of files) {
      if (SPECIAL_PREFIXES.test(file.path)) continue;
      if (CONFIG_PATTERNS.test(path.basename(file.path))) continue;
      if (ENTRY_PATTERNS.test(path.basename(file.path))) continue;
      if (entrySet.has(path.basename(file.path))) continue;

      const graphNode = graph.graphNodes[file.path];
      if (!graphNode) continue;

      const incoming = graphNode.incoming.filter(i => !SPECIAL_PREFIXES.test(i));
      if (incoming.length === 0) {
        // Confidence based on file characteristics
        let confidence = 80;
        if (file.exports && file.exports.length > 0) confidence = 70; // has exports but nothing uses it
        if ((file.lineCount ?? 0) < 10) confidence = 60; // tiny file, maybe intentional

        results.push({
          file: file.path,
          confidence,
          reason: "Zero incoming references from non-special nodes",
        });
      }
    }

    return results.sort((a, b) => b.confidence - a.confidence);
  }
}

// ─── Unused Exports Analyzer ──────────────────────────────────────────────────

export class UnusedExportAnalyzer {
  static analyze(files: FileNode[]): UnusedExportResult[] {
    const results: UnusedExportResult[] = [];

    // Build global import registry: what each file imports
    const allImportedNames = new Set<string>();
    for (const file of files) {
      for (const imp of (file.imports ?? [])) {
        allImportedNames.add(imp);
      }
    }

    for (const file of files) {
      if (SPECIAL_PREFIXES.test(file.path)) continue;

      for (const exp of (file.exports ?? [])) {
        if (!exp || exp.trim() === "") continue;
        // Skip default exports and re-exports
        if (exp === "default" || exp.startsWith("*")) continue;

        if (!allImportedNames.has(exp)) {
          let type: UnusedExportResult["type"] = "unknown";
          if (/^[A-Z]/.test(exp)) type = "class";
          else if (/^(I|Type)[A-Z]/.test(exp)) type = "interface";
          else if (/^(use|get|set|create|build|make|handle|process)/i.test(exp)) type = "function";
          else type = "const";

          results.push({ file: file.path, export: exp, type });
        }
      }
    }

    return results;
  }
}

// ─── Cycle Detector ───────────────────────────────────────────────────────────

export class CycleDetector {
  static detect(graph: RepositoryGraph): CycleResult[] {
    const rawCycles = GraphQueryService.findCircularDependencies(graph);

    return rawCycles
      .filter(cycle => cycle.length > 0)
      .map(cycle => ({
        cycle: cycle.map(f => path.basename(f)),
        length: cycle.length,
      }))
      .slice(0, 20); // Cap at 20 for readability
  }
}

// ─── Large File Detector ──────────────────────────────────────────────────────

export class LargeFileDetector {
  static detect(files: FileNode[]): LargeFileResult[] {
    const results: LargeFileResult[] = [];

    for (const file of files) {
      if (SPECIAL_PREFIXES.test(file.path)) continue;
      const lines = file.lineCount ?? 0;
      if (lines >= 1000) {
        results.push({ file: file.path, lines, severity: "danger" });
      } else if (lines >= 500) {
        results.push({ file: file.path, lines, severity: "warning" });
      }
    }

    return results.sort((a, b) => b.lines - a.lines);
  }
}

// ─── God Service Detector ─────────────────────────────────────────────────────

export class GodServiceDetector {
  static async detect(files: FileNode[], repoPath: string): Promise<GodServiceResult[]> {
    const results: GodServiceResult[] = [];
    const GOD_EXPORT_THRESHOLD = 15;
    const GOD_LINE_THRESHOLD = 800;
    const GOD_METHOD_THRESHOLD = 12;
    const TARGET_EXTS = new Set([".ts", ".tsx", ".js", ".jsx"]);

    for (const file of files) {
      if (SPECIAL_PREFIXES.test(file.path)) continue;

      const exportCount = (file.exports ?? []).filter(e => e && e !== "default").length;
      const lines = file.lineCount ?? 0;
      let methodCount = 0;

      const ext = path.extname(file.path).toLowerCase();
      if (TARGET_EXTS.has(ext)) {
        try {
          const fullPath = path.isAbsolute(file.path)
            ? file.path
            : path.join(repoPath, file.path);
          const content = await fs.readFile(fullPath, "utf8");

          // Estimate class methods + standalone functions using branch and declaration checks
          const methodMatches = [...content.matchAll(/\b(async\s+)?(get\s+|set\s+)?(\w+)\s*\([^)]*\)\s*:\s*\w+|\bfunction\s+(\w+)\s*\(|\([^)]*\)\s*=>/g)];
          methodCount = methodMatches.length;
        } catch {
          // ignore read failure
        }
      }

      const isGod = exportCount >= GOD_EXPORT_THRESHOLD || lines >= GOD_LINE_THRESHOLD || methodCount >= GOD_METHOD_THRESHOLD;
      if (!isGod) continue;

      const reasons: string[] = [];
      if (exportCount >= GOD_EXPORT_THRESHOLD) reasons.push(`${exportCount} exported functions/classes`);
      if (lines >= GOD_LINE_THRESHOLD) reasons.push(`${lines} lines of code`);
      if (methodCount >= GOD_METHOD_THRESHOLD) reasons.push(`${methodCount} internal methods/functions`);

      results.push({
        file: file.path,
        exportedFunctions: exportCount,
        lines,
        methods: methodCount,
        reason: reasons.join("; "),
      });
    }

    return results.sort((a, b) => b.exportedFunctions - a.exportedFunctions);
  }
}

// ─── Complexity Analyzer ──────────────────────────────────────────────────────

export class ComplexityAnalyzer {
  /**
   * Estimates cyclomatic complexity from source code using branch-counting heuristics.
   * Real McCabe complexity requires full AST; this gives a good-enough approximation.
   */
  static async analyze(files: FileNode[], repoPath: string): Promise<ComplexityResult[]> {
    const results: ComplexityResult[] = [];
    const TARGET_EXTS = new Set([".ts", ".tsx", ".js", ".jsx"]);
    const BRANCH_PATTERN = /\b(if|else if|for|while|do|switch|case|catch|\?\?|&&|\|\||\?\.)\b/g;
    const FN_PATTERN = /(?:function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?(?:function|\([^)]*\)\s*=>|\w+\s*=>))/g;

    const RISKY_THRESHOLD = 10;
    const MEDIUM_THRESHOLD = 5;

    for (const file of files) {
      if (SPECIAL_PREFIXES.test(file.path)) continue;
      const ext = path.extname(file.path);
      if (!TARGET_EXTS.has(ext)) continue;

      try {
        const fullPath = path.isAbsolute(file.path)
          ? file.path
          : path.join(repoPath, file.path);
        const content = await fs.readFile(fullPath, "utf8");

        // Count branch points (+1 baseline)
        const branches = [...content.matchAll(BRANCH_PATTERN)].length;
        const score = 1 + branches;

        // Find function names (hotspots)
        const hotspots: string[] = [];
        let fnMatch: RegExpExecArray | null;
        FN_PATTERN.lastIndex = 0;
        while ((fnMatch = FN_PATTERN.exec(content)) !== null && hotspots.length < 5) {
          const name = fnMatch[1] || fnMatch[2];
          if (name && !hotspots.includes(name)) hotspots.push(name);
        }

        let rating: ComplexityResult["rating"] = "good";
        if (score >= RISKY_THRESHOLD) rating = "risky";
        else if (score >= MEDIUM_THRESHOLD) rating = "medium";

        if (rating !== "good") {
          results.push({ file: file.path, score, rating, hotspots });
        }
      } catch {
        // skip unreadable files
      }
    }

    return results.sort((a, b) => b.score - a.score).slice(0, 30);
  }
}

// ─── Health Scorer ────────────────────────────────────────────────────────────

export class HealthScorer {
  static compute(
    deadCode: DeadCodeResult[],
    cycles: CycleResult[],
    largeFiles: LargeFileResult[],
    godServices: GodServiceResult[],
    complexity: ComplexityResult[],
    graphIssues: { type: string; severity: string }[] = [],
    totalFiles: number = 1
  ): { score: number; recommendations: string[] } {
    let score = 100;
    const recommendations: string[] = [];

    // Dead code: -2 per file, max -20
    const deadPenalty = Math.min(20, deadCode.length * 2);
    score -= deadPenalty;
    if (deadCode.length > 0) recommendations.push(`Remove ${deadCode.length} unreferenced file${deadCode.length > 1 ? "s" : ""} to reduce bundle size`);

    // Cycles: -4 per cycle, max -24
    const cyclePenalty = Math.min(24, cycles.length * 4);
    score -= cyclePenalty;
    if (cycles.length > 0) recommendations.push(`Break ${cycles.length} circular dependency chain${cycles.length > 1 ? "s" : ""} using dependency injection`);

    // Large files: -2 per danger, -1 per warning, max -15
    const largePenalty = Math.min(15,
      largeFiles.filter(f => f.severity === "danger").length * 2 +
      largeFiles.filter(f => f.severity === "warning").length
    );
    score -= largePenalty;
    if (largeFiles.length > 0) recommendations.push(`Split ${largeFiles.length} oversized file${largeFiles.length > 1 ? "s" : ""} into focused modules`);

    // God services: -5 per file, max -15
    const godPenalty = Math.min(15, godServices.length * 5);
    score -= godPenalty;
    if (godServices.length > 0) recommendations.push(`Decompose ${godServices.length} god service${godServices.length > 1 ? "s" : ""} into smaller, single-responsibility classes`);

    // Risky complexity: -2 per file, max -10
    const riskyFiles = complexity.filter(c => c.rating === "risky");
    const complexPenalty = Math.min(10, riskyFiles.length * 2);
    score -= complexPenalty;
    if (riskyFiles.length > 0) recommendations.push(`Reduce complexity in ${riskyFiles.length} high-complexity file${riskyFiles.length > 1 ? "s" : ""}`);

    // Broken imports: -3 per error, max -12
    const brokenImports = graphIssues.filter(i => i.type === "broken_edge" && i.severity === "error").length;
    const brokenPenalty = Math.min(12, brokenImports * 3);
    score -= brokenPenalty;
    if (brokenImports > 0) recommendations.push(`Fix ${brokenImports} broken import${brokenImports > 1 ? "s" : ""}`);

    if (recommendations.length === 0) {
      recommendations.push("Repository is well-structured. Keep maintaining clean architecture principles.");
    }

    return { score: Math.max(0, Math.round(score)), recommendations };
  }
}

// ─── Main Orchestrator ────────────────────────────────────────────────────────

export class StaticAnalysisService {
  static async analyze(
    files: FileNode[],
    graph: RepositoryGraph,
    repoPath: string,
    entryPoints: string[] = [],
    graphIssues: { type: string; severity: string }[] = []
  ): Promise<StaticAnalysisReport> {
    logger.info("🔬 [Phase 13] Running Static Analysis Engine...");

    const realFiles = files.filter(f => !SPECIAL_PREFIXES.test(f.path));

    const [deadCode, unusedExports, cycles, largeFiles, godServices, complexity] = await Promise.all([
      Promise.resolve(DeadCodeAnalyzer.analyze(files, graph, entryPoints)),
      Promise.resolve(UnusedExportAnalyzer.analyze(files)),
      Promise.resolve(CycleDetector.detect(graph)),
      Promise.resolve(LargeFileDetector.detect(files)),
      GodServiceDetector.detect(files, repoPath),
      ComplexityAnalyzer.analyze(files, repoPath),
    ]);

    const { score, recommendations } = HealthScorer.compute(
      deadCode, cycles, largeFiles, godServices, complexity, graphIssues, realFiles.length
    );

    const criticalIssues =
      cycles.length +
      godServices.length +
      largeFiles.filter(f => f.severity === "danger").length +
      graphIssues.filter(i => i.severity === "error").length;

    logger.info({ score, deadCode: deadCode.length, cycles: cycles.length, largeFiles: largeFiles.length }, "✅ [Phase 13] Static Analysis complete");

    return {
      healthScore: score,
      deadCode: deadCode.slice(0, 50),
      unusedExports: unusedExports.slice(0, 50),
      cycles: cycles.slice(0, 20),
      largeFiles: largeFiles.slice(0, 30),
      godServices: godServices.slice(0, 20),
      complexity: complexity.slice(0, 30),
      summary: {
        totalIssues: deadCode.length + cycles.length + largeFiles.length + godServices.length,
        criticalIssues,
        recommendations,
      },
    };
  }
}
