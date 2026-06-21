/**
 * Phase 11 — AI Architect: Context Builder
 *
 * Extracts structured, metadata-only context from the AnalysisResult.
 * NEVER sends source code to AI. Only sends discovered facts.
 */
import path from "path";
import { AnalysisResult } from "@shared/types";
import { RepositoryContext, ArchitectureContext, ExecutionExample, AiArchitectInput } from "./types.js";

export class ContextBuilder {
  /**
   * Build a compact repository context from already-discovered metadata.
   */
  static buildRepositoryContext(result: AnalysisResult): RepositoryContext {
    const meta = result.metadata;
    const fw = meta?.frameworkMetadata;
    const db = meta?.databaseInfo;

    // Framework
    const framework = fw?.frameworks?.[0]?.name || meta?.framework?.name || "Unknown";
    const language = fw?.language || meta?.primaryLanguage || "Unknown";
    const runtime = fw?.runtime || "Node.js";
    const packageManager = fw?.packageManager || "npm";

    // Entry point
    const entryPoint =
      meta?.entryPoints?.[0]?.filePath ||
      meta?.entryPoint ||
      result.files?.[0]?.path ||
      "unknown";

    // Database
    const database = db?.type || db?.databases?.[0] || "None detected";
    const orm = db?.orm || "None";

    // Auth detection — look for env vars and route patterns
    let authentication = "None detected";
    const authEnvMatch = result.envVars?.find(
      (e) => /jwt|secret|oauth|session|token/i.test(e.name)
    );
    if (authEnvMatch) {
      if (/jwt|secret/i.test(authEnvMatch.name)) authentication = "JWT";
      else if (/oauth/i.test(authEnvMatch.name)) authentication = "OAuth";
      else if (/session/i.test(authEnvMatch.name)) authentication = "Session-based";
    }
    const authRoute = result.routes?.find((r) => /auth|login|token/i.test(r.path));
    if (authRoute && authentication === "None detected") authentication = "Custom auth";

    // Entities
    const entities = (db?.entities || [])
      .slice(0, 10)
      .map((e) => e.entity || String(e));

    // Critical env vars
    const topEnvVars = (result.envVars || [])
      .slice(0, 8)
      .map((e) => ({ name: e.name, criticality: e.criticality || "LOW" as "HIGH" | "LOW" }));

    return {
      framework,
      language,
      runtime,
      packageManager,
      entryPoint: path.basename(entryPoint),
      totalFiles: result.overview?.totalFiles || result.files?.length || 0,
      totalRoutes: result.overview?.totalRoutes || result.routes?.length || 0,
      database,
      orm,
      authentication,
      entities,
      topEnvVars,
    };
  }

  /**
   * Build architecture context — layers and execution examples.
   */
  static buildArchitectureContext(result: AnalysisResult): ArchitectureContext {
    const arch = result.architecture;
    const layers = arch?.layers || ["Routes", "Services", "Database"];

    // Top execution examples from DB flows
    const executionExamples: ExecutionExample[] = (result.metadata?.databaseInfo?.flows || [])
      .slice(0, 3)
      .map((f) => ({
        route: f.route,
        method: f.method,
        flow: [
          ...(f.chain || []).map((c) => path.basename(c)),
          ...(f.entities || []).map((e) => e),
          result.metadata?.databaseInfo?.type || "Database",
        ].slice(0, 6),
      }));

    // Most referenced files as key modules
    const keyModules = (result.files || [])
      .map((f) => ({ file: path.basename(f.path), referencedByCount: f.referencedBy?.length || 0 }))
      .sort((a, b) => b.referencedByCount - a.referencedByCount)
      .slice(0, 8);

    return { layers, executionExamples, keyModules };
  }

  static build(result: AnalysisResult): AiArchitectInput {
    return {
      repository: ContextBuilder.buildRepositoryContext(result),
      architecture: ContextBuilder.buildArchitectureContext(result),
    };
  }
}
