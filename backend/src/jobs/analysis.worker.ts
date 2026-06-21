import { Worker, Job } from "bullmq";
import fs from "fs/promises";
import path from "path";
import { redisConnection, ANALYSIS_QUEUE_NAME, AnalysisJobData, isInMemoryMode, connectionReady } from "./analysis.queue.js";
import { AiArchitectService } from "../modules/ai-architect/ai-architect.service.js";
import { OnboardingEngine } from "../modules/onboarding/onboarding-engine.js";
import { logger } from "../core/logger/index.js";
import { AnalysisResult } from "@shared/types";
import { CloneService } from "../modules/repository/clone.service.js";
import { ExtractionService } from "../modules/repository/extraction.service.js";
import { RepositoryScanner } from "../modules/repository/scanner.service.js";
import { LanguageDetector } from "../modules/repository/language.detector.js";
import { TreeBuilder } from "../modules/repository/tree.builder.js";
import { ASTAnalyzer } from "../modules/parser/ast-analyzer.service.js";
import { GraphBuilderService } from "../modules/graph/graph-builder.service.js";
import { FrameworkDetectorService } from "../modules/framework/framework-detector.service.js";
import { PackageAnalyzer } from "../modules/framework/package-analyzer.js";
import { EntryPointDetectorService } from "../modules/entry-point/entry-point-detector.service.js";
import { RouteDetectorService } from "../modules/routes/route-detector.service.js";
import { OpenApiExporter } from "../modules/routes/openapi-exporter.js";
import { EnvironmentAnalyzerService } from "../modules/environment/environment-analyzer.service.js";
import { DatabaseDetectorService } from "../modules/database/database-detector.service.js";
import { DatabaseFlowService } from "../modules/database/database-flow.service.js";
import { TransactionFlowService } from "../modules/database/transaction-flow.service.js";
import { ArchitectureGeneratorService } from "../modules/architecture/architecture-generator.service.js";
import { GraphValidatorService } from "../modules/graph/graph-validator.service.js";
import { StaticAnalysisService } from "../modules/static-analysis/static-analysis.service.js";
import { FeatureBuilderService } from "../modules/feature-map/feature-builder.service.js";

export async function getJobStatus(jobId: string): Promise<string> {
  const status = await redisConnection.get(`job:${jobId}:status`);
  return status || "unknown";
}

export async function setJobStatus(jobId: string, status: string): Promise<void> {
  await redisConnection.set(`job:${jobId}:status`, status);
}

export async function getJobResult(jobId: string): Promise<AnalysisResult | null> {
  const data = await redisConnection.get(`job:${jobId}:result`);
  if (!data) return null;
  return JSON.parse(data) as AnalysisResult;
}

export async function setJobResult(jobId: string, result: AnalysisResult): Promise<void> {
  await redisConnection.set(`job:${jobId}:result`, JSON.stringify(result));
}

export async function getJobGraph(jobId: string): Promise<any | null> {
  const data = await redisConnection.get(`job:${jobId}:graph`);
  if (!data) return null;
  return JSON.parse(data);
}

export async function setJobGraph(jobId: string, graph: any): Promise<void> {
  await redisConnection.set(`job:${jobId}:graph`, JSON.stringify(graph));
}

export async function getJobRepoPath(jobId: string): Promise<string | null> {
  return await redisConnection.get(`job:${jobId}:repoPath`);
}

export async function setJobRepoPath(jobId: string, repoPath: string): Promise<void> {
  await redisConnection.set(`job:${jobId}:repoPath`, repoPath);
}

const COMMON_ENTRY_FILES = new Set([
  "src/server.ts", "src/app.ts", "src/index.ts", "src/main.ts",
  "server.ts", "app.ts", "index.ts", "server.js", "app.js", "index.js",
  "app/page.tsx", "pages/index.tsx", "main.py", "app.py", "index.php"
]);

