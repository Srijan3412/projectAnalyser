import { GoogleGenerativeAI } from "@google/generative-ai";
import { config } from "../../core/config/index.js";
import { logger } from "../../core/logger/index.js";
import fs from "fs/promises";
import path from "path";
import { AnalysisResult } from "@shared/types";

const apiKey = config.GEMINI_API_KEY;
let genAI: GoogleGenerativeAI | null = null;

if (apiKey && apiKey !== "YOUR_GEMINI_API_KEY" && apiKey !== "") {
  try {
    genAI = new GoogleGenerativeAI(apiKey);
    logger.info("🤖 Gemini AI Multi-Agent engine initialized successfully");
  } catch (err) {
    logger.error({ err }, "❌ Failed to initialize GoogleGenerativeAI instance");
  }
} else {
  logger.warn("⚠️ GEMINI_API_KEY not configured. Running Q&A AI in local simulation mode.");
}

/**
 * Specialist Agent representing AST and source code contents
 */
export class CodeSpecialistAgent {
  name = "CodeSpecialistAgent";

  async runQuery(question: string, repoPath: string, files: string[]): Promise<string> {
    if (!genAI) {
      return this.fallbackQuery(question, files);
    }

    let codebaseContext = "";
    // Limit to reading max 4 files to avoid rate limit or context blowouts
    const filesToRead = files.slice(0, 4);

    for (const file of filesToRead) {
      try {
        const fullPath = path.isAbsolute(file) ? file : path.join(repoPath, file);
        const content = await fs.readFile(fullPath, "utf8");
        const snippet = content.length > 6000 ? content.slice(0, 6000) + "\n\n[Code snippet truncated for brevity...]" : content;
        codebaseContext += `\n--- File: ${path.basename(file)} ---\n${snippet}\n`;
      } catch (err) {
        logger.warn({ err, file }, "CodeSpecialistAgent failed to read file from workspace");
      }
    }

    const prompt = `
      You are an AST & Code Specialist Agent. Your role is to analyze source code file content and explain implementation logic.
      
      Here is the raw source code of relevant file(s) retrieved from the workspace:
      ${codebaseContext || "No file content available."}
      
      Question: "${question}"
      
      Provide a highly precise, technical, and professional answer based only on the code. Do not hallucinate. Keep the response under 200 words.
      
      Answer:
    `;

    try {
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      const result = await model.generateContent(prompt);
      return result.response.text().trim();
    } catch (err: any) {
      logger.error({ err }, "CodeSpecialistAgent Gemini generation failed");
      return this.fallbackQuery(question, files);
    }
  }

  private fallbackQuery(question: string, files: string[]): string {
    const list = files.map(f => path.basename(f)).join(", ");
    return `[Local AI Simulation] Code Specialist Agent analyzed file(s): ${list || "none"}.
Based on the code analysis:
- Files like 'scoring.engine.js' implement ATS algorithms, computing skillsMatch, experienceMatch, and locationMatch by checking job requirements against resume JSON schema.
- Files like 'question.classifier.js' parse screening text patterns via regex to identify numeric, notice, or yes/no queries.
- Files like 'automation/humanizer.js' apply typing/clicking delays to simulate human interactions.
Please set GEMINI_API_KEY in the backend .env to get full LLM-generated insights on this source code!`;
  }
}

/**
 * Specialist Agent representing Route mapping & Environment variables
 */
export class GraphSpecialistAgent {
  name = "GraphSpecialistAgent";

  async runQuery(question: string, graphOverview: any): Promise<string> {
    if (!genAI) {
      return this.fallbackQuery(question, graphOverview);
    }

    const prompt = `
      You are a Graph & Route Specialist Agent. Your role is to analyze the codebase dependency graph and routing systems.
      
      Codebase Graph Overview:
      - Total Files: ${graphOverview.totalFiles}
      - Direct Dependencies (edges): ${graphOverview.totalDependencies}
      
      API Endpoints Discovered:
      ${JSON.stringify(graphOverview.routes || [], null, 2)}
      
      Environment Variables:
      ${JSON.stringify(graphOverview.envVars || [], null, 2)}
      
      Question: "${question}"
      
      Provide an architecture-centric explanation of the routes, dependencies, or environment variables. Keep it under 200 words.
      
      Answer:
    `;

    try {
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      const result = await model.generateContent(prompt);
      return result.response.text().trim();
    } catch (err: any) {
      logger.error({ err }, "GraphSpecialistAgent Gemini generation failed");
      return this.fallbackQuery(question, graphOverview);
    }
  }

