import { FileNode, DependencyEdge, RouteNode, AnalysisResult } from "@shared/types";
import { ArchitectureMetadata, ArchitectureNode, ReactFlowEdge } from "@shared/types";
import path from "path";
import { logger } from "../../core/logger/index.js";

export class ArchitectureGeneratorService {
  /**
   * Generates hierarchical architecture layers and a React Flow visual graph structure.
   */
  static generate(
    files: FileNode[],
    edges: DependencyEdge[],
    routes: RouteNode[],
    dbDiscovery: any
  ): ArchitectureMetadata {
    logger.info("Generating Architecture layers and React Flow visualization data");

    const layers = ["Routes", "Controllers", "Services", "Repositories", "Database"];
    const flowNodes: ArchitectureNode[] = [];
    const flowEdges: ReactFlowEdge[] = [];
    const seenEdges = new Set<string>();

    const entityNames = dbDiscovery?.entities?.map((e: any) => e.entity) || [];
    const repositoriesMap = dbDiscovery?.repositories || {};

    // 1. Map Route Nodes to the "Routes" layer
    for (const route of routes) {
      const routeNodeId = `ROUTE:${route.method}:${route.path}`;
      flowNodes.push({
        id: routeNodeId,
        label: `${route.method} ${route.path}`,
        type: "route",
        file: route.file,
        layer: "Routes",
      });
    }

    // 2. Map Database Nodes to the "Database" layer
    const dbType = dbDiscovery?.type || "Database";
    const dbNodeId = `DB:${dbType}`;
    flowNodes.push({
      id: dbNodeId,
      label: dbType,
      type: "database",
      layer: "Database",
    });

    for (const ent of entityNames) {
      const entityNodeId = `ENTITY:${ent}`;
      flowNodes.push({
        id: entityNodeId,
        label: `${ent} Table`,
        type: "database",
        layer: "Database",
      });
      // Edge from Entity to Database
      const edgeId = `${entityNodeId}->${dbNodeId}`;
      if (!seenEdges.has(edgeId)) {
        seenEdges.add(edgeId);
        flowEdges.push({
          id: edgeId,
          source: entityNodeId,
          target: dbNodeId,
          animated: true,
        });
      }
    }

    // 3. Classify and map file nodes to Layers
    for (const file of files) {
      // Skip special nodes
      if (file.path.startsWith("ROUTE:") || file.path.startsWith("ENV:") || file.path.startsWith("DB:") || file.path.startsWith("ENTITY:")) {
        continue;
      }

      const basename = path.basename(file.path).toLowerCase();
      const relativePath = file.path.replace(/\\/g, "/");

      let layer = "Services"; // default
      let type: "controller" | "service" | "repository" | "file" = "file";

      if (basename.includes("controller") || basename.includes("handler") || basename.includes("resolver") || relativePath.includes("/controllers/") || relativePath.includes("/handlers/")) {
        layer = "Controllers";
        type = "controller";
      } else if (basename.includes("service") || basename.includes("logic") || basename.includes("manager") || relativePath.includes("/services/")) {
        layer = "Services";
        type = "service";
      } else if (basename.includes("repository") || basename.includes("repo") || basename.includes("model") || basename.includes("schema") || relativePath.includes("/repositories/") || relativePath.includes("/models/")) {
        layer = "Repositories";
        type = "repository";
      }

      flowNodes.push({
        id: file.path,
        label: path.basename(file.path, path.extname(file.path)),
        type,
        file: file.path,
        layer,
      });
    }

    // 4. Trace and build React Flow Edges
    for (const edge of edges) {
      // Skip environment variable edges in main architecture flow
      if (edge.source.startsWith("ENV:") || edge.target.startsWith("ENV:")) {
        continue;
      }

      // Check if source and target exist in our visual nodes
      const sourceNode = flowNodes.find((n) => n.id === edge.source);
      const targetNode = flowNodes.find((n) => n.id === edge.target);

      if (sourceNode && targetNode) {
        const edgeId = `${edge.source}->${edge.target}`;
        if (!seenEdges.has(edgeId)) {
          seenEdges.add(edgeId);
          flowEdges.push({
            id: edgeId,
            source: edge.source,
            target: edge.target,
            animated: sourceNode.layer !== targetNode.layer, // animate cross-layer flows
          });
        }
      }
    }

    // Connect repositories to entity tables if not already connected
    for (const node of flowNodes) {
      if (node.type === "repository") {
        const repoName = node.label;
        const mappedEntity = repositoriesMap[repoName];
        if (mappedEntity) {
          const entityNodeId = `ENTITY:${mappedEntity}`;
          const hasEntityNode = flowNodes.some(n => n.id === entityNodeId);
          if (hasEntityNode) {
            const edgeId = `${node.id}->${entityNodeId}`;
            if (!seenEdges.has(edgeId)) {
              seenEdges.add(edgeId);
              flowEdges.push({
                id: edgeId,
                source: node.id,
                target: entityNodeId,
                animated: true,
              });
            }
          }
        }
      }
    }

    return {
      layers,
      graph: {
        nodes: flowNodes,
        edges: flowEdges,
      },
    };
  }
}
