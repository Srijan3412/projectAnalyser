import fs from "fs/promises";
import path from "path";
import { config } from "../../core/config/index.js";
import { logger } from "../../core/logger/index.js";

export class StorageService {
  private static storageRoot = path.resolve(config.STORAGE_DIR);

  static getRepositoriesDir(): string {
    return path.join(this.storageRoot, "repositories");
  }

  static getWorkspacePath(repoId: string): string {
    return path.join(this.getRepositoriesDir(), `repo_${repoId}`);
  }

  static async ensureStorageDirectories(): Promise<void> {
    const reposDir = this.getRepositoriesDir();
    try {
      await fs.mkdir(reposDir, { recursive: true });
      logger.info({ reposDir }, "📁 Repository storage workspace folder verified");
    } catch (err) {
      logger.error({ err, reposDir }, "❌ Failed to create storage root directory");
      throw err;
    }
  }

  static async createWorkspace(repoId: string): Promise<string> {
    const workspacePath = this.getWorkspacePath(repoId);
    await fs.mkdir(workspacePath, { recursive: true });
    logger.info({ repoId, workspacePath }, "📁 Created isolated repository workspace");
    return workspacePath;
  }

  static async deleteWorkspace(repoId: string): Promise<void> {
    const workspacePath = this.getWorkspacePath(repoId);
    await fs.rm(workspacePath, { recursive: true, force: true });
    logger.info({ repoId, workspacePath }, "🗑️ Cleaned up repository workspace");
  }

  static async saveFileToWorkspace(repoId: string, filename: string, buffer: Buffer): Promise<string> {
    const workspacePath = await this.createWorkspace(repoId);
    const filePath = path.join(workspacePath, filename);
    await fs.writeFile(filePath, buffer);
    logger.info({ repoId, filePath }, "💾 File written to workspace");
    return filePath;
  }

  /**
   * Scans the repositories directory and deletes workspaces that haven't been modified
   * in the last maxAgeDays.
   */
  static async cleanupOldRepositories(maxAgeDays: number): Promise<void> {
    const reposDir = this.getRepositoriesDir();
    logger.info({ reposDir, maxAgeDays }, "🧹 Running storage cleanup process");
    
    try {
      const entries = await fs.readdir(reposDir, { withFileTypes: true });
      const now = Date.now();
      const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
      
      let deletedCount = 0;

      for (const entry of entries) {
        if (entry.isDirectory() && entry.name.startsWith("repo_")) {
          const folderPath = path.join(reposDir, entry.name);
          const stats = await fs.stat(folderPath);
          const ageMs = now - stats.mtimeMs;

          if (ageMs > maxAgeMs) {
            logger.info({ folderPath, ageDays: (ageMs / (24 * 60 * 60 * 1000)).toFixed(1) }, "🗑️ Found stale workspace; deleting");
            await fs.rm(folderPath, { recursive: true, force: true });
            deletedCount++;
          }
        }
      }

      logger.info({ deletedCount }, "🧹 Storage cleanup run finished");
    } catch (err) {
      logger.error({ err }, "❌ Error during storage cleanup");
    }
  }
}
