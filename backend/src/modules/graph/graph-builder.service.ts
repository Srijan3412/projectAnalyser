import { FileNode, DependencyEdge } from "../parser/types.js";
import { RepositoryGraph, VisualizationData } from "./types.js";
import { RelationshipEngine } from "./relationship-engine.js";
import { GraphQueryService } from "./graph-query.service.js";

export class GraphBuilderService {
  /**
   * Translates parsing results (FileNodes and DependencyEdges) into a queryable RepositoryGraph.
   */
  static buildGraph(files: FileNode[], edges: DependencyEdge[]): RepositoryGraph {
    const nodeMap: Record<string, FileNode> = {};
    for (const file of files) {
      nodeMap[file.path] = file;
    }

    const graphNodes = RelationshipEngine.computeRelationships(files, edges);

    // Calculate metrics
    const totalNodes = Object.keys(graphNodes).length;
    const totalEdges = edges.length;
    let isolatedNodes = 0;
    let degreeSum = 0;

    for (const node of Object.values(graphNodes)) {
      if (node.degree === 0) {
        isolatedNodes++;
      }
      degreeSum += node.degree;
    }

    const averageDegree = totalNodes > 0 ? parseFloat((degreeSum / totalNodes).toFixed(2)) : 0;

    // Use GraphQueryService to find cycles
    const cyclesList = GraphQueryService.findCircularDependencies({
      nodes: files,
      edges,
      nodeMap,
      graphNodes,
    });
    const cycles = cyclesList.length;

    const metrics = {
      totalNodes,
      totalEdges,
      isolatedNodes,
      cycles,
      averageDegree,
    };

    return {
      nodes: files,
      edges,
      nodeMap,
      graphNodes,
      metrics,
    };
  }

  /**
   * Converts the RepositoryGraph into a simplified nodes/edges structure suitable for frontend visualizations (ReactFlow).
   */
  static toVisualization(graph: RepositoryGraph): VisualizationData {
    const nodes = Object.values(graph.graphNodes).map((n) => ({
      id: n.file.path,
      label: n.file.path,
      isExternal: n.file.id.startsWith("external-"),
    }));

    const edges = graph.edges.map((e) => ({
      source: e.source,
      target: e.target,
      external: e.external || false,
    }));

    return { nodes, edges };
  }
}