// ─── Core pipeline (shared by BullMQ Worker and inline runner) ───────────────
export async function runAnalysisJob(jobData: AnalysisJobData, updateProgress?: (n: number) => Promise<void>): Promise<any> {
    const { jobId, repoId, repoName, source, repoPath, url } = jobData;
    const prog = updateProgress ?? (async (_n: number) => {});
    logger.info({ jobId, stage: "started", repoId, repoName, source }, "🛠️ Starting background analysis job");

    // Cache the repository absolute path in Redis for AI Q&A access
    await setJobRepoPath(jobId, repoPath);

    const targetDir = source === "zip" ? path.dirname(repoPath) : repoPath;

    try {
      // Step 1: Clone or Extract Repository
      if (source === "github") {
        if (!url) {
          throw new Error("GitHub repository URL is missing in job data");
        }
        await setJobStatus(jobId, "cloning");
        await prog(10);
        await CloneService.clone(url, repoPath);
      } else if (source === "zip") {
        await setJobStatus(jobId, "extracting");
        await prog(10);
        await ExtractionService.extract(repoPath, targetDir);
        
        // Clean up the uploaded ZIP archive file
        await fs.unlink(repoPath).catch((err) => {
          logger.warn({ err, repoPath }, "⚠️ Failed to remove temporary ZIP file");
        });
      } else if (source === "local") {
        // Direct scanning of local directory: no cloning/extraction required
        await setJobStatus(jobId, "scanning");
        await prog(10);
      }

      // Step 2: Recursive Scanner
      await setJobStatus(jobId, "scanning");
      await prog(40);
      const scanResult = await RepositoryScanner.scan(targetDir);

      // Step 3: Language Detection
      await prog(70);
      const langResult = LanguageDetector.detect(scanResult.filePaths);
      const primaryLanguage = langResult.primaryLanguages[0] || "Unknown";

      // Step 3.5: Framework Intelligence Engine
      const frameworkMetadata = await FrameworkDetectorService.detect(
        targetDir,
        scanResult.filePaths,
        { primaryLanguage }
      );

      await prog(80);
      const treeRoot = TreeBuilder.buildTree(scanResult.filePaths, repoName);

      // Step 5: Detect Entry Candidates (baseline names)
      const entryCandidates = scanResult.filePaths.filter((filePath) => {
        const normalized = filePath.replace(/\\/g, "/").toLowerCase();
        return COMMON_ENTRY_FILES.has(normalized) || COMMON_ENTRY_FILES.has(path.basename(normalized));
      });

      // Step 6: Analyze Codebase Dependencies via AST Parsing
      const depResult = await ASTAnalyzer.analyzeRepository(targetDir);

      // Step 6.5: Route Discovery Engine
      const detectedRoutes = await RouteDetectorService.detectRoutes(
        targetDir,
        scanResult.filePaths,
        frameworkMetadata,
        depResult.dependencies
      );
      const routeMetrics = RouteDetectorService.computeMetrics(detectedRoutes);

      // Step 6.8: Inject Route Nodes and Route Edges into Dependency files/edges before building graph
      for (const r of detectedRoutes) {
        const routeNodeId = `ROUTE:${r.method}:${r.path}`;
        
        depResult.files.push({
          id: routeNodeId,
          path: routeNodeId, // Unique path identifier for the node map
          extension: "route",
          imports: [],
          exports: [],
          dependencies: r.chain || [],
          internalImports: r.chain || [],
          externalImports: [],
          referencedBy: [],
          lineCount: 0,
          size: 0,
        });

        // Edge from Route Node to the file defining it
        depResult.dependencies.push({
          source: routeNodeId,
          target: r.file,
          type: "dependency",
        });

        // Edges from Route Node to files in the execution chain
        if (r.chain) {
          for (const chainFile of r.chain) {
            depResult.dependencies.push({
              source: routeNodeId,
              target: chainFile,
              type: "dependency",
            });
          }
        }
      }

      // Step 7.6: Environment variables analysis
      const envAnalysis = await EnvironmentAnalyzerService.analyze(targetDir, scanResult.filePaths);

      // Step 7.7: Database discovery & flow tracking
      const parsedPkg = await PackageAnalyzer.analyze(targetDir);
      const dbDiscovery = await DatabaseDetectorService.discover(targetDir, scanResult.filePaths, parsedPkg);
      const dbFlows = await TransactionFlowService.trace(targetDir, detectedRoutes, dbDiscovery.entities, dbDiscovery.type || "");
      dbDiscovery.flows = dbFlows;

      // Step 7.8: Inject Environment Variable Nodes
      for (const envVar of envAnalysis.envVars) {
        const envNodeId = `ENV:${envVar.name}`;
        depResult.files.push({
          id: envNodeId,
          path: envNodeId,
          extension: "env",
          imports: [],
          exports: [],
          dependencies: [],
          internalImports: [],
          externalImports: [],
          referencedBy: envVar.files,
          lineCount: 0,
          size: 0,
        });

        for (const f of envVar.files) {
          depResult.dependencies.push({
            source: f,
            target: envNodeId,
            type: "dependency",
          });
        }
      }

      // Step 7.85: Inject Database and Entity Nodes
      const dbNodeId = `DB:${dbDiscovery.type || "Database"}`;
      depResult.files.push({
        id: dbNodeId,
        path: dbNodeId,
        extension: "database",
        imports: [],
        exports: [],
        dependencies: [],
        internalImports: [],
        externalImports: [],
        referencedBy: [],
        lineCount: 0,
        size: 0,
      });

      for (const entity of dbDiscovery.entities) {
        const entityNodeId = `ENTITY:${entity.entity}`;
        depResult.files.push({
          id: entityNodeId,
          path: entityNodeId,
          extension: "entity",
          imports: [],
          exports: [],
          dependencies: [],
          internalImports: [],
          externalImports: [],
          referencedBy: [],
          lineCount: 0,
          size: 0,
        });

        // Edge from Entity to Database
        depResult.dependencies.push({
          source: entityNodeId,
          target: dbNodeId,
          type: "dependency",
        });
      }

      // Edge from Route to Entity based on dbFlows
      for (const flow of dbFlows) {
        const routeNodeId = `ROUTE:${flow.method}:${flow.route}`;
        if (flow.entities) {
          for (const ent of flow.entities) {
            depResult.dependencies.push({
              source: routeNodeId,
              target: `ENTITY:${ent}`,
              type: "dependency",
            });
          }
        }
      }

      // Step 7: Build Repository Graph (now includes route, env, database & entity nodes)
      const repoGraph = GraphBuilderService.buildGraph(depResult.files, depResult.dependencies);

      // Save repository_graph.json separately in target workspace directory
      const graphPath = path.join(targetDir, "repository_graph.json");
      const graphOutput = {
        nodes: repoGraph.nodes,
        edges: repoGraph.edges,
        metrics: repoGraph.metrics,
      };
      await fs.writeFile(graphPath, JSON.stringify(graphOutput, null, 2), "utf8");
      logger.info({ jobId, graphPath }, "💾 Repository graph file saved to workspace");

      // Step 7.2: Generate and save openapi_spec.json
      try {
        const openApiSpec = OpenApiExporter.generateSpec(repoName, detectedRoutes);
        const openApiPath = path.join(targetDir, "openapi_spec.json");
        await fs.writeFile(openApiPath, JSON.stringify(openApiSpec, null, 2), "utf8");
        logger.info({ jobId, openApiPath }, "💾 OpenAPI 3.0 spec file saved to workspace");
      } catch (specErr) {
        logger.error({ jobId, specErr }, "⚠️ Failed to generate or save OpenAPI spec");
      }

      // Step 7.5: Entry Point Discovery
      const entryPoints = await EntryPointDetectorService.detect(
        targetDir,
        scanResult.filePaths,
        parsedPkg,
        repoGraph
      );
      const entryPoint = entryPoints[0]?.filePath || null;

      // Step 7.9: Generate manifest.json file
      const manifest = {
        repositoryName: repoName,
        framework: frameworkMetadata.frameworks[0]?.name || null,
        frameworks: frameworkMetadata.frameworks,
        runtime: frameworkMetadata.runtime,
        packageManager: frameworkMetadata.packageManager,
        language: frameworkMetadata.language,
        monorepo: frameworkMetadata.monorepo,
        languages: langResult.primaryLanguages,
        primaryLanguage,
        entryCandidates,
        entryPoint,
        entryPoints,
        totalRoutes: detectedRoutes.length,
        database: dbDiscovery.type || null,
        orm: dbDiscovery.orm || null,
      };
      
      const manifestPath = path.join(targetDir, "manifest.json");
      await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
      logger.info({ jobId, manifestPath }, "💾 Repository manifest.json generated successfully");

      // Step 8: Synthesize central metadata object
      const hasDocker = 
        scanResult.filePaths.some(p => p.toLowerCase().includes("dockerfile") || p.toLowerCase().includes("docker-compose"));
      const totalSizeMB = parseFloat((scanResult.totalSize / (1024 * 1024)).toFixed(2));

      // Step 8.5: Architecture layout generation
      const architecture = ArchitectureGeneratorService.generate(
        depResult.files,
        depResult.dependencies,
        detectedRoutes,
        dbDiscovery
      );

      // Save architecture.json separately in target workspace directory
      const architecturePath = path.join(targetDir, "architecture.json");
      await fs.writeFile(architecturePath, JSON.stringify(architecture, null, 2), "utf8");
      logger.info({ jobId, architecturePath }, "💾 Architecture layout file saved to workspace");

      const analysisResult: AnalysisResult = {
        overview: {
          totalFiles: scanResult.totalFiles,
          totalRoutes: detectedRoutes.length, 
          totalDependencies: depResult.dependencies.length,
          totalEnvVars: envAnalysis.envVars.length,
        },
        metadata: {
          languages: langResult.languages,
          primaryLanguage,
          totalLines: scanResult.totalLines,
          totalSizeMB,
          totalFolders: scanResult.totalFolders,
          framework: frameworkMetadata.frameworks[0] || undefined,
          frameworkMetadata,
          hasDocker,
          entryPoint: entryPoint || undefined,
          entryPoints,
          routeMetrics,
          databaseInfo: dbDiscovery,
          missingEnvVars: envAnalysis.missingEnvVars,
        },
        tree: treeRoot,
        files: depResult.files,
        routes: detectedRoutes,
        envVars: envAnalysis.envVars,
        dependencies: depResult.dependencies,
        graph: graphOutput,
        frameworks: frameworkMetadata.frameworks,
        architecture,
        graphIssues: GraphValidatorService.validateGraph(repoGraph).map(i => ({
          type: i.type,
          severity: i.severity,
          description: i.description,
        })),
      };

      // Step 9a: Phase 11 — Generate AI Architecture Summary (structured metadata only, no source code)
      try {
        logger.info({ jobId }, "🤖 [Phase 11] Generating AI Architect summary...");
        analysisResult.aiSummary = await AiArchitectService.generate(analysisResult);
        logger.info({ jobId }, "✅ [Phase 11] AI Architect summary complete.");
      } catch (err) {
        logger.warn({ jobId, err }, "⚠️ [Phase 11] AI Architect summary failed — skipping.");
      }

      // Step 9b: Phase 12 — Generate Developer Onboarding Guide
      try {
        logger.info({ jobId }, "📚 [Phase 12] Generating Onboarding Guide...");
        analysisResult.onboarding = await OnboardingEngine.generate(analysisResult);
        logger.info({ jobId }, "✅ [Phase 12] Onboarding Guide complete.");
      } catch (err) {
        logger.warn({ jobId, err }, "⚠️ [Phase 12] Onboarding Guide generation failed — skipping.");
      }

      // Step 9c: Phase 13 — Static Analysis Engine
      try {
        logger.info({ jobId }, "🔬 [Phase 13] Running Static Analysis Engine...");
        const entryPointPaths = (entryPoints ?? []).map((ep: any) => ep.filePath ?? ep);
        analysisResult.staticAnalysis = await StaticAnalysisService.analyze(
          depResult.files,
          repoGraph,
          repoPath,
          entryPointPaths,
          analysisResult.graphIssues ?? []
        );
        logger.info({ jobId, score: analysisResult.staticAnalysis.healthScore }, "✅ [Phase 13] Static Analysis complete.");
      } catch (err) {
        logger.warn({ jobId, err }, "⚠️ [Phase 13] Static Analysis failed — skipping.");
      }

      // Step 9d: Software Metro Map - Feature Discovery
      try {
        logger.info({ jobId }, "🚇 Mapping business features...");
        analysisResult.features = FeatureBuilderService.buildFeatures(analysisResult);
        logger.info({ jobId, count: analysisResult.features.length }, "✅ Business features mapped successfully.");
      } catch (err) {
        logger.warn({ jobId, err }, "⚠️ Feature mapping failed — skipping.");
      }

      // Save results JSON in isolated workspace directory
      const resultPath = path.join(targetDir, "analysis_result.json");
      await fs.writeFile(resultPath, JSON.stringify(analysisResult, null, 2), "utf8");
      logger.info({ jobId, resultPath }, "💾 Analysis result saved to workspace");

      // Step 9: Store cached results and complete status
      await setJobResult(jobId, analysisResult);
      await setJobGraph(jobId, repoGraph);
      await setJobStatus(jobId, "completed");
      await prog(100);

      logger.info({ jobId, stage: "completed", repoId }, "✅ Ingestion pipeline completed successfully");
      return analysisResult;
    } catch (err: any) {
      logger.error({ jobId, stage: "failed", err }, "❌ Ingestion pipeline failed");
      await setJobStatus(jobId, "failed");
      throw err;
    }
}

// ─── BullMQ Worker (only when real Redis is available) ───────────────────────
let _worker: any = null;

export function startAnalysisWorker(): void {
  connectionReady.then(() => {
    if (isInMemoryMode) {
      logger.info("⚙️  BullMQ Worker skipped (in-memory mode – jobs run inline)");
      return;
    }

    _worker = new Worker<AnalysisJobData>(
      ANALYSIS_QUEUE_NAME,
      async (job: Job<AnalysisJobData>) =>
        runAnalysisJob(job.data, (n) => job.updateProgress(n)),
      {
        connection: redisConnection as any,
        concurrency: 2,
      }
    );

    _worker.on("failed", async (job: Job<AnalysisJobData>, err: Error) => {
      if (job) {
        const { jobId } = job.data;
        logger.error({ jobId, stage: "failed", err }, "❌ Worker job failed callback");
        await setJobStatus(jobId, "failed");
      }
    });

    logger.info("⚙️  BullMQ Worker started (Redis mode)");
  });
}

export const analysisWorker = {
  close: async () => { if (_worker) await _worker.close(); },
};

