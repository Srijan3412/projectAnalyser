import AdmZip from "adm-zip";
import path from "path";
import { logger } from "../../core/logger/index.js";

export class ExtractionService {
  static async extract(zipPath: string, destinationDir: string): Promise<void> {
    logger.info({ zipPath, destinationDir }, "📦 Starting ZIP extraction process with security checks");
    try {
      const zip = new AdmZip(zipPath);
      const entries = zip.getEntries();

      let fileCount = 0;
      let totalSize = 0;
      const MAX_FILES = 10000;
      const MAX_UNCOMPRESSED_SIZE = 200 * 1024 * 1024; // 200MB
      const destResolved = path.resolve(destinationDir);

      for (const entry of entries) {
        // 1. Zip Slip / Path Traversal Protection
        const entryResolved = path.resolve(destinationDir, entry.entryName);
        if (!entryResolved.startsWith(destResolved)) {
          throw new Error(`Directory traversal attack detected in entry: ${entry.entryName}`);
        }

        if (!entry.isDirectory) {
          fileCount++;
          totalSize += entry.header.size;
        }

        // 2. Zip Bomb Protection limits
        if (fileCount > MAX_FILES) {
          throw new Error(`ZIP archive contains too many files (Limit: ${MAX_FILES})`);
        }
        if (totalSize > MAX_UNCOMPRESSED_SIZE) {
          throw new Error(`ZIP archive uncompressed size exceeds limit (Limit: 200MB)`);
        }
      }

      zip.extractAllTo(destinationDir, true);
      logger.info({ destinationDir, fileCount, totalSize }, "📦 ZIP extraction completed safely");
    } catch (err: any) {
      logger.error({ err, zipPath }, "❌ ZIP extraction failed");
      throw new Error(`Failed to extract ZIP archive: ${err.message}`);
    }
  }
}
