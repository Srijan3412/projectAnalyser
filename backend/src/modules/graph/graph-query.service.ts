import { RepositoryGraph, GraphNode } from "./types.js";

export class GraphQueryService {
  /**
   * Finds all transitive dependents of a file using BFS (files that depend on `file`).
   */
  static findDependents(graph: RepositoryGraph, filePath: string): string[] {
    if (!graph.graphNodes[filePath]) return [];

    const dependents = new Set<string>();
    const queue: string[] = [filePath];
    const visited = new Set<string>([filePath]);

    while (queue.length > 0) {
      const current = queue.shift()!;
      const node = graph.graphNodes[current];
      if (node) {
        for (const parent of node.incoming) {
          if (!visited.has(parent)) {
            visited.add(parent);
            dependents.add(parent);
            queue.push(parent);
          }
        }
      }
    }

    return Array.from(dependents);
  }

  /**
   * Finds all transitive dependencies of a file using BFS (files that `file` depends on).
   */
  static findDependencies(graph: RepositoryGraph, filePath: string): string[] {
    if (!graph.graphNodes[filePath]) return [];

    const dependencies = new Set<string>();
    const queue: string[] = [filePath];
    const visited = new Set<string>([filePath]);

    while (queue.length > 0) {
      const current = queue.shift()!;
      const node = graph.graphNodes[current];
      if (node) {
        for (const child of node.outgoing) {
          if (!visited.has(child)) {
            visited.add(child);
            dependencies.add(child);
            queue.push(child);
          }
        }
      }
    }

    return Array.from(dependencies);
  }

  /**
   * Returns direct incoming dependency references.
   */
  static findIncoming(graph: RepositoryGraph, filePath: string): string[] {
    const node = graph.graphNodes[filePath];
    return node ? [...node.incoming] : [];
  }

  /**
   * Returns direct outgoing dependency references.
   */
  static findOutgoing(graph: RepositoryGraph, filePath: string): string[] {
    const node = graph.graphNodes[filePath];
    return node ? [...node.outgoing] : [];
  }

  /**
   * Finds the shortest dependency path from source to target using BFS.
   */
  static findPath(graph: RepositoryGraph, source: string, target: string): string[] | null {
    if (source === target) return [source];
    if (!graph.graphNodes[source] || !graph.graphNodes[target]) return null;

    const visited = new Set<string>();
    const queue: { current: string; path: string[] }[] = [{ current: source, path: [source] }];

    while (queue.length > 0) {
      const { current, path } = queue.shift()!;
      if (current === target) return path;
      visited.add(current);

      const node = graph.graphNodes[current];
      if (node) {
        for (const child of node.outgoing) {
          if (!visited.has(child)) {
            queue.push({ current: child, path: [...path, child] });
          }
        }
      }
    }

    return null;
  }

  /**
   * Identifies candidate files for dead code (files with zero incoming references).
   */
  static findDeadCodeCandidates(graph: RepositoryGraph): string[] {
    const candidates: string[] = [];
    for (const [path, node] of Object.entries(graph.graphNodes)) {
      if (node.incoming.length === 0) {
        candidates.push(path);
      }
    }
    return candidates;
  }

  /**
   * Detects circular dependency paths in the codebase graph using DFS back-edge detection.
   */
  static findCircularDependencies(graph: RepositoryGraph): string[][] {
    const cycles: string[][] = [];
    const visited = new Set<string>();
    const stack = new Set<string>();
    const parentPath: string[] = [];

    const dfs = (current: string) => {
      visited.add(current);
      stack.add(current);
      parentPath.push(current);

      const node = graph.graphNodes[current];
      if (node) {
        for (const neighbor of node.outgoing) {
          if (stack.has(neighbor)) {
            // Found cycle path! Extract cycle loop
            const cycleStartIdx = parentPath.indexOf(neighbor);
            if (cycleStartIdx !== -1) {
              const cycle = parentPath.slice(cycleStartIdx);
              // Normalize cycle to avoid storing duplicate rotations
              cycles.push([...cycle, neighbor]);
            }
          } else if (!visited.has(neighbor)) {
            dfs(neighbor);
          }
        }
      }

      stack.delete(current);
      parentPath.pop();
    };

    for (const file of Object.keys(graph.graphNodes)) {
      if (!visited.has(file)) {
        dfs(file);
      }
    }

    return cycles;
  }

  /**
   * Returns top most connected files sorted by centrality (importanceScore).
   */
  static getMostConnectedFiles(graph: RepositoryGraph, limit = 10): { path: string; score: number }[] {
    return Object.entries(graph.graphNodes)
      .map(([path, node]) => ({
        path,
        score: node.importanceScore,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }
}
