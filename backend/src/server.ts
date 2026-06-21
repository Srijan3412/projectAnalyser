import { buildApp } from "./app.js";
import { config } from "./core/config/index.js";
import { logger } from "./core/logger/index.js";
import { redisConnection, connectionReady } from "./jobs/analysis.queue.js";

async function start() {
  try {
    // Wait for Redis (or fallback mock) to be ready before building the app
    await connectionReady;

    const app = await buildApp();

    // Bind host to '0.0.0.0' to enable docker and external network accessibility
    await app.listen({ port: config.PORT, host: "0.0.0.0" });
    logger.info(`🚀 Fastify Server listening on http://localhost:${config.PORT}`);

    // Graceful Shutdown Handler
    const shutdown = async (signal: string) => {
      logger.info(`Received ${signal}. Shutting down gracefully...`);

      // Close Fastify server
      await app.close();

      // Close redis connections
      await redisConnection.quit();

      logger.info("👋 Server process terminated.");
      process.exit(0);
    };

    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));
  } catch (err) {
    logger.error(err, "💥 Server initialization crashed!");
    process.exit(1);
  }
}

start();
