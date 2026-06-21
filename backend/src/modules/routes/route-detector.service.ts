import { Project } from "ts-morph";
import { RouteInfo, RouteMetrics } from "./types.js";
import { ExpressRouteDetector } from "./express-route-detector.js";
import { NextRouteDetector } from "./next-route-detector.js";
import { NestJSRouteDetector } from "./nestjs-route-detector.js";
import { DependencyResolver } from "../parser/dependency-resolver.js";
import { logger } from "../../core/logger/index.js";
import path from "path";

export class RouteDetectorService {
  /**
   * Orchestrates the discovery of routes in the repository.
   * 
   * KNOWN LIMITATION:
   * Dynamic route generation (e.g. routes.forEach(r => router[r.method](...)) 
   * or dynamic router imports) is not fully supported and is detected with lower confidence.
   */
  static async detectRoutes(
    repoPath: string,
    filePaths: string[],
    frameworkMetadata: any,
    dependencies: { source: string; target: string }[] = []
  ): Promise<RouteInfo[]> {
    logger.info({ repoPath }, "🔍 Initiating Route Discovery Engine");

    const project = new Project();
    
    // Add source files
    const sourceFiles = filePaths.filter((f) => {
      const ext = path.extname(f).toLowerCase();
      return (ext === ".ts" || ext === ".tsx" || ext === ".js" || ext === ".jsx") &&
             !f.startsWith("node_modules/") &&
             !f.startsWith("dist/") &&
             !f.startsWith(".next/");
    });

    for (const file of sourceFiles) {
      try {
        project.addSourceFileAtPath(path.join(repoPath, file));
      } catch {
        // Skip files that fail to load
      }
    }

    // Determine active detectors based on framework rankings
    const activeFrameworks = new Set<string>();
    if (frameworkMetadata && frameworkMetadata.frameworks) {
      for (const fw of frameworkMetadata.frameworks) {
        activeFrameworks.add(fw.name);
      }
    }

    const checkAll = activeFrameworks.size === 0;
    let routes: RouteInfo[] = [];

    // For Express-like routing systems (Express, Fastify, Hono, Koa)
    const expressStyleMounts: { file: string; prefix: string; routerVar: string; importedFrom?: string }[] = [];
    const expressStyleRoutes: RouteInfo[] = [];

    // Load path mappings for import resolution
    const pathMappings = await DependencyResolver.loadPathMappings(repoPath);

    for (const sourceFile of project.getSourceFiles()) {
      const fullPath = sourceFile.getFilePath();
      const relativePath = path.relative(repoPath, fullPath).replace(/\\/g, "/");

      // 1. Next.js Route Discovery
      if (checkAll || activeFrameworks.has("Next.js") || activeFrameworks.has("Nuxt") || activeFrameworks.has("Gatsby")) {
        const nextRoutes = NextRouteDetector.detect(sourceFile, relativePath);
        routes.push(...nextRoutes);
      }

      // 2. NestJS Route Discovery
      if (checkAll || activeFrameworks.has("NestJS")) {
        const nestRoutes = NestJSRouteDetector.detect(sourceFile, relativePath);
        routes.push(...nestRoutes);
      }

      // 3. Express-like Route Discovery
      const isExpress = activeFrameworks.has("Express");
      const isFastify = activeFrameworks.has("Fastify");
      const isHono = activeFrameworks.has("Hono");
      const isKoa = activeFrameworks.has("Koa");

      if (checkAll || isExpress || isFastify || isHono || isKoa) {
        const frameworkName = isExpress ? "Express" : isFastify ? "Fastify" : isHono ? "Hono" : isKoa ? "Koa" : "Express";
        const result = ExpressRouteDetector.detect(sourceFile, relativePath, frameworkName);
        expressStyleRoutes.push(...result.routes);
        for (const mount of result.mounts) {
          expressStyleMounts.push({
            file: relativePath,
            prefix: mount.prefix,
            routerVar: mount.routerVar,
            importedFrom: mount.importedFrom,
          });
        }
      }
    }

    // Resolve Express-like mount paths
    if (expressStyleRoutes.length > 0) {
      const resolvedRoutes = this.resolveExpressMountPaths(
        expressStyleRoutes,
        expressStyleMounts,
        filePaths,
        pathMappings
      );
      routes.push(...resolvedRoutes);
    }

    // Normalize route paths
    routes = routes.map((r) => {
      let cleanPath = r.path.replace(/\/+/g, "/");
      if (!cleanPath.startsWith("/")) {
        cleanPath = "/" + cleanPath;
      }
      if (cleanPath.length > 1 && cleanPath.endsWith("/")) {
        cleanPath = cleanPath.slice(0, -1);
      }
      return {
        ...r,
        path: cleanPath,
      };
    });

    // Deduplicate routes
    const uniqueRoutesMap = new Map<string, RouteInfo>();
    for (const r of routes) {
      const key = `${r.method}:${r.path}`;
      if (!uniqueRoutesMap.has(key)) {
        uniqueRoutesMap.set(key, r);
      }
    }
    const finalRoutes = Array.from(uniqueRoutesMap.values());

    // Trace execution chain for each route using import graph edges
    for (const r of finalRoutes) {
      r.chain = this.traceExecutionChain(r.file, dependencies);
    }

    logger.info({ totalRoutes: finalRoutes.length }, "🔍 Route Discovery Engine finished successfully");
    return finalRoutes;
  }

