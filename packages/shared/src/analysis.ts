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

export interface RouteNode {
  method: string;
  path: string;
  file: string;
  framework?: string;
  handler?: string;
  middleware?: string[];
  group?: string;
  version?: string;
  confidence?: number;
  chain?: string[];
}

export interface EnvironmentVariable {
  name: string;
  category: string;
  files: string[];
  usages: number;
  usedBy?: string[];
  criticality?: "HIGH" | "LOW";
}

export interface DatabaseFlow {
  route: string;
  method: string;
  chain: string[];
  database: string;
  entities?: string[];
  operations?: string[];
  transactionChain?: string[];
}

export interface EntityOperation {
  entity: string;
  operations: string[];
}

export interface EntityRelation {
  from: string;
  to: string;
  type: string;
}

export interface DatabaseMetrics {
  entities: number;
  repositories: number;
  queryOperations: number;
  database: string;
}

export interface DatabaseInfo {
  type?: string;
  orm?: string;
  connectionFile?: string;
  entities: EntityOperation[];
  flows: DatabaseFlow[];
  databases?: string[];
  relations?: EntityRelation[];
  repositories?: Record<string, string>;
  metrics?: DatabaseMetrics;
}

export interface DependencyEdge {
  source: string;
  target: string;
  type?: "import" | "export" | "dependency";
  external?: boolean;
}

export interface TreeNode {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: TreeNode[];
  size?: number;
}

export interface FrameworkInfo {
  name: string;
  confidence: number;
}

export interface FrameworkMetadata {
  frameworks: FrameworkInfo[];
  runtime: string;
  packageManager: string;
  language: string;
  monorepo: boolean;
}

export interface EntryPointInfo {
  filePath: string;
  confidence: number;
  reasons: string[];
}

export interface RouteMetrics {
  total: number;
  get: number;
  post: number;
  put: number;
  delete: number;
  patch: number;
  others: number;
}

export interface RepositoryMetadata {
  languages: Record<string, number>;
  primaryLanguage?: string;
  totalLines: number;
  totalSizeMB: number;
  totalFolders: number;
  framework?: FrameworkInfo; // Keep for backward compatibility
  frameworkMetadata?: FrameworkMetadata;
  hasDocker?: boolean;
  entryPoint?: string;
  entryPoints?: EntryPointInfo[];
  routeMetrics?: RouteMetrics;
  databaseInfo?: DatabaseInfo;
  missingEnvVars?: string[];
}

export interface AnalysisOverview {
  totalFiles: number;
  totalRoutes: number;
  totalDependencies: number;
  totalEnvVars: number;
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
  metrics?: GraphMetrics;
}

export interface ArchitectureNode {
  id: string;
  label: string;
  type: "route" | "controller" | "service" | "repository" | "database" | "file";
  file?: string;
  layer: string;
}

export interface ReactFlowEdge {
  id: string;
  source: string;
  target: string;
  animated?: boolean;
}

export interface ReactFlowGraph {
  nodes: ArchitectureNode[];
  edges: ReactFlowEdge[];
}

export interface ArchitectureMetadata {
  layers: string[];
  graph: ReactFlowGraph;
}

// ─── Phase 11: AI Architect Summary ─────────────────────────────────────────

export interface AiArchitectSummary {
  purpose: string;
  stack: {
    framework: string;
    language: string;
    runtime: string;
    database: string;
    orm: string;
    authentication: string;
    packageManager: string;
  };
  lifecycle: string[];          // e.g. ["Route", "Controller", "Service", "Repository", "Database"]
  authentication: string;       // e.g. "JWT tokens validated via middleware on protected routes."
  database: string;             // e.g. "PostgreSQL managed via Prisma ORM with 5 entities."
  keyModules: { file: string; role: string; importance: number }[];
  markdownSummary: string;      // Full AI-generated markdown document
}

// ─── Phase 12: Developer Onboarding Guide ────────────────────────────────────

export type LearningStepCategory =
  | "bootstrap"
  | "routing"
  | "auth"
  | "service"
  | "repository"
  | "database"
  | "config"
  | "other";

export interface LearningStep {
  order: number;
  file: string;
  label: string;
  reason: string;
  category: LearningStepCategory;
  importanceScore: number;
}

export interface OnboardingGuide {
  learningPath: LearningStep[];
  criticalFiles: { file: string; role: string; importanceScore: number }[];
  envSetup: { name: string; criticality: "HIGH" | "LOW"; description: string }[];
  architectureTour: string[];   // Ordered file paths forming the primary request lifecycle
  summary: string;              // Short paragraph describing what to do on day 1
}

// ─── Repository Health ────────────────────────────────────────────────────────

