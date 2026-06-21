import { FastifyInstance, FastifyPluginAsync } from "fastify";
import { z } from "zod";
import fs from "fs/promises";
import path from "path";
import { analysisQueue, redisConnection, isInMemoryMode } from "../jobs/analysis.queue.js";
import { getJobStatus, getJobResult, getJobGraph, getJobRepoPath, runAnalysisJob } from "../jobs/analysis.worker.js";
import { StorageService } from "../modules/upload/storage.service.js";
import { UploadFailedError, JobNotFoundError } from "../core/errors/index.js";
import { logger } from "../core/logger/index.js";
import { GraphQueryService } from "../modules/graph/graph-query.service.js";
import { GraphBuilderService } from "../modules/graph/graph-builder.service.js";
import { GraphValidatorService } from "../modules/graph/graph-validator.service.js";
import { ImpactAnalysisService } from "../modules/impact/impact-analysis.service.js";
import { ArchitectureDiffService } from "../modules/architecture/architecture-diff.service.js";
import { LayerDetectorService } from "../modules/architecture/layer-detector.service.js";
import { TraceBuilderService } from "../modules/execution-trace/trace-builder.service.js";
import { FeatureBuilderService } from "../modules/feature-map/feature-builder.service.js";

const AnalyzeRequestSchema = z.object({
  url: z.string().url({ message: "Invalid GitHub repository URL" }).optional(),
  path: z.string().optional(),
  source: z.enum(["github", "local"]).optional(),
});

