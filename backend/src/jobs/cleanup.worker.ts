import { StorageService } from "../modules/upload/storage.service.js";
import { logger } from "../core/logger/index.js";

// Run every 24 hours (in milliseconds)
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
const MAX_AGE_DAYS = 7; // Delete repository workspaces older than 7 days

export function startCleanupWorker(): void {
  logger.info({ intervalMs: CLEANUP_INTERVAL_MS, maxAgeDays: MAX_AGE_DAYS }, "🧹 Storage Cleanup Worker service started");

  // Run immediately on boot
  StorageService.cleanupOldRepositories(MAX_AGE_DAYS).catch((err) => {
    logger.error({ err }, "❌ Initial repository storage cleanup failed");
  });

  // Schedule next runs
  setInterval(async () => {
    try {
      await StorageService.cleanupOldRepositories(MAX_AGE_DAYS);
    } catch (err) {
      logger.error({ err }, "❌ Repository storage cleanup cycle failed");
    }
  }, CLEANUP_INTERVAL_MS);
}
