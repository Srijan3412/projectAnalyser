/**
 * Phase 11 — AI Architect Service
 * Orchestrates context building → prompt assembly → summary generation.
 */
import { AnalysisResult, AiArchitectSummary } from "@shared/types";
import { SummaryGenerator } from "./summary-generator.js";
import { logger } from "../../core/logger/index.js";

export class AiArchitectService {
  static async generate(result: AnalysisResult): Promise<AiArchitectSummary> {
    try {
      return await SummaryGenerator.generate(result);
    } catch (err) {
      logger.error({ err }, "❌ [AiArchitectService] Failed to generate AI architecture summary");
      // Minimal fallback
      return {
        purpose: "Repository analysis completed.",
        stack: {
          framework: result.metadata?.frameworkMetadata?.frameworks?.[0]?.name || "Unknown",
          language: result.metadata?.frameworkMetadata?.language || "Unknown",
          runtime: result.metadata?.frameworkMetadata?.runtime || "Node.js",
          database: result.metadata?.databaseInfo?.type || "Unknown",
          orm: result.metadata?.databaseInfo?.orm || "Unknown",
          authentication: "Unknown",
          packageManager: result.metadata?.frameworkMetadata?.packageManager || "npm",
        },
        lifecycle: ["Route", "Service", "Database"],
        authentication: "Unknown",
        database: "Unknown",
        keyModules: [],
        markdownSummary: "## Architecture Summary\n\nAnalysis completed. Add a `GEMINI_API_KEY` to your `.env` for AI-generated insights.",
      };
    }
  }
}
