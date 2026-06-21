import fs from "fs/promises";
import path from "path";
import { EntryPointInfo } from "@shared/types";
import { logger } from "../../core/logger/index.js";

export class EntryPointDetectorService {
  /**
   * Detects and ranks application entry point candidates in the repository.
   * 
   * @param repoPath Absolute path to the repository directory
   * @param filePaths Relative paths of all files in the repository
   * @param parsedPkg Parsed package.json file metadata
   * @param graph RepositoryGraph built in previous stages
   */
  static async detect(
    repoPath: string,
    filePaths: string[],
    parsedPkg: any,
    graph: any
  ): Promise<EntryPointInfo[]> {
    logger.info({ repoPath }, "🔍 Initiating Entry Point Detector");

    const candidatesMap = new Map<string, { filePath: string; score: number; reasons: string[] }>();
    const filePathsSet = new Set(filePaths.map((f) => f.replace(/\\/g, "/")));

    const getOrCreateCandidate = (filePath: string) => {
      const normalized = filePath.replace(/\\/g, "/");
      if (!candidatesMap.has(normalized)) {
        candidatesMap.set(normalized, { filePath: normalized, score: 0, reasons: [] });
      }
      return candidatesMap.get(normalized)!;
    };

    // 1. Analyze package.json "main" and "module" fields
    if (parsedPkg && parsedPkg.exists) {
      const mainField = parsedPkg.main || parsedPkg.module;
      if (mainField && typeof mainField === "string") {
        // Resolve common transpile/dist path redirections (e.g., dist/index.js -> src/index.ts)
        const cleanMain = mainField.replace(/\\/g, "/").replace(/^\.\//, "");
        const possiblePaths = [
          cleanMain,
          cleanMain.replace(/\.js$/, ".ts"),
          cleanMain.replace(/\.js$/, ".tsx"),
          cleanMain.replace(/^dist\//, "src/"),
          cleanMain.replace(/^dist\//, "src/").replace(/\.js$/, ".ts"),
          cleanMain.replace(/^build\//, "src/"),
          cleanMain.replace(/^build\//, "src/").replace(/\.js$/, ".ts"),
          cleanMain.replace(/^out\//, "src/"),
          cleanMain.replace(/^out\//, "src/").replace(/\.js$/, ".ts"),
        ];

        for (const possible of possiblePaths) {
          if (filePathsSet.has(possible)) {
            const cand = getOrCreateCandidate(possible);
            cand.score += 35;
            cand.reasons.push(`Defined as the main/module entry point target ('${mainField}') in package.json`);
            break;
          }
        }
      }

      // 2. Parse package.json start/dev/run scripts
      if (parsedPkg.scripts && typeof parsedPkg.scripts === "object") {
        // Regex to match files referenced in script commands (e.g. ts-node src/index.ts, nodemon app.js)
        const scriptFileRegex = /(?:^|\s)(?:[a-zA-Z0-9_\-\.\/]+)\/([a-zA-Z0-9_\-\.]+)\.(ts|js|tsx|jsx)\b/g;
        const simpleFileRegex = /\b([a-zA-Z0-9_\-\.]+)\.(ts|js|tsx|jsx)\b/g;

        for (const [scriptName, scriptVal] of Object.entries(parsedPkg.scripts)) {
          if (typeof scriptVal !== "string") continue;
          
          // Search for file targets in the command
          const matches = new Set<string>();
          let match;

          // Try paths first
          while ((match = scriptFileRegex.exec(scriptVal)) !== null) {
            matches.add(match[0].trim());
          }
          // Try simple filenames next
          while ((match = simpleFileRegex.exec(scriptVal)) !== null) {
            matches.add(match[0].trim());
          }

          for (const rawMatch of matches) {
            const cleanMatch = rawMatch.replace(/\\/g, "/").replace(/^\.\//, "");
            
            // Check if match exists in file list directly, or resolve its path
            let targetPath: string | null = null;
            if (filePathsSet.has(cleanMatch)) {
              targetPath = cleanMatch;
            } else {
              // Look for any file with matching basename or matching src suffix
              for (const pathOption of filePathsSet) {
                if (pathOption.endsWith(cleanMatch) || path.basename(pathOption) === cleanMatch) {
                  targetPath = pathOption;
                  break;
                }
              }
            }

            if (targetPath) {
              const cand = getOrCreateCandidate(targetPath);
              cand.score += 45;
              cand.reasons.push(`Referenced in package.json '${scriptName}' script: "${scriptVal}"`);
            }
          }
        }
      }
    }

    // 3. Basenames / Filename heuristics
    const entryBasenames = new Set([
      "server.ts", "server.js",
      "main.ts", "main.js",
      "app.ts", "app.js",
      "index.ts", "index.js",
      "index.tsx", "index.jsx"
    ]);

    for (const filePath of filePaths) {
      const base = path.basename(filePath);
      const ext = path.extname(filePath).toLowerCase();
      if (!entryBasenames.has(base)) continue;

      const cleanPath = filePath.replace(/\\/g, "/");
      const cand = getOrCreateCandidate(cleanPath);

      // Score based on file type / depth
      if (cleanPath.startsWith("src/") || cleanPath.startsWith("backend/src/")) {
        cand.score += 25;
        cand.reasons.push(`Follows standard source directory entry convention: '${cleanPath}'`);
      } else if (!cleanPath.includes("/")) {
        cand.score += 20;
        cand.reasons.push(`Located at the repository root directory: '${cleanPath}'`);
      } else if (cleanPath.startsWith("app/")) {
        cand.score += 15;
        cand.reasons.push(`Located in Next.js/modern app directory layout: '${cleanPath}'`);
      } else {
        cand.score += 10;
        cand.reasons.push(`Matches common entry file name format: '${cleanPath}'`);
      }
    }

    // 4. Graph Architecture Analytics
    if (graph && graph.graphNodes) {
      for (const [filePath, node] of Object.entries(graph.graphNodes)) {
        const cleanPath = filePath.replace(/\\/g, "/");
        // Skip external generated nodes
        if (filePath.startsWith("external-")) continue;

        // In-degree 0 (no internal file imports it) AND imports other files (out-degree > 0)
        const incomingCount = (node as any).incoming?.length ?? 0;
        const outgoingCount = (node as any).outgoing?.length ?? 0;

        if (incomingCount === 0 && outgoingCount > 0) {
          // Verify it's a code file (excluding config or setup scripts if we can)
          const ext = path.extname(cleanPath).toLowerCase();
          if (ext === ".ts" || ext === ".js" || ext === ".tsx" || ext === ".jsx") {
            const cand = getOrCreateCandidate(cleanPath);
            cand.score += 30;
            cand.reasons.push("Acts as a root coordinator (graph in-degree of 0, out-degree > 0)");
          }
        }
      }
    }

    // 5. Code Pattern checks (Scan code files of the top baseline candidates)
    const sortedBaselines = Array.from(candidatesMap.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, 10); // Check top 10 candidates to keep scanning fast

    for (const cand of sortedBaselines) {
      try {
        const fullPath = path.join(repoPath, cand.filePath);
        const stats = await fs.stat(fullPath);
        if (stats.isFile() && stats.size < 150 * 1024) { // Only read files under 150KB
          const content = await fs.readFile(fullPath, "utf8");

          // check for server listen calls
          if (content.includes(".listen(") || content.includes("listen(")) {
            cand.score += 30;
            cand.reasons.push("Contains server port listener instantiation (e.g. .listen())");
          }

          // check for NestJS NestFactory bootstrap
          if (content.includes("NestFactory.create") || content.includes("@Module(")) {
            cand.score += 35;
            cand.reasons.push("Initializes NestJS application bootstrapper (NestFactory)");
          }

          // check for express/fastify/koa instantiation
          if (content.includes("express()") || content.includes("fastify(") || content.includes("new Koa(")) {
            cand.score += 25;
            cand.reasons.push("Instantiates backend framework application object");
          }

          // check for hono instantiation
          if (content.includes("new Hono(") || content.includes("export default app")) {
            cand.score += 25;
            cand.reasons.push("Instantiates Hono routing framework application object");
          }
        }
      } catch {
        // Safe fallback if file read fails
      }
    }

    // Filter candidates with a positive score and sort by score descending
    const entryPoints: EntryPointInfo[] = Array.from(candidatesMap.values())
      .filter((c) => c.score > 0)
      .map((c) => ({
        filePath: c.filePath,
        confidence: Math.min(c.score, 100), // Cap at 100%
        reasons: Array.from(new Set(c.reasons)), // Deduplicate reasons
      }))
      .sort((a, b) => b.confidence - a.confidence);

    logger.info(
      {
        primaryEntryPoint: entryPoints[0]?.filePath || "None",
        confidence: entryPoints[0]?.confidence || 0,
        candidatesCount: entryPoints.length,
      },
      "🔍 Entry Point Detector completed analysis"
    );

    return entryPoints;
  }
}
