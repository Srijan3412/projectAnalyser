import { RepositoryGraph } from "./types.js";

export interface ValidationIssue {
  type: "broken_edge" | "duplicate_edge" | "self_loop" | "missing_node";
  severity: "error" | "warning";
  description: string;
  details: any;
}

export class GraphValidatorService {
  /**
   * Performs an integrity check on the constructed dependency graph.
   * Scans for self-loops, duplicate dependency edges, broken links, and missing files.
   */
  static validateGraph(graph: RepositoryGraph): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const edgeSet = new Set<string>();

    // 1. Validate Nodes
    const paths = new Set<string>(graph.nodes.map((n) => n.path));

    // 2. Validate Edges
    for (const edge of graph.edges) {
      const edgeKey = `${edge.source}->${edge.target}`;

      // Check self-loop
      if (edge.source === edge.target) {
        issues.push({
          type: "self_loop",
          severity: "warning",
          description: `Self-referential import loop found in file: ${edge.source}`,
          details: { file: edge.source },
        });
      }

      // Check duplicate edge
      if (edgeSet.has(edgeKey)) {
        issues.push({
          type: "duplicate_edge",
          severity: "warning",
          description: `Duplicate dependency link found: ${edge.source} -> ${edge.target}`,
          details: { source: edge.source, target: edge.target },
        });
      }
      edgeSet.add(edgeKey);

      // Check broken internal edge (where the target file is internal but missing from scanned files)
      const isExternal = edge.external || false;
      if (!isExternal) {
        const targetExists = paths.has(edge.target);
        if (!targetExists) {
          issues.push({
            type: "broken_edge",
            severity: "error",
            description: `Broken import link: ${edge.source} imports ${edge.target}, but this file does not exist in the scanned workspace.`,
            details: { source: edge.source, target: edge.target },
          });
        }
      }
    }

    return issues;
  }
}
