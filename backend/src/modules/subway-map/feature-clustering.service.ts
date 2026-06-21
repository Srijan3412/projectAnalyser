import { AnalysisResult, FileNode } from "@shared/types";
import { FEATURE_DEFS } from "../feature-map/feature-detector.service.js";

export class FeatureClusteringService {
  /**
   * Builds a map of File -> list of Feature IDs that this file is associated with.
   * If a file belongs to more than 1 feature, it forms a vertical Subway intersection station.
   */
  static clusterFeatures(result: AnalysisResult): Record<string, string[]> {
    const fileToFeatures: Record<string, Set<string>> = {};
    const files = result.files || [];

    // Initialize map
    files.forEach(f => {
      fileToFeatures[f.path] = new Set<string>();
    });

    // 1. Direct Folder Seed Matching
    files.forEach(f => {
      const pathLower = f.path.toLowerCase();
      if (
        pathLower.startsWith("route:") ||
        pathLower.startsWith("env:") ||
        pathLower.startsWith("db:") ||
        pathLower.startsWith("entity:")
      ) {
        return;
      }

      FEATURE_DEFS.forEach(def => {
        if (def.folders.some(rx => rx.test(f.path))) {
          fileToFeatures[f.path].add(def.id);
        }
      });
    });

    // 2. Transitive Clump Propagation (Neighbors in AST import graph)
    files.forEach(f => {
      const pathLower = f.path.toLowerCase();
      if (
        pathLower.startsWith("route:") ||
        pathLower.startsWith("env:") ||
        pathLower.startsWith("db:") ||
        pathLower.startsWith("entity:")
      ) {
        return;
      }

      const currentFeatures = Array.from(fileToFeatures[f.path] || []);
      if (currentFeatures.length > 0) {
        // Propagate to internal imports (dependencies)
        const imports = f.internalImports || [];
        imports.forEach(imp => {
          if (fileToFeatures[imp]) {
            currentFeatures.forEach(feat => fileToFeatures[imp].add(feat));
          }
        });

        // Propagate to referrers (dependents)
        const referrers = f.referencedBy || [];
        referrers.forEach(ref => {
          if (fileToFeatures[ref]) {
            currentFeatures.forEach(feat => fileToFeatures[ref].add(feat));
          }
        });
      }
    });

    // 3. Extract final arrays and apply Core System fallback
    const finalMap: Record<string, string[]> = {};
    files.forEach(f => {
      const pathLower = f.path.toLowerCase();
      if (
        pathLower.startsWith("route:") ||
        pathLower.startsWith("env:") ||
        pathLower.startsWith("db:") ||
        pathLower.startsWith("entity:")
      ) {
        return;
      }

      const set = fileToFeatures[f.path];
      if (!set || set.size === 0) {
        finalMap[f.path] = ["general"];
      } else {
        finalMap[f.path] = Array.from(set);
      }
    });

    return finalMap;
  }
}