  private fallbackQuery(question: string, graphOverview: any): string {
    const routes = (graphOverview.routes || []).map((r: any) => `${r.method} ${r.path}`).slice(0, 5).join(", ");
    const envVars = (graphOverview.envVars || []).map((e: any) => e.name).slice(0, 5).join(", ");
    return `[Local AI Simulation] Graph Specialist Agent analyzed codebase structure:
- Total Graph dependencies: ${graphOverview.totalDependencies ?? 0} linkages.
- API Endpoints detected: [${routes || "none"}].
- Environment Variables required: [${envVars || "none"}].
The entry points serve as inputs to the controllers, service layers, and repositories. Relative imports outline the BFS traversal path, and dead code candidates identify unreferenced modules. Set GEMINI_API_KEY in backend .env to generate live graph summaries.`;
  }
}

/**
 * Specialist Agent representing Database models & Schema mappings
 */
export class DbSpecialistAgent {
  name = "DbSpecialistAgent";

  async runQuery(question: string, dbDiscovery: any): Promise<string> {
    if (!genAI) {
      return this.fallbackQuery(question, dbDiscovery);
    }

    const prompt = `
      You are a Database Specialist Agent. Your role is to explain database schemas, entity structures, and endpoint query flows.
      
      Database Discovery Details:
      - DB Type: ${dbDiscovery.dbType}
      - ORM / Driver: ${dbDiscovery.orm}
      - Entities: ${JSON.stringify(dbDiscovery.entities || [], null, 2)}
      - Endpoint Query Flows (Traced routes hitting DB):
        ${JSON.stringify(dbDiscovery.flows || [], null, 2)}
      
      Question: "${question}"
      
      Provide a concise summary explaining the database architecture, tables, or API query flows. Keep it under 200 words.
      
      Answer:
    `;

    try {
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      const result = await model.generateContent(prompt);
      return result.response.text().trim();
    } catch (err: any) {
      logger.error({ err }, "DbSpecialistAgent Gemini generation failed");
      return this.fallbackQuery(question, dbDiscovery);
    }
  }

  private fallbackQuery(question: string, dbDiscovery: any): string {
    const entities = (dbDiscovery.entities || []).map((e: any) => e.name || e).join(", ");
    const flows = (dbDiscovery.flows || []).map((f: any) => `${f.route} -> ${f.path?.join(" -> ")}`).slice(0, 3).join("\n");
    return `[Local AI Simulation] Database Specialist Agent analyzed repository schema:
- Database: ${dbDiscovery.dbType || "PostgreSQL/SQLite"} (via ORM: ${dbDiscovery.orm || "Prisma"}).
- Discovered entities/tables: ${entities || "none found"}.
- Database routes and flows:
${flows || "No query flows discovered."}
All database entities are bound through repository patterns. Set GEMINI_API_KEY in the backend .env to get full database relationship diagrams and description logs.`;
  }
}

/**
 * Specialist Agent for developer onboarding questions
 * Handles: "Where do I start?", "What files matter most?", "How long to understand this?"
 */
export class OnboardingAgent {
  name = "OnboardingAgent";

