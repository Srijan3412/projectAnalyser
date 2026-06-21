import { logger } from "./core/logger/index.js";
import { redisConnection, connectionReady } from "./jobs/analysis.queue.js";
import { startAnalysisWorker, analysisWorker } from "./jobs/analysis.worker.js";
import { startCleanupWorker } from "./jobs/cleanup.worker.js";

async function start() {
  logger.info("⚙️ Starting background worker process...");
  try {
    // Wait for Redis (or fallback mock) to be ready before starting workers
    await connectionReady;

    // Start background analysis queue worker
    startAnalysisWorker();

    // Start background storage cleanup worker
    startCleanupWorker();

    logger.info("⚙️ Worker process initialized and listening for jobs.");

    // Graceful Shutdown Handler
    const shutdown = async (signal: string) => {
      logger.info(`Received ${signal}. Shutting down worker gracefully...`);

      // Close queue workers
      await analysisWorker.close();

      // Close redis connections
      await redisConnection.quit();

      logger.info("👋 Worker process terminated cleanly.");
      process.exit(0);
    };

    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));
  } catch (err) {
    logger.error(err, "💥 Worker process crashed during initialization!");
    process.exit(1);
  }
}

start();
