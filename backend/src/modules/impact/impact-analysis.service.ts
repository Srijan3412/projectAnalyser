import path from "path";
import { RepositoryGraph } from "../graph/types.js";
import { GraphQueryService } from "../graph/graph-query.service.js";
import { ImpactAnalysis } from "@shared/types";
import { logger } from "../../core/logger/index.js";

const SPECIAL_PREFIXES = /^(ROUTE:|ENV:|DB:|ENTITY:)/;

export class ImpactAnalysisService {
  /**
   * Computes the full impact profile for a given file:
   *  - Direct dependents (files that directly import it)
   *  - All transitive dependents (full reverse BFS)
   *  - Impact score (% of real codebase affected)
   *  - Critical paths (shortest paths from each direct dependent to root)
   */
  static analyze(
    targetFile: string,
    graph: RepositoryGraph,
    totalRealFiles: number
  ): ImpactAnalysis {
    logger.info({ targetFile }, "📡 [Phase 14] Running Impact Analysis...");

    // Normalize the target path
    const normalizedTarget = targetFile.replace(/\\/g, "/");
    const graphKey = Object.keys(graph.graphNodes).find(k =>
      k === normalizedTarget || k.endsWith("/" + normalizedTarget) || path.basename(k) === path.basename(normalizedTarget)
    );

    if (!graphKey) {
      return {
        targetFile,
        directDependents: [],
        transitiveDependents: [],
        totalAffectedFiles: 0,
        impactScore: 0,
        criticalPaths: [],
      };
    }

    // Direct dependents (depth 1)
    const directDependents = GraphQueryService.findIncoming(graph, graphKey)
      .filter(f => !SPECIAL_PREFIXES.test(f));

    // All transitive dependents (full BFS up)
    const allDependents = GraphQueryService.findDependents(graph, graphKey)
      .filter(f => !SPECIAL_PREFIXES.test(f));

    // Separate direct vs transitive
    const directSet = new Set(directDependents);
    const transitiveDependents = allDependents.filter(f => !directSet.has(f));

    // Impact score = (total affected / total real files) * 100
    const impactScore = totalRealFiles > 0
      ? Math.min(100, Math.round((allDependents.length / totalRealFiles) * 100))
      : 0;

    // Critical paths: find the 5 most "important" dependents' paths back to this file
    // We do this by picking the highest-degree dependents and tracing paths
    const criticalPaths: string[][] = [];
    const topDependents = directDependents
      .map(dep => ({
        dep,
        degree: graph.graphNodes[dep]?.incoming.length ?? 0,
      }))
      .sort((a, b) => b.degree - a.degree)
      .slice(0, 5)
      .map(d => d.dep);

    for (const dep of topDependents) {
      const pathResult = GraphQueryService.findPath(graph, dep, graphKey);
      if (pathResult) {
        criticalPaths.push(pathResult.map(p => path.basename(p)));
      }
    }

    logger.info({
      targetFile,
      direct: directDependents.length,
      transitive: transitiveDependents.length,
      impactScore,
    }, "✅ Impact analysis complete");

    return {
      targetFile,
      directDependents: directDependents.map(f => path.basename(f)),
      transitiveDependents: transitiveDependents.map(f => path.basename(f)).slice(0, 50),
      totalAffectedFiles: allDependents.length,
      impactScore,
      criticalPaths,
    };
  }

  /**
   * Computes the Repository Timeline — files ranked by importance score.
   * This is the "Most Important Files" feature from Phase 14.
   */
  static getRepositoryTimeline(
    graph: RepositoryGraph,
    limit = 20
  ): { file: string; importanceScore: number; directDependents: number; transitiveDependents: number }[] {
    return Object.entries(graph.graphNodes)
      .filter(([k]) => !SPECIAL_PREFIXES.test(k))
      .map(([filePath, node]) => ({
        file: path.basename(filePath),
        fullPath: filePath,
        importanceScore: node.importanceScore,
        directDependents: node.incoming.filter(f => !SPECIAL_PREFIXES.test(f)).length,
        transitiveDependents: 0, // computed lazily in UI
      }))
      .sort((a, b) => b.importanceScore - a.importanceScore)
      .slice(0, limit);
  }
}
