import { FileNode, DependencyEdge } from "../parser/types.js";
import { GraphNode } from "./types.js";

export class RelationshipEngine {
  /**
   * Computes incoming, outgoing references, degree, transitive closures, and centrality (importanceScore) for each file.
   */
  static computeRelationships(
    files: FileNode[],
    edges: DependencyEdge[]
  ): Record<string, GraphNode> {
    const graphNodes: Record<string, GraphNode> = {};

    // 1. Initialize GraphNode for every file
    for (const file of files) {
      graphNodes[file.path] = {
        file,
        incoming: [],
        outgoing: [],
        allDependents: [],
        allDependencies: [],
        degree: 0,
        importanceScore: 0,
      };
    }

    // 2. Map outgoing and incoming references using dependency edges (creating virtual nodes for external dependencies)
    for (const edge of edges) {
      // Ensure target node exists (even if it's an external library)
      if (!graphNodes[edge.target]) {
        graphNodes[edge.target] = {
          file: {
            id: `external-${edge.target}`,
            path: edge.target,
            extension: "",
            imports: [],
            exports: [],
            dependencies: [],
            internalImports: [],
            externalImports: [],
            referencedBy: [],
            lineCount: 0,
            size: 0,
          },
          incoming: [],
          outgoing: [],
          allDependents: [],
          allDependencies: [],
          degree: 0,
          importanceScore: 0,
        };
      }

      const sourceNode = graphNodes[edge.source];
      const targetNode = graphNodes[edge.target];

      // Add target to source's outgoing list
      if (sourceNode && !sourceNode.outgoing.includes(edge.target)) {
        sourceNode.outgoing.push(edge.target);
      }

      // Add source to target's incoming list
      if (targetNode && !targetNode.incoming.includes(edge.source)) {
        targetNode.incoming.push(edge.source);
      }
    }

    // BFS helper to compute transitive incoming referencers (dependents)
    const getTransitiveIncoming = (start: string): string[] => {
      const visited = new Set<string>();
      const queue: string[] = [start];
      while (queue.length > 0) {
        const curr = queue.shift()!;
        const node = graphNodes[curr];
        if (node) {
          for (const parent of node.incoming) {
            if (!visited.has(parent) && parent !== start) {
              visited.add(parent);
              queue.push(parent);
            }
          }
        }
      }
      return Array.from(visited);
    };

    // BFS helper to compute transitive outgoing dependencies
    const getTransitiveOutgoing = (start: string): string[] => {
      const visited = new Set<string>();
      const queue: string[] = [start];
      while (queue.length > 0) {
        const curr = queue.shift()!;
        const node = graphNodes[curr];
        if (node) {
          for (const child of node.outgoing) {
            if (!visited.has(child) && child !== start) {
              visited.add(child);
              queue.push(child);
            }
          }
        }
      }
      return Array.from(visited);
    };

    // 3. Compute transitive closures, degree and centrality (importanceScore)
    for (const path of Object.keys(graphNodes)) {
      const node = graphNodes[path];
      node.allDependents = getTransitiveIncoming(path);
      node.allDependencies = getTransitiveOutgoing(path);
      node.degree = node.incoming.length + node.outgoing.length;
      node.importanceScore = node.incoming.length + node.outgoing.length;
    }

    return graphNodes;
  }
}
