import fs from "fs/promises";
import path from "path";
import { logger } from "../../core/logger/index.js";

const IGNORED_DIRECTORIES = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  "coverage",
  "__pycache__",
  "venv",
  "env",
  "target",
  "bin",
  "obj",
]);

const CODE_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rs", ".java",
  ".cpp", ".c", ".h", ".cs", ".php", ".rb", ".html", ".css",
  ".scss", ".json", ".yml", ".yaml", ".md", ".sh", ".bat", ".ps1"
]);

export interface ScannerResult {
  filePaths: string[];
  totalFiles: number;
  totalFolders: number;
  totalSize: number;
  totalLines: number;
}

export class RepositoryScanner {
  static async scan(dirPath: string): Promise<ScannerResult> {
    const absoluteDirPath = path.resolve(dirPath);
    logger.info({ dirPath: absoluteDirPath }, "🔍 Initiating directory structure scan");

    const filePaths: string[] = [];
    let totalFolders = 0;
    let totalSize = 0;
    let totalLines = 0;

    const traverse = async (currentPath: string) => {
      const entries = await fs.readdir(currentPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(currentPath, entry.name);
        const relativePath = path.relative(absoluteDirPath, fullPath);

        if (entry.isDirectory()) {
          if (IGNORED_DIRECTORIES.has(entry.name)) {
            logger.debug({ name: entry.name }, "Skipping ignored directory");
            continue;
          }
          totalFolders++;
          await traverse(fullPath);
        } else if (entry.isFile()) {
          const stats = await fs.stat(fullPath);
          filePaths.push(relativePath);
          totalSize += stats.size;

          // Compute lines of code for text files (limit size to 5MB to avoid lockups)
          const ext = path.extname(entry.name).toLowerCase();
          if (CODE_EXTENSIONS.has(ext) && stats.size < 5 * 1024 * 1024) {
            try {
              const content = await fs.readFile(fullPath, "utf8");
              const lines = content.split(/\r?\n/).length;
              totalLines += lines;
            } catch (readErr) {
              logger.debug({ fullPath, readErr }, "Failed to read file for line count");
            }
          }
        }
      }
    };

    try {
      await traverse(absoluteDirPath);
    } catch (err: any) {
      logger.error({ err, dirPath }, "❌ Failed to traverse directory");
      throw new Error(`Directory traversal failed: ${err.message}`);
    }

    const result: ScannerResult = {
      filePaths,
      totalFiles: filePaths.length,
      totalFolders,
      totalSize,
      totalLines,
    };

    logger.info(
      {
        totalFiles: result.totalFiles,
        totalFolders: result.totalFolders,
        totalLines: result.totalLines,
        sizeMb: (result.totalSize / (1024 * 1024)).toFixed(2),
      },
      "🔍 Directory scan finished successfully"
    );

    return result;
  }
}
