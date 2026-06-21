import { AnalysisResult, FeatureFlow, RouteNode, FeatureMetrics } from "@shared/types";
import { FeatureDetectorService, FEATURE_DEFS } from "./feature-detector.service.js";

// Helper to classify file categories
function getStationCategory(type: string, name: string): "route" | "middleware" | "controller" | "service" | "repository" | "database" {
  if (type === "route") return "route";
  if (type === "db") return "database";
  const lower = name.toLowerCase();
  if (
    lower.includes("middleware") || 
    lower.includes("guard") || 
    (lower.includes("auth") && (lower.includes("middleware") || lower.includes("guard") || lower.includes("jwt")))
  ) {
    return "middleware";
  }
  if (lower.includes("controller") || lower.includes("handler") || lower.includes("resolver")) {
    return "controller";
  }
  if (lower.includes("repository") || lower.includes("repo") || lower.includes("model") || lower.includes("schema")) {
    return "repository";
  }
  return "service";
}

export class FeatureBuilderService {
  static buildFeatures(result: AnalysisResult): FeatureFlow[] {
    const rawFeatures = FeatureDetectorService.detectFeatures(result);
    const flows: FeatureFlow[] = [];

    const dbFlows = result.metadata?.databaseInfo?.flows || [];

    // Map each file path to its feature ID for dependency resolution
    const fileToFeatureId: Record<string, string> = {};
    for (const [key, data] of Object.entries(rawFeatures)) {
      data.files.forEach(f => {
        fileToFeatureId[f] = key;
      });
    }

    // Loop through each discovered feature
    for (const [key, data] of Object.entries(rawFeatures)) {
      if (data.routes.length === 0 && data.files.length === 0) {
        continue; // Skip empty features
      }

      let name = "Core System";
      let color = "#a1a1aa"; // Gray
      const def = FEATURE_DEFS.find(d => d.id === key);
      if (def) {
        name = def.name;
        color = def.color;
      }

      // Clean routes for display: e.g. "ROUTE:POST:/login" -> "POST /login"
      const cleanRoutes = data.routes.map(rId => {
        const parts = rId.split(":");
        if (parts.length >= 3) {
          return `${parts[1]} ${parts[2]}`;
        }
        return rId;
      });

      // Match database entities/tables accessed by routes or files in this feature
      const dbEntities = new Set<string>();
      const routePaths = data.routes.map(rId => {
        const parts = rId.split(":");
        return parts.length >= 3 ? parts[2] : "";
      }).filter(Boolean);

      for (const flow of dbFlows) {
        if (routePaths.includes(flow.route)) {
          if (flow.entities) {
            flow.entities.forEach(ent => dbEntities.add(ent));
          }
        }
      }

      // Check if feature utilizes authentication
      let hasAuth = key === "auth";
      if (!hasAuth) {
        // Scan route definitions for auth middleware
        const routesList = result.routes || [];
        for (const rId of data.routes) {
          const parts = rId.split(":");
          const method = parts[1];
          const routePath = parts[2];
          const matchedRoute = routesList.find((r: RouteNode) => r.path === routePath && r.method === method);
          if (matchedRoute?.middleware?.some(m => /auth|jwt|passport|guard/i.test(m))) {
            hasAuth = true;
            break;
          }
        }
      }

      // ─── 1. Calculate Confidence ───
      let confidenceSum = 0;
      let confidenceCount = 0;

      // Calculate confidence for routes
      data.routes.forEach(rId => {
        const parts = rId.split(":");
        const routePath = parts[2] || "";
        const routePathLower = routePath.toLowerCase();

        let routeConf = 60; // baseline
        if (def) {
          if (def.routePrefixes.some(prefix => routePathLower.startsWith(prefix.toLowerCase()) || routePathLower.includes(prefix.toLowerCase()))) {
            routeConf = 95;
          }
        }
        confidenceSum += routeConf;
        confidenceCount++;
      });

      // Calculate confidence for files
      data.files.forEach(fPath => {
        let fileConf = 50; // general baseline
        if (key !== "general" && def) {
          const isDirectFolder = def.folders.some(rx => rx.test(fPath));
          if (isDirectFolder) {
            fileConf = 100;
          } else {
            // Clustered via imports graph
            const fileNode = result.files.find(f => f.path === fPath);
            let categoryConnections = 0;
            if (fileNode) {
              const conns = [...(fileNode.internalImports || []), ...(fileNode.referencedBy || [])];
              conns.forEach(c => {
                if (def.folders.some(rx => rx.test(c))) {
                  categoryConnections++;
                }
              });
            }
            fileConf = Math.min(95, 70 + categoryConnections * 5);
          }
        }
        confidenceSum += fileConf;
        confidenceCount++;
      });

      const averageConfidence = confidenceCount > 0 ? Math.round(confidenceSum / confidenceCount) : 100;

      // ─── 2. Calculate Metrics ───
      let servicesCount = 0;
      let reposCount = 0;
      let complexitySum = 0;

      data.files.forEach(fPath => {
        const filename = fPath.split(/[\\/]/).pop() || fPath;
        const cat = getStationCategory("file", filename);
        if (cat === "service") servicesCount++;
        else if (cat === "repository") reposCount++;

        // Add complexity score
        const comp = result.staticAnalysis?.complexity?.find(c => c.file === fPath);
        if (comp) {
          complexitySum += comp.score;
        }
      });

      const metrics: FeatureMetrics = {
        routes: cleanRoutes.length,
        services: servicesCount,
        repositories: reposCount,
        tables: dbEntities.size,
        complexity: complexitySum
      };

      // ─── 3. Calculate Health Score ───
      let healthScore = 100;

      if (result.staticAnalysis) {
        const report = result.staticAnalysis;

        // Circular Dependency Cycles
        if (report.cycles) {
          report.cycles.forEach(c => {
            const hasFileInCycle = c.cycle.some(f => data.files.includes(f));
            if (hasFileInCycle) {
              healthScore -= 12; // deduct per cycle
            }
          });
        }

        // Dead Code
        if (report.deadCode) {
          report.deadCode.forEach(d => {
            if (data.files.includes(d.file)) {
              healthScore -= 5;
            }
          });
        }

        // Large Files
        if (report.largeFiles) {
          report.largeFiles.forEach(l => {
            if (data.files.includes(l.file)) {
              healthScore -= 4;
            }
          });
        }

        // Risky Complexity
        if (report.complexity) {
          report.complexity.forEach(comp => {
            if (data.files.includes(comp.file) && comp.score > 15) {
              healthScore -= 5;
            }
          });
        }

        // God Services
        if (report.godServices) {
          report.godServices.forEach(g => {
            if (data.files.includes(g.file)) {
              healthScore -= 15;
            }
          });
        }
      } else {
        // Fallback calculations using graph metrics if static analysis wasn't run yet
        const cycles = result.graph?.metrics?.cycles ?? 0;
        if (cycles > 0) {
          healthScore -= Math.min(30, cycles * 6);
        }
      }

      healthScore = Math.max(10, Math.min(100, healthScore));

      // ─── 4. Compute Feature Dependencies (Cross-Feature Dependencies) ───
      const dependenciesSet = new Set<string>();
      data.files.forEach(fPath => {
        const fileNode = result.files.find(f => f.path === fPath);
        if (fileNode?.internalImports) {
          fileNode.internalImports.forEach(imp => {
            const targetFeatureId = fileToFeatureId[imp];
            if (targetFeatureId && targetFeatureId !== key) {
              dependenciesSet.add(targetFeatureId);
            }
          });
        }
      });

      flows.push({
        id: key,
        name,
        color,
        routes: cleanRoutes,
        files: data.files,
        database: Array.from(dbEntities),
        auth: hasAuth,
        confidence: averageConfidence,
        health: healthScore,
        metrics,
        dependencies: Array.from(dependenciesSet)
      });
    }

    return flows;
  }
}
