import fs from "fs/promises";
import path from "path";
import { logger } from "../../core/logger/index.js";

export interface ParsedPackageJson {
  exists: boolean;
  name: string | null;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  scripts: Record<string, string>;
  workspaces: string[];
}

export class PackageAnalyzer {
  /**
   * Reads and parses a package.json file from the specified directory.
   */
  static async analyze(dirPath: string): Promise<ParsedPackageJson> {
    const packageJsonPath = path.join(dirPath, "package.json");
    
    try {
      const content = await fs.readFile(packageJsonPath, "utf8");
      const pkg = JSON.parse(content);

      const dependencies = pkg.dependencies || {};
      const devDependencies = pkg.devDependencies || {};
      const scripts = pkg.scripts || {};
      let workspaces: string[] = [];

      if (pkg.workspaces) {
        if (Array.isArray(pkg.workspaces)) {
          workspaces = pkg.workspaces;
        } else if (typeof pkg.workspaces === "object" && Array.isArray(pkg.workspaces.packages)) {
          workspaces = pkg.workspaces.packages;
        }
      }

      return {
        exists: true,
        name: pkg.name || null,
        dependencies,
        devDependencies,
        scripts,
        workspaces,
      };
    } catch (err: any) {
      logger.debug({ dirPath, err: err.message }, "No package.json found or failed to parse");
      return {
        exists: false,
        name: null,
        dependencies: {},
        devDependencies: {},
        scripts: {},
        workspaces: [],
      };
    }
  }
}