  async runQuery(question: string, analysisResult: AnalysisResult): Promise<string> {
    const onboarding = (analysisResult as any).onboarding;
    const aiSummary = (analysisResult as any).aiSummary;

    if (!onboarding) {
      return `Onboarding guide is not available for this repository yet. The analysis pipeline generates it automatically — try re-analyzing.`;
    }

    const topFiles = (onboarding.criticalFiles || []).slice(0, 5).map((f: any) => `\`${f.file}\` — ${f.role}`).join("\n");
    const learningPath = (onboarding.learningPath || []).slice(0, 6).map((s: any) => `Step ${s.order}: \`${s.file}\` (${s.category}) — ${s.reason}`).join("\n");
    const envSetup = (onboarding.envSetup || []).filter((e: any) => e.criticality === "HIGH").map((e: any) => `\`${e.name}\` — ${e.description}`).join("\n");

    if (!genAI) {
      return `[Onboarding Guide — Day 1]

${onboarding.summary || "Start by exploring the entry point and route definitions."}

**Recommended Learning Path:**
${learningPath || "No learning path generated."}

**Critical Files to Read First:**
${topFiles || "No critical files identified."}

**Environment Variables to Configure:**
${envSetup || "No critical env vars detected."}

Set GEMINI_API_KEY in the backend .env for personalized AI-powered onboarding responses.`;
    }

    try {
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      const prompt = `
        You are an expert Developer Onboarding Agent. Answer the developer's question using the onboarding guide below.
        
        Repository Summary: ${aiSummary?.purpose || "Unknown project"}
        
        Day 1 Guide: ${onboarding.summary}
        
        Learning Path (ordered):
        ${learningPath}
        
        Critical Files:
        ${topFiles}
        
        Required Environment Variables:
        ${envSetup || "None"}
        
        Architecture Tour: ${(onboarding.architectureTour || []).join(" → ")}
        
        Developer Question: "${question}"
        
        Answer concisely (under 200 words), referencing specific file names and steps:
      `;

      const result = await model.generateContent(prompt);
      return result.response.text().trim();
    } catch (err: any) {
      logger.error({ err }, "OnboardingAgent Gemini generation failed");
      return `[Onboarding Guide]\n\n${onboarding.summary}\n\n**Start here:**\n${learningPath}`;
    }
  }
}

/**
 * Orchestrator Brain Agent coordinating specialist workers
 */
export class AgentOrchestrator {
  private codeAgent = new CodeSpecialistAgent();
  private graphAgent = new GraphSpecialistAgent();
  private dbAgent = new DbSpecialistAgent();
  private onboardingAgent = new OnboardingAgent();

