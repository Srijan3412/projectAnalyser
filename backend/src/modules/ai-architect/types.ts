/**
 * Phase 11 — AI Architect
 * Internal types for context building, prompting, and summary generation.
 * The AI receives ONLY structured metadata — never raw source code.
 */

export interface RepositoryContext {
  framework: string;
  language: string;
  runtime: string;
  packageManager: string;
  entryPoint: string;
  totalFiles: number;
  totalRoutes: number;
  database: string;
  orm: string;
  authentication: string;
  entities: string[];
  topEnvVars: { name: string; criticality: "HIGH" | "LOW" }[];
}

export interface ArchitectureContext {
  layers: string[];
  executionExamples: ExecutionExample[];
  keyModules: { file: string; referencedByCount: number }[];
}

export interface ExecutionExample {
  route: string;
  method: string;
  flow: string[];
}

export interface AiArchitectInput {
  repository: RepositoryContext;
  architecture: ArchitectureContext;
}
