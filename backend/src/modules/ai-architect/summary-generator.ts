/**
 * Phase 11 — AI Architect: Summary Generator
 *
 * Calls Gemini with the structured metadata prompt.
 * Falls back to a deterministic template if GEMINI_API_KEY is not set.
 */
import { GoogleGenerativeAI } from "@google/generative-ai";
import { config } from "../../core/config/index.js";
import { logger } from "../../core/logger/index.js";
import { AnalysisResult, AiArchitectSummary } from "@shared/types";
import { ContextBuilder } from "./context-builder.js";
import { PromptBuilder } from "./prompt-builder.js";

let genAI: GoogleGenerativeAI | null = null;
const apiKey = config.GEMINI_API_KEY;
if (apiKey && apiKey !== "" && apiKey !== "YOUR_GEMINI_API_KEY") {
  try {
    genAI = new GoogleGenerativeAI(apiKey);
  } catch {
    // Will use fallback
  }
}

export class SummaryGenerator {
  static async generate(result: AnalysisResult): Promise<AiArchitectSummary> {
    const ctx = ContextBuilder.build(result);
    const { repository: r, architecture: a } = ctx;

    // Build stack object (used in both AI and fallback paths)
    const stack: AiArchitectSummary["stack"] = {
      framework: r.framework,
      language: r.language,
      runtime: r.runtime,
      database: r.database,
      orm: r.orm,
      authentication: r.authentication,
      packageManager: r.packageManager,
    };

    const lifecycle = a.layers.length > 0 ? a.layers : ["Route", "Controller", "Service", "Repository", "Database"];

    const keyModules: AiArchitectSummary["keyModules"] = a.keyModules.map((m) => ({
      file: m.file,
      role: SummaryGenerator.inferRole(m.file),
      importance: Math.min(100, m.referencedByCount * 10 + 10),
    }));

    let markdownSummary = "";
    let purpose = "";
    let authDescription = r.authentication !== "None detected"
      ? `${r.authentication} authentication is used to protect routes.`
      : "No authentication mechanism detected.";
    let dbDescription = r.database !== "None detected"
      ? `${r.database} via ${r.orm} with ${r.entities.length} detected entities.`
      : "No database detected.";

    if (genAI) {
      try {
        logger.info("🤖 [AI Architect] Calling Gemini to generate architecture summary...");
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const prompt = PromptBuilder.buildArchitectSummaryPrompt(ctx);
        const geminiResult = await model.generateContent(prompt);
        markdownSummary = geminiResult.response.text().trim();

        // Extract purpose from first heading section
        const purposeMatch = markdownSummary.match(/##\s*🎯\s*Project Purpose\n+([\s\S]+?)(?=\n##|$)/);
        if (purposeMatch) purpose = purposeMatch[1].trim().split("\n")[0];

        logger.info("✅ [AI Architect] Summary generated successfully via Gemini.");
      } catch (err) {
        logger.warn({ err }, "⚠️ [AI Architect] Gemini call failed, using deterministic fallback.");
        markdownSummary = SummaryGenerator.buildFallbackMarkdown(r, a, stack, lifecycle, keyModules);
        purpose = SummaryGenerator.buildFallbackPurpose(r);
      }
    } else {
      logger.info("⚡ [AI Architect] No Gemini API key — using deterministic summary template.");
      markdownSummary = SummaryGenerator.buildFallbackMarkdown(r, a, stack, lifecycle, keyModules);
      purpose = SummaryGenerator.buildFallbackPurpose(r);
    }

    return {
      purpose: purpose || SummaryGenerator.buildFallbackPurpose(r),
      stack,
      lifecycle,
      authentication: authDescription,
      database: dbDescription,
      keyModules,
      markdownSummary,
    };
  }

  private static inferRole(filename: string): string {
    const f = filename.toLowerCase();
    if (/server|app|main|index/.test(f)) return "Application bootstrap / entry point";
    if (/route|router/.test(f)) return "HTTP route definitions";
    if (/controller/.test(f)) return "Request handling and response shaping";
    if (/service/.test(f)) return "Business logic layer";
    if (/repository|repo/.test(f)) return "Data access and database operations";
    if (/middleware|guard|auth/.test(f)) return "Authentication / middleware";
    if (/config|env|setting/.test(f)) return "Configuration management";
    if (/schema|model|entity/.test(f)) return "Data model / schema definition";
    if (/test|spec/.test(f)) return "Test suite";
    return "Application module";
  }

  private static buildFallbackPurpose(r: ReturnType<typeof ContextBuilder.buildRepositoryContext>): string {
    return `A ${r.framework} application with ${r.totalRoutes} API routes, backed by ${r.database} (${r.orm}) and ${r.authentication} authentication.`;
  }

  private static buildFallbackMarkdown(
    r: ReturnType<typeof ContextBuilder.buildRepositoryContext>,
    a: ReturnType<typeof ContextBuilder.buildArchitectureContext>,
    stack: AiArchitectSummary["stack"],
    lifecycle: string[],
    keyModules: AiArchitectSummary["keyModules"]
  ): string {
    const lifecycleArrows = lifecycle.join("\n↓\n");
    const entityList = r.entities.map((e) => `- **${e}**`).join("\n") || "- *(no entities detected)*";
    const moduleList = keyModules.slice(0, 6).map((m) => `- \`${m.file}\` — ${m.role}`).join("\n") || "- *(no module data)*";
    const envList = r.topEnvVars.map((e) => `- \`${e.name}\` *(${e.criticality})*`).join("\n") || "- *(no env vars detected)*";
    const execExample = a.executionExamples[0];
    const execText = execExample
      ? `\`${execExample.method} ${execExample.route}\` → ${execExample.flow.join(" → ")}`
      : "No execution trace available";

    return `## 🎯 Project Purpose

This is a **${r.framework}** application built with **${r.language}** (${r.runtime}).
It exposes **${r.totalRoutes} API routes** across **${r.totalFiles} files**, backed by **${r.database}** via **${r.orm}**.
${r.authentication !== "None detected" ? `Authentication is handled using **${r.authentication}**.` : "No authentication mechanism was detected."}

---

## ⚙️ Technical Stack

| Technology | Detail |
|---|---|
| Framework | ${stack.framework} |
| Language | ${stack.language} |
| Runtime | ${stack.runtime} |
| Database | ${stack.database} |
| ORM | ${stack.orm} |
| Authentication | ${stack.authentication} |
| Package Manager | ${stack.packageManager} |

---

## 🔄 Request Lifecycle

\`\`\`
${lifecycleArrows}
\`\`\`

**Example request trace:**
${execText}

---

## 🔐 Authentication

${r.authentication !== "None detected"
  ? `This application uses **${r.authentication}** to secure protected routes. Tokens are typically validated via middleware before reaching controller handlers.`
  : "No authentication patterns were detected in this repository."}

---

## 🗄️ Database Layer

- **Engine:** ${r.database}
- **ORM/Driver:** ${r.orm}
- **Discovered Entities:**

${entityList}

---

## 🧩 Key Modules

The following files are most frequently imported by other modules:

${moduleList}

---

## 📋 Quick Start

- Clone the repository and install dependencies with \`${r.packageManager} install\`
- Configure environment variables (see the Environment section)
${r.database !== "None detected" ? `- Run database migrations via \`${r.orm.toLowerCase()}\`` : ""}
- Start the server via the entry point: \`${r.entryPoint}\`
- Explore the ${r.totalRoutes} API routes to understand available endpoints
`;
  }
}