export const apiRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // Register multipart support context if needed (handled in app.ts, but standard Fastify practice)
  
  /**
   * POST /api/analyze
   * Enqueue a new analysis job for a GitHub URL, uploaded ZIP file, or local path.
   */
  fastify.post("/api/analyze", async (request, reply) => {
    // Check if multipart request (ZIP file) or JSON request (GitHub URL or Local Path)
    const contentType = request.headers["content-type"] || "";
    
    let repoId = Math.random().toString(36).substring(2, 11);
    let jobId = Math.random().toString(36).substring(2, 11);
    let repoName = `repo-${repoId}`;
    let source: "github" | "zip" | "local" = "github";
    let repoPath = "";
    let gitUrl: string | undefined;

    if (contentType.includes("multipart")) {
      source = "zip";
      const parts = request.parts();
      let fileSaved = false;

      for await (const part of parts) {
        if (part.type === "file") {
          const buffer = await part.toBuffer();
          repoName = part.filename.replace(/\.zip$/i, "");
          // Save ZIP file to the workspace
          repoPath = await StorageService.saveFileToWorkspace(repoId, part.filename, buffer);
          fileSaved = true;
        }
      }

      if (!fileSaved) {
        throw new UploadFailedError("No ZIP file uploaded");
      }
    } else {
      // Parse JSON request
      const body = request.body;
      const result = AnalyzeRequestSchema.safeParse(body);
      if (!result.success) {
        reply.code(400);
        return { error: "Validation failed", details: result.error.format() };
      }

      const reqData = result.data;
      
      // Determine if local path scanning is requested
      if (reqData.source === "local" || reqData.path) {
        if (!reqData.path) {
          reply.code(400);
          return { error: "Path parameter is required for local source analysis" };
        }

        const resolvedPath = path.resolve(reqData.path);
        
        // Security check: restrict path traversal outside approved folders
        const normalized = resolvedPath.toLowerCase();
        const isAllowed = normalized.startsWith("c:\\users\\91798\\documents") || normalized.startsWith("c:/users/91798/documents");
        if (!isAllowed) {
          reply.code(403);
          return { error: "Access denied: Local path is outside authorized workspaces" };
        }

        try {
          const stats = await fs.stat(resolvedPath);
          if (!stats.isDirectory()) {
            reply.code(400);
            return { error: "Provided path is not a directory" };
          }
        } catch (err) {
          reply.code(400);
          return { error: "Provided path does not exist on host machine" };
        }

        source = "local";
        repoPath = resolvedPath;
        repoName = path.basename(resolvedPath) || "local-repo";
      } else {
        // GitHub URL source
        if (!reqData.url) {
          reply.code(400);
          return { error: "Either url (for github) or path (for local) must be provided" };
        }
        gitUrl = reqData.url;
        const urlParts = gitUrl.split("/");
        repoName = urlParts[urlParts.length - 1] || "github-repo";
        source = "github";
        // Create path representation
        repoPath = await StorageService.createWorkspace(repoId);
      }
    }

    // Queue background task via BullMQ or run inline (in-memory fallback mode)
    if (isInMemoryMode) {
      // In dev mode without Redis: run job inline in background (non-blocking)
      await redisConnectionSetStatus(jobId, "uploaded");
      setImmediate(() => {
        runAnalysisJob({ jobId, repoId, repoName, source, repoPath, url: gitUrl })
          .catch((err) => logger.error({ jobId, err }, "❌ Inline job failed"));
      });
    } else {
      await analysisQueue.add(jobId, {
        jobId,
        repoId,
        repoName,
        source,
        repoPath,
        url: gitUrl,
      });
      // Set initial job status
      await redisConnectionSetStatus(jobId, "uploaded");
    }

    logger.info({ jobId, repoId, repoName, source }, "🚀 Enqueued analysis job");

    reply.code(202);
    return { jobId };
  });

  /**
   * GET /api/analyze/:jobId/status
   */
  fastify.get<{ Params: { jobId: string } }>("/api/analyze/:jobId/status", async (request, reply) => {
    const { jobId } = request.params;
    const status = await getJobStatus(jobId);
    if (status === "unknown") {
      throw new JobNotFoundError(jobId);
    }
    return { status };
  });

  /**
   * GET /api/analyze/:jobId/results
   */
  fastify.get<{ Params: { jobId: string } }>("/api/analyze/:jobId/results", async (request, reply) => {
    const { jobId } = request.params;
    const status = await getJobStatus(jobId);
    
    if (status === "unknown") {
      throw new JobNotFoundError(jobId);
    }

    if (status !== "completed") {
      reply.code(400);
      return { error: "Analysis results not ready yet", status };
    }

    const results = await getJobResult(jobId);
    if (!results) {
      reply.code(500);
      return { error: "Failed to retrieve analysis results" };
    }

    return results;
  });

  /**
   * GET /api/analyze/:jobId/graph/query
   * Executes graph query algorithms (transitive dependents, dependencies, BFS shortest path, cycles, dead code, centrality) on the repository graph.
   */
  fastify.get<{
    Params: { jobId: string };
    Querystring: { action: string; file?: string; targetFile?: string };
  }>("/api/analyze/:jobId/graph/query", async (request, reply) => {
    const { jobId } = request.params;
    const { action, file, targetFile } = request.query;

    const status = await getJobStatus(jobId);
    if (status === "unknown") {
      throw new JobNotFoundError(jobId);
    }

    if (status !== "completed") {
      reply.code(400);
      return { error: "Analysis graph is not ready yet", status };
    }

    const graph = await getJobGraph(jobId);
    if (!graph) {
      reply.code(500);
      return { error: "Failed to retrieve repository dependency graph" };
    }

    switch (action) {
      case "dependents": {
        if (!file) {
          reply.code(400);
          return { error: "Query parameter 'file' is required for action 'dependents'" };
        }
        const incomingDirect = GraphQueryService.findIncoming(graph, file);
        const dependentsTransitive = GraphQueryService.findDependents(graph, file);
        return {
          file,
          direct: incomingDirect,
          transitive: dependentsTransitive,
        };
      }
      case "dependencies": {
        if (!file) {
          reply.code(400);
          return { error: "Query parameter 'file' is required for action 'dependencies'" };
        }
        const outgoingDirect = GraphQueryService.findOutgoing(graph, file);
        const dependenciesTransitive = GraphQueryService.findDependencies(graph, file);
        return {
          file,
          direct: outgoingDirect,
          transitive: dependenciesTransitive,
        };
      }
      case "path": {
        if (!file || !targetFile) {
          reply.code(400);
          return { error: "Query parameters 'file' and 'targetFile' are required for action 'path'" };
        }
        const pathResult = GraphQueryService.findPath(graph, file, targetFile);
        return { source: file, target: targetFile, path: pathResult };
      }
      case "circular": {
        const cycles = GraphQueryService.findCircularDependencies(graph);
        return { circularDependencies: cycles };
      }
      case "deadcode": {
        const deadCode = GraphQueryService.findDeadCodeCandidates(graph);
        return { deadCodeCandidates: deadCode };
      }
      case "centrality": {
        const mostConnected = GraphQueryService.getMostConnectedFiles(graph, 10);
        return { mostConnectedFiles: mostConnected };
      }
      case "visualization": {
        const visualizationData = GraphBuilderService.toVisualization(graph);
        return { visualization: visualizationData };
      }
      case "validate": {
        const issues = GraphValidatorService.validateGraph(graph);
        return { isValid: issues.filter((i) => i.severity === "error").length === 0, issues };
      }
      default: {
        reply.code(400);
        return { error: "Invalid action. Supported values: dependents, dependencies, path, circular, deadcode, centrality, visualization, validate" };
      }
    }
  });

  /**
   * GET /api/analyze/:jobId/routes
   */
  fastify.get<{ Params: { jobId: string } }>("/api/analyze/:jobId/routes", async (request, reply) => {
    const { jobId } = request.params;
    const status = await getJobStatus(jobId);
    
    if (status === "unknown") {
      throw new JobNotFoundError(jobId);
    }

    if (status !== "completed") {
      reply.code(400);
      return { error: "Analysis results not ready yet", status };
    }

    const results = await getJobResult(jobId);
    if (!results) {
      reply.code(500);
      return { error: "Failed to retrieve analysis results" };
    }

    return { routes: results.routes || [] };
  });

  /**
   * GET /api/analyze/:jobId/openapi
   * Serves the generated OpenAPI 3.0 specification.
   */
  fastify.get<{ Params: { jobId: string } }>("/api/analyze/:jobId/openapi", async (request, reply) => {
    const { jobId } = request.params;
    const status = await getJobStatus(jobId);
    
    if (status === "unknown") {
      throw new JobNotFoundError(jobId);
    }

    if (status !== "completed") {
      reply.code(400);
      return { error: "Analysis results not ready yet", status };
    }

    const results = await getJobResult(jobId);
    if (!results) {
      reply.code(500);
      return { error: "Failed to retrieve analysis results" };
    }

    const { OpenApiExporter } = await import("../modules/routes/openapi-exporter.js");
    const openApiSpec = OpenApiExporter.generateSpec("Repository", results.routes || []);
    
    return openApiSpec;
  });

  /**
   * GET /api/analyze/:jobId/ai-summary
   * Returns the AI-generated architecture summary (Phase 11).
   */
  fastify.get<{ Params: { jobId: string } }>("/api/analyze/:jobId/ai-summary", async (request, reply) => {
    const { jobId } = request.params;
    const status = await getJobStatus(jobId);
    if (status === "unknown") throw new JobNotFoundError(jobId);
    if (status !== "completed") {
      reply.code(400);
      return { error: "Analysis not completed yet", status };
    }
    const results = await getJobResult(jobId);
    if (!results) { reply.code(500); return { error: "Failed to retrieve results" }; }
    return { aiSummary: results.aiSummary || null };
  });

  /**
   * GET /api/analyze/:jobId/onboarding
   * Returns the Developer Onboarding Guide (Phase 12).
   */
  fastify.get<{ Params: { jobId: string } }>("/api/analyze/:jobId/onboarding", async (request, reply) => {
    const { jobId } = request.params;
    const status = await getJobStatus(jobId);
    if (status === "unknown") throw new JobNotFoundError(jobId);
    if (status !== "completed") {
      reply.code(400);
      return { error: "Analysis not completed yet", status };
    }
    const results = await getJobResult(jobId);
    if (!results) { reply.code(500); return { error: "Failed to retrieve results" }; }
    return { onboarding: results.onboarding || null };
  });

  /**
   * POST /api/analyze/:jobId/chat
   * Chat Q&A with the codebase under analysis using multi-agent AI system.
   */
  fastify.post<{
    Params: { jobId: string };
    Body: { message: string };
  }>("/api/analyze/:jobId/chat", async (request, reply) => {
    const { jobId } = request.params;
    const { message } = request.body;

    if (!message) {
      reply.code(400);
      return { error: "Query parameter 'message' is required in request body" };
    }

    const status = await getJobStatus(jobId);
    if (status === "unknown") {
      throw new JobNotFoundError(jobId);
    }

    if (status !== "completed") {
      reply.code(400);
      return { error: "Analysis must be completed before chatting with the codebase", status };
    }

    // Retrieve cached analysis results and path
    const results = await getJobResult(jobId);
    const repoPath = await getJobRepoPath(jobId);

    if (!results || !repoPath) {
      reply.code(500);
      return { error: "Failed to retrieve analysis workspace results" };
    }

    // Coordinate query through multi-agent orchestrator
    const { AgentOrchestrator } = await import("../modules/ai/agents.js");
    const orchestrator = new AgentOrchestrator();
    const chatResult = await orchestrator.coordinateAnalysis(message, repoPath, results);

    const chatResponseMsg = {
      id: Math.random().toString(36).substring(2, 11),
      role: "assistant" as const,
      content: chatResult.answer,
      timestamp: new Date().toISOString(),
      agentLogs: chatResult.agentLogs,
    };

    return { message: chatResponseMsg };
  });

  /**
   * GET /api/analyze/:jobId/impact?file=authService.ts
   * Returns the full impact analysis for a given file — direct/transitive dependents,
   * impact score, and critical dependency paths.
   */
  fastify.get<{
    Params: { jobId: string };
    Querystring: { file?: string };
  }>("/api/analyze/:jobId/impact", async (request, reply) => {
    const { jobId } = request.params;
    const { file } = request.query;

    if (!file) {
      reply.code(400);
      return { error: "Query parameter 'file' is required" };
    }

    const status = await getJobStatus(jobId);
    if (status === "unknown") throw new JobNotFoundError(jobId);
    if (status !== "completed") {
      reply.code(400);
      return { error: "Analysis must be completed first", status };
    }

    const graph = await getJobGraph(jobId);
    const results = await getJobResult(jobId);
    if (!graph || !results) {
      reply.code(500);
      return { error: "Failed to retrieve analysis graph" };
    }

    const realFiles = (results.files ?? []).filter(
      (f: any) => !f.path.startsWith("ROUTE:") && !f.path.startsWith("ENV:") && !f.path.startsWith("DB:") && !f.path.startsWith("ENTITY:")
    );

    const impact = ImpactAnalysisService.analyze(file, graph, realFiles.length);
    const timeline = ImpactAnalysisService.getRepositoryTimeline(graph, 20);

    return { impact, timeline };
  });

  /**
   * GET /api/analyze/:jobId/static
   * Returns the full static analysis report (dead code, cycles, complexity, etc.)
   */
  fastify.get<{
    Params: { jobId: string };
  }>("/api/analyze/:jobId/static", async (request, reply) => {
    const { jobId } = request.params;

    const status = await getJobStatus(jobId);
    if (status === "unknown") throw new JobNotFoundError(jobId);
    if (status !== "completed") {
      reply.code(400);
      return { error: "Analysis must be completed first", status };
    }

    const results = await getJobResult(jobId);
    if (!results) {
      reply.code(500);
      return { error: "Failed to retrieve analysis results" };
    }

    if (!results.staticAnalysis) {
      reply.code(404);
      return { error: "Static analysis not available for this job — re-analyze to generate" };
    }

    return results.staticAnalysis;
  });

  /**
   * GET /api/analyze/:jobId/timeline
   * Returns the repository file importance timeline.
   */
  fastify.get<{
    Params: { jobId: string };
  }>("/api/analyze/:jobId/timeline", async (request, reply) => {
    const { jobId } = request.params;

    const status = await getJobStatus(jobId);
    if (status === "unknown") throw new JobNotFoundError(jobId);

    const graph = await getJobGraph(jobId);
    if (!graph) {
      reply.code(404);
      return { error: "Graph not available for this job" };
    }

    const timeline = ImpactAnalysisService.getRepositoryTimeline(graph, 25);
    return { timeline };
  });

  /**
   * GET /api/analyze/jobs
   * Lists all past enqueued analysis runs from Redis.
   */
  fastify.get("/api/analyze/jobs", async (request, reply) => {
    const keys = await redisConnection.keys("job:*:status");
    const jobs = [];
    for (const key of keys) {
      const jobId = key.split(":")[1];
      const status = await redisConnection.get(key);
      const repoPath = await redisConnection.get(`job:${jobId}:repoPath`);
      const resultData = await redisConnection.get(`job:${jobId}:result`);
      let repoName = "Unknown";
      let totalFiles = 0;
      let totalRoutes = 0;
      if (resultData) {
        try {
          const res = JSON.parse(resultData);
          repoName = res.tree?.name || res.overview?.repoName || repoName;
          totalFiles = res.overview?.totalFiles || 0;
          totalRoutes = res.overview?.totalRoutes || 0;
        } catch {}
      }
      jobs.push({
        jobId,
        status,
        repoName,
        repoPath,
        totalFiles,
        totalRoutes,
      });
    }
    return { jobs };
  });

  /**
   * GET /api/analyze/:jobId/compare/:compareJobId
   * Computes architecture diff between jobId (baseline) and compareJobId (comparison).
   */
  fastify.get<{ Params: { jobId: string; compareJobId: string } }>(
    "/api/analyze/:jobId/compare/:compareJobId",
    async (request, reply) => {
      const { jobId, compareJobId } = request.params;

      const statusA = await getJobStatus(jobId);
      const statusB = await getJobStatus(compareJobId);

      if (statusA !== "completed" || statusB !== "completed") {
        reply.code(400);
        return { error: "Both jobs must be completed before comparison", statusA, statusB };
      }

      const resultA = await getJobResult(jobId);
      const resultB = await getJobResult(compareJobId);

      if (!resultA || !resultB) {
        reply.code(500);
        return { error: "Failed to retrieve results for comparison" };
      }

      const diff = ArchitectureDiffService.compare(resultA, resultB);
      return diff;
    }
  );

  /**
   * GET /api/analyze/:jobId/architecture
   * Returns classified layers of codebase files.
   */
  fastify.get<{ Params: { jobId: string } }>(
    "/api/analyze/:jobId/architecture",
    async (request, reply) => {
      const { jobId } = request.params;
      const status = await getJobStatus(jobId);
      if (status === "unknown") throw new JobNotFoundError(jobId);
      if (status !== "completed") {
        reply.code(400);
        return { error: "Analysis results not ready yet", status };
      }
      const result = await getJobResult(jobId);
      if (!result) {
        reply.code(550);
        return { error: "Failed to retrieve analysis results" };
      }
      const layers = LayerDetectorService.detect(result);
      return { layers };
    }
  );

  /**
   * GET /api/analyze/:jobId/traces
   * Returns generated execution traces for all routes in codebase.
   */
  fastify.get<{ Params: { jobId: string } }>(
    "/api/analyze/:jobId/traces",
    async (request, reply) => {
      const { jobId } = request.params;
      const status = await getJobStatus(jobId);
      if (status === "unknown") throw new JobNotFoundError(jobId);
      if (status !== "completed") {
        reply.code(400);
        return { error: "Analysis results not ready yet", status };
      }
      const result = await getJobResult(jobId);
      const repoPath = await getJobRepoPath(jobId);
      if (!result || !repoPath) {
        reply.code(500);
        return { error: "Failed to retrieve job context" };
      }
      const traces = await TraceBuilderService.buildTraces(repoPath, result);
      return { traces };
    }
  );

  /**
   * GET /api/analyze/:jobId/features
   * Returns generated business features and their flows.
   */
  fastify.get<{ Params: { jobId: string } }>(
    "/api/analyze/:jobId/features",
    async (request, reply) => {
      const { jobId } = request.params;
      const status = await getJobStatus(jobId);
      if (status === "unknown") throw new JobNotFoundError(jobId);
      if (status !== "completed") {
        reply.code(400);
        return { error: "Analysis results not ready yet", status };
      }
      const result = await getJobResult(jobId);
      if (!result) {
        reply.code(550);
        return { error: "Failed to retrieve analysis results" };
      }
      const features = FeatureBuilderService.buildFeatures(result);
      return { features };
    }
  );

  /**
   * GET /api/analyze/:jobId/subway
   * Returns generated city-wide subway map network and layout nodes/edges.
   */
  fastify.get<{ Params: { jobId: string } }>(
    "/api/analyze/:jobId/subway",
    async (request, reply) => {
      const { jobId } = request.params;
      const status = await getJobStatus(jobId);
      if (status === "unknown") throw new JobNotFoundError(jobId);
      if (status !== "completed") {
        reply.code(400);
        return { error: "Analysis results not ready yet", status };
      }
      const result = await getJobResult(jobId);
      if (!result) {
        reply.code(550);
        return { error: "Failed to retrieve analysis results" };
      }

      const { SubwayBuilderService } = await import("../modules/subway-map/subway-builder.service.js");
      const { SubwayLayoutService } = await import("../modules/subway-map/subway-layout.service.js");

      const subway = SubwayBuilderService.buildSubway(result);
      const layout = SubwayLayoutService.layout(subway);

      return {
        subway,
        layout
      };
    }
  );

  /**
   * GET /api/analyze/:jobId/file
   * Serves file content safely.
   */
  fastify.get<{ Params: { jobId: string }; Querystring: { path?: string } }>(
    "/api/analyze/:jobId/file",
    async (request, reply) => {
      const { jobId } = request.params;
      const { path: filePath } = request.query;

      if (!filePath) {
        reply.code(400);
        return { error: "Query parameter 'path' is required" };
      }

      const status = await getJobStatus(jobId);
      if (status === "unknown") throw new JobNotFoundError(jobId);

      const repoPath = await getJobRepoPath(jobId);
      if (!repoPath) {
        reply.code(550);
        return { error: "Failed to retrieve job context" };
      }

      const resolved = path.resolve(repoPath, filePath);
      // Security: ensure resolved path is within repoPath
      if (!resolved.startsWith(repoPath)) {
        reply.code(403);
        return { error: "Access denied: file is outside workspace scope" };
      }

      try {
        const content = await fs.readFile(resolved, "utf8");
        return { content };
      } catch (err: any) {
        reply.code(404);
        return { error: "File not found or unreadable", details: err.message };
      }
    }
  );


  /**
   * GET /health
   */
  fastify.get("/health", async () => {
    return { status: "ok" };
  });

  /**
   * GET /health/redis
   */
  fastify.get("/health/redis", async (request, reply) => {
    try {
      const pingRes = await redisConnection.ping();
      if (pingRes === "PONG") {
        return { redis: "connected" };
      }
      reply.code(500);
      return { redis: "error", details: "Ping response was not PONG" };
    } catch (err: any) {
      reply.code(500);
      return { redis: "disconnected", error: err.message };
    }
  });
};

// Internal helper import/export adjustment for setting initial state
import { setJobStatus as redisConnectionSetStatus } from "../jobs/analysis.worker.js";
