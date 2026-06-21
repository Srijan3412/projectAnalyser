/**
 * Phase 11 — AI Architect: Prompt Builder
 *
 * Builds precision-engineered prompts for Gemini.
 * The model receives ONLY structured JSON context — no source code, no file contents.
 */
import { AiArchitectInput } from "./types.js";

export class PromptBuilder {
  static buildArchitectSummaryPrompt(ctx: AiArchitectInput): string {
    const { repository: r, architecture: a } = ctx;

    const executionExamplesText = a.executionExamples.length > 0
      ? a.executionExamples
          .map((ex) => `  ${ex.method} ${ex.route}: ${ex.flow.join(" → ")}`)
          .join("\n")
      : "  (No execution examples available)";

    const entitiesText = r.entities.length > 0
      ? r.entities.join(", ")
      : "None detected";

    const keyModulesText = a.keyModules.length > 0
      ? a.keyModules.map((m) => `  - ${m.file} (referenced by ${m.referencedByCount} files)`).join("\n")
      : "  (No module data available)";

    return `You are a senior software architect reviewing a codebase via its static analysis metadata.
Your task: generate a professional Architecture Summary document in Markdown.

STRICT RULES:
- Base your analysis ONLY on the JSON metadata provided below.
- Do NOT invent file names, routes, or technologies not present in the metadata.
- Do NOT include any code snippets.
- Be concise and technical. Target audience: engineers joining the team.
- Output must be in Markdown with clear headings.

REPOSITORY METADATA:
\`\`\`json
${JSON.stringify(
  {
    framework: r.framework,
    language: r.language,
    runtime: r.runtime,
    packageManager: r.packageManager,
    entryPoint: r.entryPoint,
    totalFiles: r.totalFiles,
    totalRoutes: r.totalRoutes,
    database: r.database,
    orm: r.orm,
    authentication: r.authentication,
    entities: r.entities,
    architectureLayers: a.layers,
    keyEnvironmentVariables: r.topEnvVars,
  },
  null,
  2
)}
\`\`\`

EXECUTION FLOW EXAMPLES:
${executionExamplesText}

KEY MODULES (by import frequency):
${keyModulesText}

Generate a Markdown document with these EXACT sections in order:

## 🎯 Project Purpose
What does this application do? Infer from the framework, routes, entities, and authentication method.

## ⚙️ Technical Stack
List: Framework, Language, Runtime, Database, ORM, Authentication, Package Manager.

## 🔄 Request Lifecycle
Show the flow from client request to database response using the architecture layers. Use arrows (→).

## 🔐 Authentication
Explain the authentication approach based on the detected method and env vars.

## 🗄️ Database Layer
Describe the database setup, ORM, and list the discovered entities.

## 🧩 Key Modules
List the most-referenced files and explain their likely roles.

## 📋 Quick Start
3–5 bullet points: what a new developer should do on day 1.

Output the Markdown document only. No preamble.`;
  }

  static buildOnboardingPrompt(ctx: AiArchitectInput, steps: { file: string; category: string; importanceScore: number }[]): string {
    const { repository: r } = ctx;

    const stepsText = steps
      .slice(0, 8)
      .map((s, i) => `  ${i + 1}. ${s.file} (${s.category}, importance: ${s.importanceScore})`)
      .join("\n");

    return `You are a senior engineer writing a developer onboarding guide for a new team member.

REPOSITORY METADATA:
\`\`\`json
${JSON.stringify({ framework: r.framework, language: r.language, entryPoint: r.entryPoint, database: r.database, authentication: r.authentication }, null, 2)}
\`\`\`

PRIORITIZED FILE LIST (ordered by importance):
${stepsText}

For each file in the list, write a ONE sentence explanation of what it does and why a new developer should read it.
Output JSON only in this exact shape:
{
  "summary": "One paragraph describing what to do on day 1",
  "steps": [
    { "file": "filename", "reason": "one sentence explanation" }
  ]
}`;
  }
}
