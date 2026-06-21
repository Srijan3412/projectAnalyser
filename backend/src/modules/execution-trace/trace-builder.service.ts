import { AnalysisResult, ExecutionTrace, TraceStep, FileNode, EnvironmentVariable } from "@shared/types";
import fs from "fs/promises";
import path from "path";
import { logger } from "../../core/logger/index.js";

export class TraceBuilderService {
  static async buildTraces(repoPath: string, result: AnalysisResult): Promise<ExecutionTrace[]> {
    logger.info("Starting Recruiter-Grade Execution Trace Builder Service");
    const traces: ExecutionTrace[] = [];

    const dbFlows = result.metadata?.databaseInfo?.flows || [];
    const dbTypeRaw = result.metadata?.databaseInfo?.type || "";
    let dbType = dbTypeRaw;
    if (dbTypeRaw.toLowerCase().includes("postgres")) {
      dbType = "PostgreSQL";
    } else if (dbTypeRaw.toLowerCase().includes("mongo")) {
      dbType = "MongoDB";
    } else if (dbTypeRaw.toLowerCase().includes("mysql")) {
      dbType = "MySQL";
    } else if (dbTypeRaw.toLowerCase().includes("sqlite")) {
      dbType = "SQLite";
    } else if (!dbTypeRaw) {
      dbType = "Database";
    }

    const routes = result.routes || [];

    for (const r of routes) {
      const steps: TraceStep[] = [];
      const envVarsUsed = new Set<string>();

      // Helper to find file node in results
      const findFileNode = (name: string): FileNode | undefined => {
        return result.files.find(f => {
          const base = path.basename(f.path, path.extname(f.path));
          return base.toLowerCase() === name.toLowerCase();
        });
      };

      // 1. Middleware / Guards / Interceptors
      if (r.middleware && r.middleware.length > 0) {
        for (const mw of r.middleware) {
          const mwFile = findFileNode(mw);
          steps.push({
            name: mw,
            type: "middleware",
            filePath: mwFile?.path
          });
        }
      }

      // 2. Controller / Entry point
      if (r.file) {
        const ctrlName = path.basename(r.file, path.extname(r.file));
        steps.push({
          name: ctrlName,
          type: "controller",
          filePath: r.file
        });
      }

      // 3. Scan each file in route chain
      const filesToCheck = r.chain || [];
      for (const file of filesToCheck) {
        const basename = path.basename(file, path.extname(file));
        
        // Skip duplicate of controller if it's already added
        if (steps.some(s => s.name === basename)) {
          continue;
        }

        let type: TraceStep["type"] = "service";
        const lowerName = basename.toLowerCase();
        if (lowerName.includes("controller") || lowerName.includes("handler") || lowerName.includes("resolver")) {
          type = "controller";
        } else if (lowerName.includes("repository") || lowerName.includes("repo") || lowerName.includes("model")) {
          type = "repository";
        } else if (lowerName.includes("service")) {
          type = "service";
        }

        steps.push({
          name: basename,
          type,
          filePath: file
        });

        // Scan content for cryptographic or library helper calls
        try {
          const fullPath = path.resolve(repoPath, file);
          const content = await fs.readFile(fullPath, "utf8");

          if (content.includes("jwt.sign") || content.includes("sign(")) {
            steps.push({ name: "jwt.sign()", type: "helper" });
          } else if (content.includes("jwt.verify") || content.includes("verify(")) {
            steps.push({ name: "jwt.verify()", type: "helper" });
          }

          if (content.includes("bcrypt.compare") || content.includes("compare(")) {
            steps.push({ name: "bcrypt.compare()", type: "helper" });
          } else if (content.includes("bcrypt.hash") || content.includes("hash(")) {
            steps.push({ name: "bcrypt.hash()", type: "helper" });
          }
        } catch (err) {
          // File read error, skip content scan
        }
      }

      // 4. Database flow matching
      const matchingDbFlow = dbFlows.find(
        (f) => f.route === r.path && f.method === r.method
      );

      if (matchingDbFlow) {
        // If there are database entities but no repository is in the chain, append them
        if (matchingDbFlow.entities && matchingDbFlow.entities.length > 0) {
          for (const ent of matchingDbFlow.entities) {
            const repoName = ent.charAt(0).toLowerCase() + ent.slice(1) + "Repository";
            // Avoid duplicates
            if (!steps.some(s => s.name.toLowerCase() === repoName.toLowerCase())) {
              const repoFile = findFileNode(repoName);
              steps.push({
                name: repoName,
                type: "repository",
                filePath: repoFile?.path
              });
            }
          }
        }
        
        // Append database engine to end
        steps.push({
          name: dbType,
          type: "database"
        });
      }

      // 5. Environmental variables used
      const chainFiles = new Set(r.chain || []);
      if (r.file) chainFiles.add(r.file);
      (result.envVars || []).forEach((e: EnvironmentVariable) => {
        if ((e.files || []).some((f: string) => chainFiles.has(f))) {
          envVarsUsed.add(e.name);
        }
      });

      // 6. Metrics Calculations
      // Complexity calculation (sum of complexity of files in steps)
      let totalComplexity = 0;
      const complexityList = result.staticAnalysis?.complexity || [];
      steps.forEach(s => {
        if (s.filePath) {
          const comp = complexityList.find((c: any) => c.file === s.filePath);
          totalComplexity += comp?.score || 4; // fallback complexity is 4
        }
      });
      if (totalComplexity === 0) totalComplexity = 8; // default minimal complexity

      // Layers represented in the steps (excluding helper)
      const uniqueLayers = new Set(
        steps.filter(s => s.type !== "helper").map(s => s.type)
      );

      // Database Calls count
      const dbCallsCount = matchingDbFlow?.operations?.length || (matchingDbFlow ? 2 : 0);

      // Auth Flow attributes
      let authFlowType: string | undefined = undefined;
      const isAuthRoute = /login|token|auth|register/i.test(r.path);
      const hasAuthMiddleware = steps.some(s => s.type === "middleware" && /auth|jwt|passport|guard/i.test(s.name));
      if (isAuthRoute) {
        authFlowType = "Token Generated";
      } else if (hasAuthMiddleware) {
        authFlowType = "JWT Verified";
      }

      // Confidence Score calculation
      let confidenceScore = 50; // base score
      if (r.file) confidenceScore += 15;
      if (r.chain && r.chain.length > 0) confidenceScore += 15;
      if (r.confidence !== undefined) confidenceScore += Math.round(r.confidence * 20);
      else if (r.framework) confidenceScore += 10;
      if (matchingDbFlow) confidenceScore += 10;
      confidenceScore = Math.min(100, Math.max(0, confidenceScore));

      // Database reachability
      const reachability = steps.some(s => s.type === "database");

      traces.push({
        route: r.path,
        method: r.method,
        steps,
        confidence: confidenceScore,
        reachability,
        metrics: {
          complexity: totalComplexity,
          layers: uniqueLayers.size,
          dbCalls: dbCallsCount,
          middleware: r.middleware?.length || 0,
          envVars: envVarsUsed.size
        },
        envVars: Array.from(envVarsUsed),
        authType: authFlowType
      });
    }

    return traces;
  }
}
