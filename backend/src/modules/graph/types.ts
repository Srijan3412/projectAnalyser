import { FileNode, DependencyEdge } from "../parser/types.js";

export interface GraphNode {
  file: FileNode;
  incoming: string[]; // Direct referencers
  outgoing: string[]; // Direct dependencies
  allDependents?: string[]; // Transitive referencers
  allDependencies?: string[]; // Transitive dependencies
  degree: number;
  importanceScore: number;
}

export interface GraphMetrics {
  totalNodes: number;
  totalEdges: number;
  isolatedNodes: number;
  cycles: number;
  averageDegree: number;
}

export interface RepositoryGraph {
  nodes: FileNode[];
  edges: DependencyEdge[];
  nodeMap: Record<string, FileNode>;
  graphNodes: Record<string, GraphNode>;
  metrics?: GraphMetrics;
}

export interface DependentsQueryResult {
  file: string;
  dependents: string[];
}

export interface DependenciesQueryResult {
  file: string;
  dependencies: string[];
}

export interface PathQueryResult {
  source: string;
  target: string;
  path: string[] | null;
}

export interface VisualizationNode {
  id: string;
  label: string;
  isExternal?: boolean;
}

export interface VisualizationEdge {
  source: string;
  target: string;
  external?: boolean;
}

export interface VisualizationData {
  nodes: VisualizationNode[];
  edges: VisualizationEdge[];
}

