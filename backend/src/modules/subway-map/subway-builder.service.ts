import { AnalysisResult, SubwayStation, SubwayLine, RepositorySubway, RouteNode } from "@shared/types";
import { FEATURE_DEFS } from "../feature-map/feature-detector.service.js";
import { FeatureClusteringService } from "./feature-clustering.service.js";

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

// Helper to determine feature for routes
function getRouteFeatures(routePath: string, method: string, result: AnalysisResult): string[] {
  let routeFeatures = ["general"];
  const pathLower = routePath.toLowerCase();
  for (const def of FEATURE_DEFS) {
    if (def.routePrefixes.some(prefix => pathLower.startsWith(prefix.toLowerCase()) || pathLower.includes(prefix.toLowerCase()))) {
      routeFeatures = [def.id];
      break;
    }
  }
  return routeFeatures;
}

export class SubwayBuilderService {
  static buildSubway(result: AnalysisResult): RepositorySubway {
    const fileToFeatures = FeatureClusteringService.clusterFeatures(result);
    const stations: SubwayStation[] = [];
    const files = result.files || [];
    const routes = result.routes || [];

    // 1. Map Files to Stations
    files.forEach(f => {
      const pathLower = f.path.toLowerCase();
      if (
        pathLower.startsWith("route:") ||
        pathLower.startsWith("env:") ||
        pathLower.startsWith("db:") ||
        pathLower.startsWith("entity:")
      ) {
        return; // Skip virtual nodes
      }

      const filename = f.path.split(/[\\/]/).pop() || f.path;
      const type = getStationCategory("file", filename);
      const feats = fileToFeatures[f.path] || ["general"];

      stations.push({
        id: f.path,
        file: f.path,
        features: feats,
        type
      });
    });

    // 2. Map Routes to Stations
    routes.forEach(r => {
      const type = "route";
      const feats = getRouteFeatures(r.path, r.method, result);
      const rId = `route:${r.method}:${r.path}`;

      stations.push({
        id: rId,
        file: r.file || "",
        features: feats,
        type
      });
    });

    // 3. Map Database Persistence Layer as Terminal Hub Stations
    const dbInfo = result.metadata?.databaseInfo;
    if (dbInfo) {
      const dbType = dbInfo.type || "PostgreSQL";
      const dbFlows = dbInfo.flows || [];
      const dbFeaturesSet = new Set<string>();

      dbFlows.forEach(flow => {
        const routeFeats = getRouteFeatures(flow.route, flow.method, result);
        routeFeats.forEach(f => dbFeaturesSet.add(f));
      });

      // Also scan repos for category references
      if (dbFeaturesSet.size === 0) {
        dbFeaturesSet.add("general");
      }

      const dbStationId = `db:${dbType}`;
      stations.push({
        id: dbStationId,
        file: dbType,
        features: Array.from(dbFeaturesSet),
        type: "database"
      });
    }

    // 4. Build Subway Lines
    const lines: SubwayLine[] = [];
    const allFeatureIds = [...FEATURE_DEFS.map(d => d.id), "general"];

    // Category sorting order
    const categoryOrder: Record<string, number> = {
      route: 0,
      middleware: 1,
      controller: 2,
      service: 3,
      repository: 4,
      database: 5
    };

    allFeatureIds.forEach(featureId => {
      // Find all stations for this feature
      const lineStations = stations.filter(s => s.features.includes(featureId));
      if (lineStations.length === 0) return; // Skip empty lines

      // Sort stations along the line in architectural sequence
      lineStations.sort((a, b) => {
        if (categoryOrder[a.type] !== categoryOrder[b.type]) {
          return categoryOrder[a.type] - categoryOrder[b.type];
        }
        // Fallback: alphabetical filename
        return a.id.localeCompare(b.id);
      });

      const def = FEATURE_DEFS.find(d => d.id === featureId);
      const color = def ? def.color : "#a1a1aa"; // Gray default

      lines.push({
        feature: featureId,
        stations: lineStations.map(s => s.id),
        color
      });
    });

    // 5. Gather Transfer Stations (Interchanges)
    const transfers = stations
      .filter(s => s.features.length > 1)
      .map(s => s.id);

    return {
      stations,
      lines,
      transfers
    };
  }
}
