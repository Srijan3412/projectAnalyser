import { Project, SyntaxKind } from "ts-morph";
import { EnvironmentVariableInfo } from "./types.js";
import { EnvironmentCategorizer } from "./environment-categorizer.js";
import fs from "fs/promises";
import path from "path";
import { logger } from "../../core/logger/index.js";

export class EnvironmentAnalyzerService {
  /**
   * Scans codebase files to extract environment variables usage and compares against .env.example
   */
  static async analyze(repoPath: string, filePaths: string[]): Promise<{
    envVars: EnvironmentVariableInfo[];
    missingEnvVars: string[];
  }> {
    logger.info({ repoPath }, "🔍 Initiating Environment Variable Analyzer");

    const project = new Project();

    const sourceFiles = filePaths.filter((f) => {
      const ext = path.extname(f).toLowerCase();
      return (ext === ".ts" || ext === ".tsx" || ext === ".js" || ext === ".jsx") &&
             !f.startsWith("node_modules/") &&
             !f.startsWith("dist/") &&
             !f.startsWith(".next/");
    });

    for (const file of sourceFiles) {
      try {
        project.addSourceFileAtPath(path.join(repoPath, file));
      } catch {
        // Skip files that fail to load
      }
    }

    const varMap = new Map<string, { files: Set<string>; count: number }>();

    for (const sourceFile of project.getSourceFiles()) {
      const fullPath = sourceFile.getFilePath();
      const relativePath = path.relative(repoPath, fullPath).replace(/\\/g, "/");

      // 1. PropertyAccessExpressions (e.g., process.env.JWT_SECRET)
      const props = sourceFile.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression);
      for (const prop of props) {
        try {
          const exprText = prop.getExpression().getText();
          if (exprText === "process.env" || exprText === "Bun.env" || exprText === "import.meta.env") {
            const varName = prop.getName();
            if (/^[A-Za-z0-9_]+$/.test(varName)) {
              this.recordVar(varMap, varName, relativePath);
            }
          }
        } catch {
          // Ignore AST evaluation errors
        }
      }

      // 2. ElementAccessExpressions (e.g., process.env['JWT_SECRET'])
      const elAccesses = sourceFile.getDescendantsOfKind(SyntaxKind.ElementAccessExpression);
      for (const el of elAccesses) {
        try {
          const exprText = el.getExpression().getText();
          if (exprText === "process.env" || exprText === "Bun.env" || exprText === "import.meta.env") {
            const arg = el.getArgumentExpression();
            if (arg && (arg.getKind() === SyntaxKind.StringLiteral || arg.getKind() === SyntaxKind.NoSubstitutionTemplateLiteral)) {
              const varName = arg.getText().replace(/['"`]/g, "");
              if (/^[A-Za-z0-9_]+$/.test(varName)) {
                this.recordVar(varMap, varName, relativePath);
              }
            }
          }
        } catch {
          // Ignore
        }
      }

      // 3. CallExpressions (e.g., Deno.env.get("JWT_SECRET"))
      const calls = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression);
      for (const call of calls) {
        try {
          const expr = call.getExpression();
          if (expr.getText() === "Deno.env.get") {
            const args = call.getArguments();
            if (args.length >= 1) {
              const firstArg = args[0];
              if (firstArg.getKind() === SyntaxKind.StringLiteral || firstArg.getKind() === SyntaxKind.NoSubstitutionTemplateLiteral) {
                const varName = firstArg.getText().replace(/['"`]/g, "");
                if (/^[A-Za-z0-9_]+$/.test(varName)) {
                  this.recordVar(varMap, varName, relativePath);
                }
              }
            }
          }
        } catch {
          // Ignore
        }
      }
    }

    // Load defined variables from .env.example
    const envExampleVars = await this.parseEnvExample(repoPath);
    const envExampleSet = new Set(envExampleVars);

    // Identify missing variables (used in code but not in .env.example)
    const missingEnvVars: string[] = [];
    for (const varName of varMap.keys()) {
      if (envExampleSet.size > 0 && !envExampleSet.has(varName)) {
        missingEnvVars.push(varName);
      }
    }

    // Add variables defined in .env.example but not found in code
    for (const varName of envExampleVars) {
      if (!varMap.has(varName)) {
        varMap.set(varName, { files: new Set(), count: 0 });
      }
    }

    // Map to final array
    const envVars: EnvironmentVariableInfo[] = Array.from(varMap.entries()).map(([name, data]) => {
      const filesArray = Array.from(data.files);
      const usedBy = filesArray.map((f) => path.basename(f));

      const nameUpper = name.toUpperCase();
      let criticality: "HIGH" | "LOW" = "LOW";
      if (
        nameUpper.includes("JWT") ||
        nameUpper.includes("SECRET") ||
        nameUpper.includes("DATABASE") ||
        nameUpper.includes("KEY") ||
        nameUpper.includes("PASS") ||
        nameUpper.includes("TOKEN") ||
        nameUpper.includes("AUTH") ||
        nameUpper.includes("CREDENTIAL") ||
        nameUpper.includes("PRIVATE")
      ) {
        criticality = "HIGH";
      }

      return {
        name,
        category: EnvironmentCategorizer.categorize(name),
        files: filesArray,
        usages: data.count,
        usedBy,
        criticality,
      };
    });

    envVars.sort((a, b) => b.usages - a.usages || a.name.localeCompare(b.name));

    logger.info({ envVarsCount: envVars.length, missingCount: missingEnvVars.length }, "🔍 Environment Analyzer completed");

    return { envVars, missingEnvVars };
  }

  private static recordVar(
    map: Map<string, { files: Set<string>; count: number }>,
    name: string,
    file: string
  ) {
    if (!map.has(name)) {
      map.set(name, { files: new Set(), count: 0 });
    }
    const val = map.get(name)!;
    val.files.add(file);
    val.count++;
  }

  private static async parseEnvExample(repoPath: string): Promise<string[]> {
    const vars: string[] = [];
    const envPaths = [
      path.join(repoPath, ".env.example"),
      path.join(repoPath, "env.example"),
      path.join(repoPath, ".env.defaults"),
    ];

    for (const p of envPaths) {
      try {
        const content = await fs.readFile(p, "utf8");
        const lines = content.split(/\r?\n/);
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith("#") || !trimmed) continue;

          const match = trimmed.match(/^\s*([A-Za-z0-9_]+)\s*=/);
          if (match) {
            vars.push(match[1]);
          }
        }
        break;
      } catch {
        // Skip
      }
    }
    return vars;
  }
}