  async coordinateAnalysis(
    question: string,
    repoPath: string,
    analysisResult: AnalysisResult
  ): Promise<{
    answer: string;
    agentLogs: string[];
  }> {
    const logs: string[] = [];
    logs.push(`🤖 AgentOrchestrator received query: "${question}"`);

    let routing: { specialists: string[]; subtasks: string[]; filesToRead?: string[] } = {
      specialists: [],
      subtasks: [],
      filesToRead: []
    };

    const queryText = question.toLowerCase();

    // 1. Route Intent
    if (genAI) {
      try {
        logs.push("[Orchestrator] Invoking LLM routing model to parse question intent...");
        const model = genAI.getGenerativeModel({
          model: "gemini-1.5-flash",
          generationConfig: { responseMimeType: "application/json" }
        });

        const routerPrompt = `
          You are the Router Orchestrator for a codebase visualizer assistant. Given the user's question, decide which specialist agents should compile the answer.
          
          Available Specialist Agents:
          - "code": For logical, implementation-specific, or syntax-level questions.
          - "graph": For API routes, entry points, environment variables, or general file dependencies.
          - "database": For database configuration, Prisma schemas, database entities, or endpoint transaction flows.
          
          Return ONLY a JSON object:
          {
            "specialists": ["code" | "graph" | "database"],
            "subtasks": ["Description of sub-task to resolve"],
            "filesToRead": ["relative/file/paths/from/the/list/below"]
          }
          
          List of files in the repository:
          ${JSON.stringify((analysisResult.files || []).map(f => f.path))}
          
          User Question: "${question}"
        `;

        const result = await model.generateContent(routerPrompt);
        routing = JSON.parse(result.response.text().trim());
        logs.push(`[Orchestrator] LLM routing completed. Specialists: [${routing.specialists.join(", ")}]`);
      } catch (err) {
        logger.warn({ err }, "LLM routing failed, falling back to keywords");
        routing = this.keywordRoute(queryText, analysisResult);
        logs.push(`[Orchestrator] Keyword fallback routing resolved: [${routing.specialists.join(", ")}]`);
      }
    } else {
      routing = this.keywordRoute(queryText, analysisResult);
      logs.push(`[Orchestrator] Local keyword routing resolved: [${routing.specialists.join(", ")}]`);
    }

    // 2. Execute Specialist Agent Tasks
    const answers: string[] = [];

    // Onboarding Agent — route first if intent is "where to start / understand"
    if (routing.specialists.includes("onboarding")) {
      logs.push("[OnboardingAgent] Consulting developer onboarding guide and learning path...");
      const ans = await this.onboardingAgent.runQuery(question, analysisResult);
      answers.push(ans);
      logs.push("[OnboardingAgent] Onboarding guidance compiled successfully.");
    }

    if (routing.specialists.includes("database")) {
      logs.push("[DbSpecialist] Mapping database schema relations and REST transaction flows...");
      const dbDiscovery = {
        dbType: (analysisResult as any).databaseInfo?.dbType || "PostgreSQL/SQLite",
        orm: (analysisResult as any).databaseInfo?.orm || "Prisma",
        entities: (analysisResult as any).databaseInfo?.entities || [],
        flows: (analysisResult as any).databaseInfo?.flows || []
      };
      const ans = await this.dbAgent.runQuery(question, dbDiscovery);
      answers.push(ans);
      logs.push("[DbSpecialist] Mapped database tables and entity dependencies successfully.");
    }

    if (routing.specialists.includes("graph")) {
      logs.push("[GraphSpecialist] Querying knowledge graph overview and API routing tables...");
      const graphOverview = {
        totalFiles: analysisResult.overview.totalFiles,
        totalDependencies: analysisResult.overview.totalDependencies,
        routes: analysisResult.routes || [],
        envVars: analysisResult.envVars || []
      };
      const ans = await this.graphAgent.runQuery(question, graphOverview);
      answers.push(ans);
      logs.push("[GraphSpecialist] Formulated graph dependencies analysis successfully.");
    }

    if (routing.specialists.includes("code") || answers.length === 0) {
      logs.push("[CodeSpecialist] Analyzing logic from target source files...");
      let filesToRead = routing.filesToRead || [];
      if (filesToRead.length === 0) {
        // Keyword-based local lookup for relevant files
        filesToRead = (analysisResult.files || [])
          .map(f => f.path)
          .filter(filePath => {
            const baseName = path.basename(filePath).toLowerCase();
            return queryText.split(/\s+/).some(word => word.length > 3 && baseName.includes(word));
          });
      }
      if (filesToRead.length === 0 && analysisResult.files?.length > 0) {
        // Fallback to entry point file
        filesToRead = [analysisResult.files[0].path];
      }

      const ans = await this.codeAgent.runQuery(question, repoPath, filesToRead);
      answers.push(ans);
      logs.push("[CodeSpecialist] Logical file analysis completed.");
    }

    // 3. Consolidate Responses
    let finalAnswer = "";
    if (answers.length === 1) {
      finalAnswer = answers[0];
    } else {
      if (genAI) {
        try {
          logs.push("[Orchestrator] Invoking LLM Synthesizer to consolidate agent findings...");
          const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
          const prompt = `
            You are the router orchestrator. Combine the findings from your specialist agents into a single, cohesive developer response.
            
            Specialist Answers:
            ${answers.map((ans, idx) => `Agent ${idx + 1}:\n${ans}`).join("\n\n")}
            
            Original Question: "${question}"
            
            Synthesize the final answer (under 200 words):
          `;
          const result = await model.generateContent(prompt);
          finalAnswer = result.response.text().trim();
        } catch (err) {
          logger.warn({ err }, "LLM synthesis failed, joining strings");
          finalAnswer = answers.join("\n\n");
        }
      } else {
        finalAnswer = answers.join("\n\n");
      }
    }

    logs.push("🤖 Orchestrator synthesis complete. Delivering answer.");
    return {
      answer: finalAnswer,
      agentLogs: logs
    };
  }

  private keywordRoute(queryText: string, analysisResult: AnalysisResult) {
    const specialists: string[] = [];
    const subtasks: string[] = [];

    // Onboarding intent — highest priority
    if (queryText.match(/\b(start|onboard|begin|first|understand|where|new developer|new to|get started|orientation|introduce|learn|how long)\b/i)) {
      specialists.push("onboarding");
      subtasks.push("Provide a developer onboarding guide answer.");
    }
    if (queryText.match(/\b(table|entity|prisma|relation|database|db|postgresql|mongo|schema|flow)\b/i)) {
      specialists.push("database");
      subtasks.push("Analyze entity schemas and transaction route flows.");
    }
    if (queryText.match(/\b(route|endpoint|controller|get|post|delete|path|import|depend|circular|cycle|dead)\b/i)) {
      specialists.push("graph");
      subtasks.push("Map out API routes and dependency edges.");
    }
    if (specialists.length === 0) {
      specialists.push("code");
      subtasks.push("Read raw code snippets in target directories.");
    }

    return { specialists, subtasks };
  }
}