  /**
   * Resolves mounting prefixes for Express/Fastify/Hono/Koa routers recursively.
   */
  private static resolveExpressMountPaths(
    routes: RouteInfo[],
    mounts: { file: string; prefix: string; routerVar: string; importedFrom?: string }[],
    allFiles: string[],
    pathMappings: any[]
  ): RouteInfo[] {
    const mountGraph = new Map<string, { to: string; prefix: string }[]>();

    for (const mount of mounts) {
      if (!mount.importedFrom) continue;
      
      const resolvedFile = DependencyResolver.resolveImport(
        mount.file,
        mount.importedFrom,
        allFiles,
        pathMappings
      );

      if (resolvedFile) {
        if (!mountGraph.has(mount.file)) {
          mountGraph.set(mount.file, []);
        }
        mountGraph.get(mount.file)!.push({
          to: resolvedFile,
          prefix: mount.prefix,
        });
      }
    }

    const filePrefixes = new Map<string, string>();
    const visited = new Set<string>();

    const dfs = (currentFile: string, accumulatedPrefix: string) => {
      filePrefixes.set(currentFile, accumulatedPrefix);

      if (visited.has(currentFile)) return;
      visited.add(currentFile);

      const outgoing = mountGraph.get(currentFile) || [];
      for (const edge of outgoing) {
        const nextPrefix = (accumulatedPrefix + "/" + edge.prefix).replace(/\/+/g, "/");
        dfs(edge.to, nextPrefix);
      }

      visited.delete(currentFile);
    };

    const sourceFiles = Array.from(new Set([
      ...routes.map((r) => r.file),
      ...mounts.map((m) => m.file)
    ]));

    const mountedFiles = new Set(mounts.map((m) => {
      const resolved = DependencyResolver.resolveImport(m.file, m.importedFrom || "", allFiles, pathMappings);
      return resolved || "";
    }));

    const roots = sourceFiles.filter((f) => !mountedFiles.has(f));
    const startNodes = roots.length > 0 ? roots : sourceFiles;

    for (const start of startNodes) {
      dfs(start, "");
    }

    return routes.map((r) => {
      const prefix = filePrefixes.get(r.file) || "";
      const fullPath = (prefix + "/" + r.path).replace(/\/+/g, "/");
      return {
        ...r,
        path: fullPath,
      };
    });
  }

  /**
   * Helper to compute route statistics.
   */
  static computeMetrics(routes: RouteInfo[]): RouteMetrics {
    let get = 0, post = 0, put = 0, del = 0, patch = 0, others = 0;
    
    for (const r of routes) {
      const method = r.method.toUpperCase();
      if (method === "GET") get++;
      else if (method === "POST") post++;
      else if (method === "PUT") put++;
      else if (method === "DELETE") del++;
      else if (method === "PATCH") patch++;
      else others++;
    }

    return {
      total: routes.length,
      get,
      post,
      put,
      delete: del,
      patch,
      others,
    };
  }

  /**
   * Traces the dependency chain starting from the file containing the route.
   * Leverages the dependency graph to find paths down Controllers, Services, Repositories, etc.
   */
  private static traceExecutionChain(
    startFile: string,
    dependencies: { source: string; target: string }[]
  ): string[] {
    const chain: string[] = [];
    const visited = new Set<string>();

    let currentFile = startFile;
    visited.add(currentFile);

    // Trace up to 4 layers down
    for (let depth = 0; depth < 4; depth++) {
      // Find all outgoing internal dependencies
      const outgoing = dependencies.filter(
        (edge) => edge.source === currentFile && !edge.target.startsWith("node_modules")
      );

      if (outgoing.length === 0) break;

      // Select the best candidate based on naming heuristics (controller -> service -> repo/model)
      let nextFile = "";
      const keywords = ["controller", "service", "repository", "model", "schema", "db"];
      
      for (const kw of keywords) {
        const found = outgoing.find((edge) => edge.target.toLowerCase().includes(kw));
        if (found && !visited.has(found.target)) {
          nextFile = found.target;
          break;
        }
      }

      // Fallback to the first outgoing dependency that we haven't visited yet
      if (!nextFile) {
        const fallback = outgoing.find((edge) => !visited.has(edge.target));
        if (fallback) {
          nextFile = fallback.target;
        }
      }

      if (!nextFile) break;

      chain.push(nextFile);
      currentFile = nextFile;
      visited.add(currentFile);
    }

    return chain;
  }
}
