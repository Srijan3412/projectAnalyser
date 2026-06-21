import path from "path";
import fs from "fs/promises";

export interface PathMapping {
  pattern: RegExp;
  replacements: string[];
}

export class DependencyResolver {
  /**
   * Parses tsconfig/jsconfig compilerOptions.paths mappings into regular expressions.
   */
  static parsePathMappings(compilerPaths: Record<string, string[]>): PathMapping[] {
    const mappings: PathMapping[] = [];
    for (const [key, val] of Object.entries(compilerPaths)) {
      // Escape regex characters except '*'
      const escapedKey = key.replace(/[.+^${}()|[\]\\]/g, "\\$&");
      const regexStr = "^" + escapedKey.replace(/\*/g, "(.*)") + "$";
      const pattern = new RegExp(regexStr);
      mappings.push({
        pattern,
        replacements: val,
      });
    }
    return mappings;
  }

  /**
   * Resolves a path alias (e.g. "@/components/Button") using the parsed mappings.
   */
  static resolvePathAlias(importString: string, mappings: PathMapping[]): string | null {
    for (const mapping of mappings) {
      const match = importString.match(mapping.pattern);
      if (match) {
        for (const replacement of mapping.replacements) {
          let result = replacement;
          if (match[1] !== undefined) {
            result = replacement.replace(/\*/g, match[1]);
          }
          return result;
        }
      }
    }
    return null;
  }

  /**
   * Searches and parses tsconfig.json or jsconfig.json in the workspace root.
   */
  static async loadPathMappings(workspaceDir: string): Promise<PathMapping[]> {
    const tsconfigPath = path.join(workspaceDir, "tsconfig.json");
    const jsconfigPath = path.join(workspaceDir, "jsconfig.json");

    let configContent = "";
    try {
      configContent = await fs.readFile(tsconfigPath, "utf8");
    } catch {
      try {
        configContent = await fs.readFile(jsconfigPath, "utf8");
      } catch {
        return [];
      }
    }

    try {
      // Strip JSON comments
      const cleanJson = configContent
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*/g, "");
      const parsed = JSON.parse(cleanJson);
      const paths = parsed?.compilerOptions?.paths;
      if (paths && typeof paths === "object") {
        return this.parsePathMappings(paths);
      }
    } catch {
      // Return empty mappings on parse failure
    }
    return [];
  }

  /**
   * Resolves an import string in a source file to a relative file path in the workspace.
   * Supports relative paths and path aliases mapped from tsconfig/jsconfig.
   * 
   * @param sourceFileRelativePath The path of the file containing the import (e.g., "src/app.ts")
   * @param importString The import specifier string (e.g., "@/components/button")
   * @param allFiles List of all scanned file paths in the workspace
   * @param pathMappings Parsed path alias mappings
   * @returns Resolved relative path or null if third-party/external
   */
  static resolveImport(
    sourceFileRelativePath: string,
    importString: string,
    allFiles: string[],
    pathMappings: PathMapping[] = []
  ): string | null {
    // 1. Try path alias resolution first
    const aliasResolved = this.resolvePathAlias(importString, pathMappings);
    if (aliasResolved) {
      const filePathsSet = new Set(allFiles.map((f) => f.replace(/\\/g, "/")));
      const extensions = ["", ".ts", ".tsx", ".js", ".jsx", "/index.ts", "/index.tsx", "/index.js", "/index.jsx"];

      for (const ext of extensions) {
        const candidate = `${aliasResolved}${ext}`;
        const cleanCandidate = path.normalize(candidate).replace(/\\/g, "/");
        if (filePathsSet.has(cleanCandidate)) {
          return cleanCandidate;
        }
      }
      return null;
    }

    // 2. Standard relative resolution (only if starts with . or /)
    if (!importString.startsWith(".") && !importString.startsWith("/")) {
      return null;
    }

    const filePathsSet = new Set(allFiles.map((f) => f.replace(/\\/g, "/")));
    const sourceDir = path.dirname(sourceFileRelativePath);
    
    const resolvedPath = path.join(sourceDir, importString);
    const normalizedResolved = resolvedPath.replace(/\\/g, "/");

    const extensions = ["", ".ts", ".tsx", ".js", ".jsx", "/index.ts", "/index.tsx", "/index.js", "/index.jsx"];

    for (const ext of extensions) {
      const candidate = `${normalizedResolved}${ext}`;
      const cleanCandidate = path.normalize(candidate).replace(/\\/g, "/");

      if (filePathsSet.has(cleanCandidate)) {
        return cleanCandidate;
      }
    }

    return null;
  }
}
