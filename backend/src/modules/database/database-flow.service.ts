import { RouteInfo } from "../routes/types.js";
import { DatabaseFlowInfo, EntityOperationInfo } from "./types.js";
import fs from "fs/promises";
import path from "path";
import { logger } from "../../core/logger/index.js";

export class DatabaseFlowService {
  /**
   * Identifies which routes interact with the database by inspecting file contents in their execution chain.
   */
  static async traceFlows(
    repoPath: string,
    routes: RouteInfo[],
    entities: EntityOperationInfo[],
    databaseType: string
  ): Promise<DatabaseFlowInfo[]> {
    logger.info("Tracing database transaction flows across routes");
    const flows: DatabaseFlowInfo[] = [];

    for (const route of routes) {
      const filesToCheck = [route.file, ...(route.chain || [])];
      let touchesDb = false;

      for (const file of filesToCheck) {
        try {
          const fullPath = path.join(repoPath, file);
          const content = await fs.readFile(fullPath, "utf8");

          // Heuristic: check if this file references database client/prisma instance
          // or references any of the discovered entities/tables
          if (
            content.includes("prisma.") || 
            content.includes("db.") || 
            content.includes("mongoose") || 
            content.includes("drizzle")
          ) {
            touchesDb = true;
            break;
          }

          for (const ent of entities) {
            // Case-insensitive boundary match for entity name (e.g. User, Session)
            const regex = new RegExp(`\\b${ent.entity}\\b`, "i");
            if (regex.test(content)) {
              touchesDb = true;
              break;
            }
          }
        } catch {
          // Skip missing files
        }

        if (touchesDb) break;
      }

      if (touchesDb) {
        flows.push({
          route: route.path,
          method: route.method,
          chain: route.chain || [],
          database: databaseType || "Database",
        });
      }
    }

    return flows;
  }
}