export interface GraphIssue {
  type: "broken_edge" | "duplicate_edge" | "self_loop" | "missing_node";
  severity: "error" | "warning";
  description: string;
}

// ─── Phase 13: Static Analysis ───────────────────────────────────────────────

export interface DeadCodeResult {
  file: string;
  confidence: number;     // 0-100
  reason: string;         // "zero incoming references"
}

export interface UnusedExportResult {
  file: string;
  export: string;
  type: "function" | "class" | "const" | "interface" | "unknown";
}

export interface CycleResult {
  cycle: string[];        // e.g. ["a.ts","b.ts","c.ts","a.ts"]
  length: number;
}

export interface LargeFileResult {
  file: string;
  lines: number;
  severity: "warning" | "danger"; // warning=500+, danger=1000+
}

export interface GodServiceResult {
  file: string;
  exportedFunctions: number;
  lines: number;
  reason: string;
  methods?: number;
}

export interface ComplexityResult {
  file: string;
  score: number;          // Estimated cyclomatic complexity
  rating: "good" | "medium" | "risky";
  hotspots: string[];     // top complex function names if detected
}

export interface StaticAnalysisReport {
  healthScore: number;    // 0-100 aggregate
  deadCode: DeadCodeResult[];
  unusedExports: UnusedExportResult[];
  cycles: CycleResult[];
  largeFiles: LargeFileResult[];
  godServices: GodServiceResult[];
  complexity: ComplexityResult[];
  summary: {
    totalIssues: number;
    criticalIssues: number;
    recommendations: string[];
  };
}

// ─── Phase 14: Impact Analysis ───────────────────────────────────────────────

export interface ImpactAnalysis {
  targetFile: string;
  directDependents: string[];
  transitiveDependents: string[];
  totalAffectedFiles: number;
  impactScore: number;    // 0-100, based on % of codebase affected
  criticalPaths: string[][];
}

// ─── Core AnalysisResult ─────────────────────────────────────────────────────

export interface AnalysisResult {
  overview: AnalysisOverview;
  metadata?: RepositoryMetadata;
  tree?: TreeNode;
  files: FileNode[];
  routes: RouteNode[];
  envVars: EnvironmentVariable[];
  dependencies: DependencyEdge[];
  graph?: RepositoryGraph;
  frameworks?: FrameworkInfo[];
  architecture?: ArchitectureMetadata;
  aiSummary?: AiArchitectSummary;
  onboarding?: OnboardingGuide;
  graphIssues?: GraphIssue[];
  staticAnalysis?: StaticAnalysisReport;
  traces?: ExecutionTrace[];
  features?: FeatureFlow[];
  subway?: RepositorySubway;
}

// ─── Phase 14: Branch/Job Comparison (Architecture Diff) ─────────────────────

export interface RouteDiff {
  method: string;
  path: string;
  status: "added" | "removed" | "modified";
  details?: string;
}

export interface FileDiff {
  path: string;
  status: "added" | "removed" | "modified";
  linesDiff: number;
  sizeDiff: number;
}

export interface DependencyDiff {
  source: string;
  target: string;
  status: "added" | "removed";
}

export interface ArchitectureDiff {
  routes: RouteDiff[];
  files: FileDiff[];
  dependencies: DependencyDiff[];
  summary: {
    addedRoutesCount: number;
    removedRoutesCount: number;
    modifiedRoutesCount: number;
    addedFilesCount: number;
    removedFilesCount: number;
    modifiedFilesCount: number;
  };
}

export interface TraceStep {
  name: string;
  type: "controller" | "service" | "helper" | "repository" | "database" | "middleware";
  filePath?: string;
}

export interface ExecutionTrace {
  route: string;
  method: string;
  steps: TraceStep[];
  confidence: number;
  reachability: boolean;
  metrics: {
    complexity: number;
    layers: number;
    dbCalls: number;
    middleware: number;
    envVars: number;
  };
  envVars: string[];
  authType?: string;
}

export interface FeatureMetrics {
  routes: number;
  services: number;
  repositories: number;
  tables: number;
  complexity: number;
}

export interface FeatureFlow {
  id: string;
  name: string;
  color: string;
  routes: string[];
  files: string[];
  database?: string[];
  auth: boolean;
  confidence: number;
  health: number;
  metrics: FeatureMetrics;
  dependencies: string[];
}

export interface SubwayStation {
  id: string;
  file: string;
  features: string[];
  type: string;
}

export interface SubwayLine {
  feature: string;
  stations: string[];
  color: string;
}

export interface RepositorySubway {
  stations: SubwayStation[];
  lines: SubwayLine[];
  transfers: string[];
}
