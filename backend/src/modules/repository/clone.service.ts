import { simpleGit } from "simple-git";
import { logger } from "../../core/logger/index.js";

export class CloneService {
  static async clone(repoUrl: string, destinationPath: string): Promise<void> {
    logger.info({ repoUrl, destinationPath }, "📥 Starting repository clone process");
    try {
      const git = simpleGit();
      await git.clone(repoUrl, destinationPath, [
        "--depth", "1", // Shallow clone for speed and efficiency
        "--single-branch",
      ]);
      logger.info({ destinationPath }, "📥 Repository clone completed successfully");
    } catch (err: any) {
      logger.error({ err, repoUrl }, "❌ Repository clone failed");
      throw new Error(`Failed to clone git repository: ${err.message}`);
    }
  }
}
