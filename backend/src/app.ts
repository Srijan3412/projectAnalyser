import fastify, { FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { apiRoutes } from "./routes/index.js";
import rateLimit from "@fastify/rate-limit";
import { logger } from "./core/logger/index.js";
import { AppError } from "./core/errors/index.js";
import { StorageService } from "./modules/upload/storage.service.js";
import { config } from "./core/config/index.js";

export async function buildApp(): Promise<FastifyInstance> {
  const app = fastify({
    logger: false, // Disabling default logger to use our Pino implementation
  });

  // Enable CORS
  const corsOrigins = config.ALLOWED_ORIGINS
    ? config.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
    : (config.FRONTEND_URL ? [config.FRONTEND_URL] : "*");

  await app.register(cors, {
    origin: corsOrigins,
    methods: ["GET", "POST", "OPTIONS"],
  });

  // Enable Rate Limiting (10 requests per minute)
  await app.register(rateLimit, {
    max: 10,
    timeWindow: "1 minute",
  });

  // Enable multipart support for file uploads (ZIP files)
  await app.register(multipart, {
    limits: {
      fileSize: 50 * 1024 * 1024, // 50MB limit
    },
  });

  // Register API routes
  await app.register(apiRoutes);

  // Global Error Handler
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      logger.warn({ err: error }, `Application warning: ${error.message}`);
      reply.status(error.statusCode).send({
        error: error.code,
        message: error.message,
      });
      return;
    }

    logger.error({ err: error }, "Unhandled server error occurred");
    reply.status(500).send({
      error: "INTERNAL_SERVER_ERROR",
      message: "An unexpected error occurred on the server.",
    });
  });

  // Prepare directories
  await StorageService.ensureStorageDirectories();

  return app;
}
