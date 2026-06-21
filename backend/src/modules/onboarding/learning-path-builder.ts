/**
 * Phase 12 — Onboarding Engine: Learning Path Builder
 *
 * Converts ranked files into an ordered LearningStep list with captions.
 * Builds the Architecture Tour from the primary execution flow.
 */
import path from "path";
import { AnalysisResult, LearningStep, LearningStepCategory } from "@shared/types";
import { RankedFile } from "./types.js";

const CATEGORY_REASON: Record<string, string> = {
  bootstrap:  "This is the application entry point — start here to understand how the server is initialized.",
  routing:    "Defines the HTTP API surface — shows all available endpoints and their handlers.",
  auth:       "Handles authentication logic — critical for understanding how users are identified and authorized.",
  service:    "Contains core business logic — the brain of the application.",
  repository: "Manages database operations — shows how data is read and written.",
  database:   "Database configuration and schema — understand the data model here.",
  config:     "Application configuration — environment variables and runtime settings.",
  other:      "Supporting module referenced frequently across the codebase.",
};

export class LearningPathBuilder {
  static build(result: AnalysisResult, rankedFiles: RankedFile[]): LearningStep[] {
    return rankedFiles.map((rf, idx) => ({
      order: idx + 1,
      file: rf.file,
      label: LearningPathBuilder.buildLabel(rf.file, rf.category),
      reason: CATEGORY_REASON[rf.category] || CATEGORY_REASON.other,
      category: rf.category as LearningStepCategory,
      importanceScore: rf.importanceScore,
    }));
  }

  static buildArchitectureTour(result: AnalysisResult): string[] {
    // Use the first DB flow chain as the primary tour path
    const flow = result.metadata?.databaseInfo?.flows?.[0];
    if (flow?.chain && flow.chain.length > 0) {
      return [
        ...(result.metadata?.entryPoint ? [path.basename(result.metadata.entryPoint)] : []),
        ...flow.chain.map((f) => path.basename(f)),
      ].filter((v, i, a) => a.indexOf(v) === i); // deduplicate
    }

    // Fallback: use top-ranked files by category order
    const layerOrder: LearningStepCategory[] = ["bootstrap", "routing", "auth", "service", "repository", "database"];
    return layerOrder
      .flatMap((cat) =>
        result.files
          .filter((f) => {
            const fn = path.basename(f.path).toLowerCase();
            if (cat === "bootstrap") return /server|app|main|index/.test(fn);
            if (cat === "routing") return /route|router/.test(fn);
            if (cat === "auth") return /auth|login|token/.test(fn);
            if (cat === "service") return /service/.test(fn);
            if (cat === "repository") return /repository|repo/.test(fn);
            if (cat === "database") return /database|db|prisma|schema/.test(fn);
            return false;
          })
          .slice(0, 1)
          .map((f) => path.basename(f.path))
      )
      .filter(Boolean)
      .slice(0, 6);
  }

  private static buildLabel(filename: string, category: string): string {
    const name = filename.replace(/\.(ts|js|mts|mjs)$/, "");
    const labels: Record<string, string> = {
      bootstrap: `${name} — Application Bootstrap`,
      routing:   `${name} — Route Definitions`,
      auth:      `${name} — Authentication Module`,
      service:   `${name} — Business Logic`,
      repository:`${name} — Data Access Layer`,
      database:  `${name} — Database Configuration`,
      config:    `${name} — Configuration`,
    };
    return labels[category] || `${name} — Core Module`;
  }
}
