import fs from "fs/promises";
import path from "path";
import { FileParserService } from "./file-parser.service.js";
import { DependencyResolver } from "./dependency-resolver.js";
import { FileNode, DependencyEdge } from "./types.js";
import { logger } from "../../core/logger/index.js";

const IGNORED_DIRS = new Set([
  "node_modules",
  "dist",
  "build",
  ".next",
  "coverage",
  ".git",
  "__pycache__",
  "venv",
  "env",
  "target",
  "bin",
  "obj",
]);

const TARGET_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx"]);

export class ASTAnalyzer {
  /**
   * Scans a repository directory, parses all JS/TS files, extracts imports and exports,
   * maps dependencies, and returns structured file nodes and dependency edges.
   * 
   * @param repoPath Absolute or relative path to the repository directory
   */
  static async analyzeRepository(repoPath: string): Promise<{
    files: FileNode[];
    dependencies: DependencyEdge[];
  }> {
    const absoluteRepoPath = path.resolve(repoPath);
    logger.info({ repoPath: absoluteRepoPath }, "🔍 ASTAnalyzer starting repository analysis");

    const allFiles: string[] = [];

    const traverse = async (currentPath: string) => {
      const entries = await fs.readdir(currentPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(currentPath, entry.name);
        const relativePath = path.relative(absoluteRepoPath, fullPath).replace(/\\/g, "/");

        if (entry.isDirectory()) {
          if (IGNORED_DIRS.has(entry.name)) {
            continue;
          }
          await traverse(fullPath);
        } else if (entry.isFile()) {
          allFiles.push(relativePath);
        }
      }
    };

    try {
      await traverse(absoluteRepoPath);
    } catch (err: any) {
      logger.error({ err, repoPath }, "❌ ASTAnalyzer failed to traverse directory");
      throw new Error(`Directory traversal failed: ${err.message}`);
    }

    const pathMappings = await DependencyResolver.loadPathMappings(absoluteRepoPath);

    const files: FileNode[] = [];
    const dependencies: DependencyEdge[] = [];

    for (let i = 0; i < allFiles.length; i++) {
      const relativePath = allFiles[i];
      const absolutePath = path.join(absoluteRepoPath, relativePath);
      const ext = path.extname(relativePath).toLowerCase();

      try {
        const stats = await fs.stat(absolutePath);
        let content = "";
        let lineCount = 0;
        let imports: string[] = [];
        let exports: string[] = [];

        // Only parse target extensions
        if (TARGET_EXTENSIONS.has(ext)) {
          content = await fs.readFile(absolutePath, "utf8");
          lineCount = content.split(/\r?\n/).length;

          const parsed = FileParserService.parseFile(relativePath, content);
          imports = parsed.imports;
          exports = parsed.exports;
        }

        files.push({
          id: `file-${i}`,
          path: relativePath,
          extension: ext.startsWith(".") ? ext.slice(1) : ext,
          imports,
          exports,
          dependencies: [],
          internalImports: [],
          externalImports: [],
          referencedBy: [],
          lineCount,
          size: stats.size,
        });

      } catch (err: any) {
        logger.warn({ relativePath, err: err.message }, "⚠️ ASTAnalyzer failed to process file; using empty fallback");
        files.push({
          id: `file-${i}`,
          path: relativePath,
          extension: ext.startsWith(".") ? ext.slice(1) : ext,
          imports: [],
          exports: [],
          dependencies: [],
          internalImports: [],
          externalImports: [],
          referencedBy: [],
          lineCount: 0,
          size: 0,
        });
      }
    }

    // Resolve dependencies and map internal vs external imports
    for (const node of files) {
      const resolvedDeps: string[] = [];
      const internal: string[] = [];
      const external: string[] = [];

      for (const rawImport of node.imports) {
        const resolved = DependencyResolver.resolveImport(node.path, rawImport, allFiles, pathMappings);
        if (resolved) {
          resolvedDeps.push(resolved);
          internal.push(rawImport);
          dependencies.push({
            source: node.path,
            target: resolved,
            type: "dependency",
          });

          // Track incoming reference (referencedBy) on the target file node
          const targetNode = files.find((f) => f.path === resolved);
          if (targetNode) {
            if (!targetNode.referencedBy.includes(node.path)) {
              targetNode.referencedBy.push(node.path);
            }
          }
        } else {
          // Check if it's an external library or an unresolved path alias
          const isAlias = DependencyResolver.resolvePathAlias(rawImport, pathMappings) !== null;
          if (rawImport.startsWith(".") || rawImport.startsWith("/") || isAlias) {
            // Unresolved internal import
          } else {
            external.push(rawImport);
            dependencies.push({
              source: node.path,
              target: rawImport,
              type: "dependency",
              external: true,
            });
          }
        }
      }

      node.dependencies = Array.from(new Set(resolvedDeps));
      node.internalImports = Array.from(new Set(internal));
      node.externalImports = Array.from(new Set(external));
    }

    logger.info(
      {
        totalFiles: files.length,
        totalDependencies: dependencies.length,
      },
      "🔍 ASTAnalyzer completed repository analysis successfully"
    );

    return {
      files,
      dependencies,
    };
  }
}
