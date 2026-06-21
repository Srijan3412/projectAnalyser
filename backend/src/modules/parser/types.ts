export interface FileNode {
  id: string;
  path: string;
  extension: string;
  imports: string[];
  exports: string[];
  dependencies: string[];
  internalImports: string[];
  externalImports: string[];
  referencedBy: string[];
  lineCount: number;
  size: number;
}

export interface DependencyEdge {
  source: string;
  target: string;
  type?: "import" | "export" | "dependency";
  external?: boolean;
}

export interface ParseResult {
  imports: string[];
  exports: string[];
}

export interface RepositoryGraph {
  nodes: FileNode[];
  edges: DependencyEdge[];
}
