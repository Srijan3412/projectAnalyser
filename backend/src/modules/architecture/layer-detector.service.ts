import { FileNode, AnalysisResult } from "@shared/types";

export interface ArchitectureLayers {
  routes: string[];
  controllers: string[];
  services: string[];
  repositories: string[];
  models: string[];
  database: string[];
}

export class LayerDetectorService {
  static detect(result: AnalysisResult): ArchitectureLayers {
    const files = result.files || [];
    const dbInfo = result.metadata?.databaseInfo;

    const layers: ArchitectureLayers = {
      routes: [],
      controllers: [],
      services: [],
      repositories: [],
      models: [],
      database: []
    };

    // Layer matching rules based on folder names and suffix conventions
    const rules = [
      { layer: "routes" as const, regex: /\broutes\b|\broute\b|\.route\b|src\/routes\//i },
      { layer: "controllers" as const, regex: /\bcontrollers\b|\bcontroller\b|\.controller\b|src\/controllers\//i },
      { layer: "services" as const, regex: /\bservices\b|\bservice\b|\.service\b|src\/services\//i },
      { layer: "repositories" as const, regex: /\brepositories\b|\brepository\b|\brepo\b|\.repository\b|\.repo\b|src\/repositories\//i },
      { layer: "models" as const, regex: /\bmodels\b|\bmodel\b|\bentities\b|\bentity\b|\.model\b|\.entity\b|src\/models\//i },
    ];

    for (const file of files) {
      const pathLower = file.path.toLowerCase();
      
      // Skip virtual nodes (ROUTE:, ENV:, DB:, ENTITY:)
      if (
        pathLower.startsWith("route:") ||
        pathLower.startsWith("env:") ||
        pathLower.startsWith("db:") ||
        pathLower.startsWith("entity:")
      ) {
        continue;
      }

      let matched = false;
      for (const rule of rules) {
        if (rule.regex.test(file.path)) {
          layers[rule.layer].push(file.path);
          matched = true;
          break;
        }
      }

      if (!matched) {
        // Fallback checks for database files (e.g. schema.prisma, configuration files)
        if (/\bprisma\b|schema\.prisma|\bconnection\b|\bdb\b/i.test(file.path)) {
          layers.database.push(file.path);
        }
      }
    }

    // Include database details as entries in the DB layer if present
    if (dbInfo?.type) {
      layers.database.push(`DB: ${dbInfo.type}`);
    } else if (dbInfo?.databases && dbInfo.databases.length > 0) {
      dbInfo.databases.forEach(db => layers.database.push(`DB: ${db}`));
    }

    return layers;
  }
}
