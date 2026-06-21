
import { RouteInfo } from "../routes/types.js";
import { DatabaseFlowInfo, EntityOperationInfo } from "./types.js";
import fs from "fs/promises";
import path from "path";
import { logger } from "../../core/logger/index.js";

export class TransactionFlowService {
  /**
   * Traces full-chain database transaction flows and returns route-to-database flows.
   */
  static async trace(
    repoPath: string,
    routes: RouteInfo[],
    entities: EntityOperationInfo[],
    databaseType: string
  ): Promise<DatabaseFlowInfo[]> {
    logger.info("Starting Transaction Flow Tracing Service");
    const flows: DatabaseFlowInfo[] = [];
    const entityNames = entities.map(e => e.entity);

    for (const route of routes) {
      const filesToCheck = [route.file, ...(route.chain || [])];
      let touchesDb = false;
      const entitiesSet = new Set<string>();
      const operationsSet = new Set<string>();
      const txChain: string[] = [`${route.method} ${route.path}`];
      const ormCalls: string[] = [];

      for (const file of filesToCheck) {
        const basename = path.basename(file, path.extname(file));
        txChain.push(basename);

        try {
          const fullPath = path.join(repoPath, file);
          const content = await fs.readFile(fullPath, "utf8");

          // Check if database is mentioned
          if (
            content.includes("prisma.") ||
            content.includes("db.") ||
            content.includes("mongoose") ||
            content.includes("drizzle")
          ) {
            touchesDb = true;
          }

          // Search for prisma.entity.operation()
          const prismaRegex = /prisma\.([a-zA-Z0-9_]+)\.(findMany|findUnique|findFirst|find|findOne|create|update|delete|save|destroy|insertOne|insertMany|aggregate|select|insert)\(/gi;
          let match;
          while ((match = prismaRegex.exec(content)) !== null) {
            const rawEntity = match[1];
            const op = match[2];
            const normalizedEntity = rawEntity.charAt(0).toUpperCase() + rawEntity.slice(1);
            if (entityNames.includes(normalizedEntity)) {
              entitiesSet.add(normalizedEntity);
              const opType = this.mapOpType(op);
              operationsSet.add(opType);
              ormCalls.push(`prisma.${rawEntity}.${op}()`);
              touchesDb = true;
            }
          }

          // Search for db.entity.operation()
          const dbRegex = /db\.([a-zA-Z0-9_]+)\.(findMany|findUnique|findFirst|find|findOne|create|update|delete|save|destroy|insertOne|insertMany|aggregate|select|insert)\(/gi;
          while ((match = dbRegex.exec(content)) !== null) {
            const rawEntity = match[1];
            const op = match[2];
            const normalizedEntity = rawEntity.charAt(0).toUpperCase() + rawEntity.slice(1);
            if (entityNames.includes(normalizedEntity)) {
              entitiesSet.add(normalizedEntity);
              const opType = this.mapOpType(op);
              operationsSet.add(opType);
              ormCalls.push(`db.${rawEntity}.${op}()`);
              touchesDb = true;
            }
          }

          // Search for Entity.operation()
          const entityRegex = /\b([A-Z][A-Za-z0-9_]*)\.(findMany|findUnique|findFirst|find|findOne|create|update|delete|save|destroy|insertOne|insertMany|aggregate|select|insert)\(/g;
          while ((match = entityRegex.exec(content)) !== null) {
            const entityClass = match[1];
            const op = match[2];
            if (entityNames.includes(entityClass)) {
              entitiesSet.add(entityClass);
              const opType = this.mapOpType(op);
              operationsSet.add(opType);
              ormCalls.push(`${entityClass}.${op}()`);
              touchesDb = true;
            }
          }

          // General fallback check for keywords
          for (const ent of entities) {
            const regex = new RegExp(`\\b${ent.entity}\\b`, "i");
            if (regex.test(content)) {
              entitiesSet.add(ent.entity);
              touchesDb = true;
            }
          }
        } catch {
          // File read error
        }
      }

      if (touchesDb) {
        // Append ORM calls if any were found
        if (ormCalls.length > 0) {
          // Push unique calls
          const uniqueCalls = Array.from(new Set(ormCalls));
          for (const call of uniqueCalls) {
            txChain.push(call);
          }
        } else if (entitiesSet.size > 0) {
          // Fallback if we found entities but not explicit calls
          const entitiesList = Array.from(entitiesSet);
          txChain.push(`${entitiesList[0]} Query`);
        } else {
          txChain.push("Query Operations");
        }

        txChain.push(databaseType || "Database");

        flows.push({
          route: route.path,
          method: route.method,
          chain: route.chain || [],
          database: databaseType || "Database",
          entities: Array.from(entitiesSet),
          operations: Array.from(operationsSet).length > 0 ? Array.from(operationsSet) : ["read"],
          transactionChain: txChain,
        });
      }
    }

    return flows;
  }

  private static mapOpType(op: string): string {
    const readOps = new Set(["findMany", "findUnique", "findFirst", "find", "findOne", "aggregate", "select"]);
    const writeOps = new Set(["create", "insertOne", "insertMany", "insert"]);
    const updateOps = new Set(["update", "save"]);
    const deleteOps = new Set(["delete", "destroy"]);

    if (readOps.has(op)) return "read";
    if (writeOps.has(op)) return "create";
    if (updateOps.has(op)) return "update";
    if (deleteOps.has(op)) return "delete";
    return "read";
  }
}
