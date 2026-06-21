/**
 * Phase 12 — Onboarding Engine
 *
 * Generates the full Developer Onboarding Guide from already-discovered metadata:
 * - Learning path (ordered by importance score)
 * - Critical files
 * - Environment setup checklist
 * - Architecture tour
 * - One-paragraph summary (AI or deterministic)
 */
import { GoogleGenerativeAI } from "@google/generative-ai";
import { config } from "../../core/config/index.js";
import { logger } from "../../core/logger/index.js";
import { AnalysisResult, OnboardingGuide } from "@shared/types";
import { PriorityAnalyzer } from "./priority-analyzer.js";
import { LearningPathBuilder } from "./learning-path-builder.js";
import { ContextBuilder } from "../ai-architect/context-builder.js";
import { PromptBuilder } from "../ai-architect/prompt-builder.js";

let genAI: GoogleGenerativeAI | null = null;
const apiKey = config.GEMINI_API_KEY;
if (apiKey && apiKey !== "" && apiKey !== "YOUR_GEMINI_API_KEY") {
  try { genAI = new GoogleGenerativeAI(apiKey); } catch { /* fallback */ }
}

export class OnboardingEngine {
  static async generate(result: AnalysisResult): Promise<OnboardingGuide> {
    logger.info("📚 [OnboardingEngine] Generating developer onboarding guide...");

    // 1. Rank files by importance
    const ranked = PriorityAnalyzer.rank(result, 12);

    // 2. Build learning path
    const learningPath = LearningPathBuilder.build(result, ranked);

    // 3. Critical files (top 6 with role description)
    const criticalFiles = ranked.slice(0, 6).map((r) => ({
      file: r.file,
      role: categoryToRole(r.category),
      importanceScore: r.importanceScore,
    }));

    // 4. Environment setup checklist from env vars
    const envSetup = (result.envVars || []).map((e) => ({
      name: e.name,
      criticality: e.criticality || "LOW" as "HIGH" | "LOW",
      description: generateEnvDescription(e.name, e.category),
    }));

    // 5. Architecture tour
    const architectureTour = LearningPathBuilder.buildArchitectureTour(result);

    // 6. Summary — AI or deterministic
    let summary = buildDeterministicSummary(result, ranked);

    if (genAI) {
      try {
        const ctx = ContextBuilder.build(result);
        const prompt = PromptBuilder.buildOnboardingPrompt(
          ctx,
          ranked.map((r) => ({ file: r.file, category: r.category, importanceScore: r.importanceScore }))
        );
        const model = genAI.getGenerativeModel({
          model: "gemini-1.5-flash",
          generationConfig: { responseMimeType: "application/json" },
        });
        const aiResult = await model.generateContent(prompt);
        const parsed = JSON.parse(aiResult.response.text().trim());

        if (parsed.summary) summary = parsed.summary;

        // Merge AI-generated reasons into learning path
        if (Array.isArray(parsed.steps)) {
          for (const step of parsed.steps) {
            const match = learningPath.find((s) => s.file === step.file);
            if (match && step.reason) match.reason = step.reason;
          }
        }

        logger.info("✅ [OnboardingEngine] AI-enhanced onboarding guide generated.");
      } catch (err) {
        logger.warn({ err }, "⚠️ [OnboardingEngine] AI enrichment failed, using deterministic guide.");
      }
    }

    return { learningPath, criticalFiles, envSetup, architectureTour, summary };
  }
}

function categoryToRole(category: string): string {
  const roles: Record<string, string> = {
    bootstrap:  "Application entry point — server initialization",
    routing:    "HTTP route definitions and endpoint mapping",
    auth:       "Authentication and authorization logic",
    service:    "Business logic and domain operations",
    repository: "Database access and query operations",
    database:   "Database configuration and schema",
    config:     "Environment and runtime configuration",
    other:      "Frequently-imported utility module",
  };
  return roles[category] || "Core application module";
}

function generateEnvDescription(name: string, category: string): string {
  const n = name.toLowerCase();
  if (/database_url|db_url|mongo_uri/.test(n)) return "Database connection string";
  if (/jwt_secret|jwt_key/.test(n)) return "Secret key for signing JWT tokens";
  if (/redis/.test(n)) return "Redis connection URL for caching/queuing";
  if (/api_key/.test(n)) return "External API authentication key";
  if (/port/.test(n)) return "Port the server listens on";
  if (/secret/.test(n)) return "Cryptographic secret — keep private";
  if (/node_env/.test(n)) return "Runtime environment (development/production)";
  if (/cors/.test(n)) return "Allowed CORS origins";
  return `${category} configuration variable`;
}

function buildDeterministicSummary(result: AnalysisResult, ranked: ReturnType<typeof PriorityAnalyzer.rank>): string {
  const fw = result.metadata?.frameworkMetadata?.frameworks?.[0]?.name || "the application";
  const entry = result.metadata?.entryPoints?.[0]?.filePath || "the main entry file";
  const db = result.metadata?.databaseInfo?.type || "the database";
  const topFile = ranked[1]?.file || "the core modules";

  return `Start by reading the application entry point to understand how ${fw} initializes. Then explore the route definitions to see the full API surface. Follow the request flow through controllers and services to understand the business logic, and finish with the repository layer to understand how data flows into ${db}. Pay special attention to \`${topFile}\` — it is the most referenced module in the codebase.`;
}
