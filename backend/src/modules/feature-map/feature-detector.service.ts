import { AnalysisResult, RouteNode, FileNode } from "@shared/types";
import { FeatureDefinition } from "./types.js";

export const FEATURE_DEFS: FeatureDefinition[] = [
  {
    id: "auth",
    name: "Authentication",
    color: "#10b981", // Emerald
    folders: [/\bauth\b/i, /\bsession\b/i, /\bjwt\b/i, /\bsignin\b/i, /\bsignup\b/i],
    routePrefixes: ["/auth", "/login", "/register", "/logout", "/token", "/session"]
  },
  {
    id: "users",
    name: "User Management",
    color: "#3b82f6", // Blue
    folders: [/\buser\b/i, /\busers\b/i, /\bmember\b/i, /\bprofile\b/i, /\baccount\b/i],
    routePrefixes: ["/users", "/user", "/profile", "/members", "/accounts"]
  },
  {
    id: "billing",
    name: "Billing & Payments",
    color: "#f97316", // Orange
    folders: [/\bbilling\b/i, /\bpayment\b/i, /\bpayments\b/i, /\bstripe\b/i, /\bcheckout\b/i, /\binvoice\b/i, /\bcart\b/i, /\border\b/i],
    routePrefixes: ["/billing", "/payments", "/stripe", "/checkout", "/orders", "/cart", "/pay"]
  },
  {
    id: "admin",
    name: "Admin Control Panel",
    color: "#8b5cf6", // Purple
    folders: [/\badmin\b/i, /\bdashboard\b/i, /\bmanage\b/i, /\bmoderator\b/i, /\bsuperuser\b/i],
    routePrefixes: ["/admin", "/manage", "/dashboard/admin", "/superuser"]
  },
  {
    id: "analytics",
    name: "Analytics & Logging",
    color: "#ec4899", // Pink
    folders: [/\banalytics\b/i, /\bmetrics\b/i, /\blog\b/i, /\blogs\b/i, /\breport\b/i, /\breports\b/i, /\bstats\b/i],
    routePrefixes: ["/analytics", "/metrics", "/stats", "/reports", "/logs"]
  },
  {
    id: "notifications",
    name: "Notifications",
    color: "#eab308", // Yellow
    folders: [/\bnotification\b/i, /\bnotifications\b/i, /\bmail\b/i, /\bemail\b/i, /\bsms\b/i, /\bpush\b/i, /\bsend\b/i],
    routePrefixes: ["/notifications", "/notify", "/email", "/mail", "/send"]
  }
];

export class FeatureDetectorService {
  /**
   * Categorizes routes and files in the AnalysisResult into distinct FeatureFlow buckets.
   */
  static detectFeatures(result: AnalysisResult): Record<string, { routes: string[]; files: string[] }> {
    const featureMap: Record<string, { routes: string[]; files: string[] }> = {};
    
    // Initialize buckets
    for (const def of FEATURE_DEFS) {
      featureMap[def.id] = { routes: [], files: [] };
    }
    featureMap["general"] = { routes: [], files: [] }; // Catch-all

    const routes = result.routes || [];
    const files = result.files || [];

    // 1. Classify Routes
    for (const r of routes) {
      let matchedFeature = "";
      const pathLower = r.path.toLowerCase();

      // Check route prefixes
      for (const def of FEATURE_DEFS) {
        if (def.routePrefixes.some(prefix => pathLower.startsWith(prefix) || pathLower.includes(prefix))) {
          matchedFeature = def.id;
          break;
        }
      }

      // Check route file path
      if (!matchedFeature && r.file) {
        const fileLower = r.file.toLowerCase();
        for (const def of FEATURE_DEFS) {
          if (def.folders.some(rx => rx.test(fileLower))) {
            matchedFeature = def.id;
            break;
          }
        }
      }

      const routeId = `ROUTE:${r.method}:${r.path}`;
      if (matchedFeature) {
        featureMap[matchedFeature].routes.push(routeId);
      } else {
        featureMap["general"].routes.push(routeId);
      }
    }

    // 2. Classify Files
    const fileCategoryMap: Record<string, string> = {};

    for (const f of files) {
      // Skip virtual nodes (ROUTE:, ENV:, DB:, ENTITY:)
      const pathLower = f.path.toLowerCase();
      if (
        pathLower.startsWith("route:") ||
        pathLower.startsWith("env:") ||
        pathLower.startsWith("db:") ||
        pathLower.startsWith("entity:")
      ) {
        continue;
      }

      let matchedFeature = "";
      for (const def of FEATURE_DEFS) {
        if (def.folders.some(rx => rx.test(f.path))) {
          matchedFeature = def.id;
          break;
        }
      }

      if (matchedFeature) {
        fileCategoryMap[f.path] = matchedFeature;
        featureMap[matchedFeature].files.push(f.path);
      }
    }

    // 3. Graph Clustering Fallback: Group remaining files by connection
    for (const f of files) {
      const pathLower = f.path.toLowerCase();
      if (
        pathLower.startsWith("route:") ||
        pathLower.startsWith("env:") ||
        pathLower.startsWith("db:") ||
        pathLower.startsWith("entity:")
      ) {
        continue;
      }

      if (fileCategoryMap[f.path]) {
        continue; // Already categorized
      }

      // Check direct imports or referrers to see if they belong to a category
      let matchedCluster = "";
      const connections = [...(f.internalImports || []), ...(f.referencedBy || [])];

      for (const conn of connections) {
        if (fileCategoryMap[conn]) {
          matchedCluster = fileCategoryMap[conn];
          break;
        }
      }

      if (matchedCluster) {
        fileCategoryMap[f.path] = matchedCluster;
        featureMap[matchedCluster].files.push(f.path);
      } else {
        fileCategoryMap[f.path] = "general";
        featureMap["general"].files.push(f.path);
      }
    }

    return featureMap;
  }
}
