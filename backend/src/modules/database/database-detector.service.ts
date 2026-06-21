import { Project, SyntaxKind, PropertyAccessExpression } from "ts-morph";
import { DatabaseDiscoveryInfo, EntityOperationInfo, EntityRelationInfo, DatabaseMetricsInfo } from "./types.js";
import { ORM_PACKAGES, DB_PACKAGES, CONNECTION_TRIGGERS } from "./database-rules.js";
import fs from "fs/promises";
import path from "path";
import { logger } from "../../core/logger/index.js";

export class DatabaseDetectorService {
  /**
   * Discovers database type, ORM/ODM setup, connection files, entities, and query patterns in a repo.
   */
  static async discover(
    repoPath: string,
    filePaths: string[],
    parsedPkg: any
  ): Promise<DatabaseDiscoveryInfo> {
    logger.info({ repoPath }, "🔍 Initiating Database Discovery Engine");

    let detectedOrm: string | undefined;
    let detectedDb: string | undefined;
    let connectionFile: string | undefined;
    const relations: EntityRelationInfo[] = [];
    const repositories: Record<string, string> = {};
    let queryOpsCount = 0;

    // 1. Package dependency analysis
    if (parsedPkg && parsedPkg.dependencies) {
      const deps = parsedPkg.dependencies;
      for (const [pkg, orm] of Object.entries(ORM_PACKAGES)) {
        if (deps[pkg]) {
          detectedOrm = orm;
          break;
        }
      }

      for (const [pkg, db] of Object.entries(DB_PACKAGES)) {
        if (deps[pkg]) {
          detectedDb = db;
          break;
        }
      }
    }

    const project = new Project();
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
        // Skip
      }
    }

    // 2. AST Connection trigger & Entity operations scanning
    const entityOpsMap = new Map<string, Set<string>>();

    for (const sourceFile of project.getSourceFiles()) {
      const fullPath = sourceFile.getFilePath();
      const relativePath = path.relative(repoPath, fullPath).replace(/\\/g, "/");
      const text = sourceFile.getText();

      // Check connection triggers
      for (const trg of CONNECTION_TRIGGERS) {
        if (text.includes(trg.trigger)) {
          if (!connectionFile) {
            connectionFile = relativePath;
          }
          if (!detectedOrm) detectedOrm = trg.orm;
          if (!detectedDb) detectedDb = trg.db;
        }
      }

      // Check repository classes/files
      const classes = sourceFile.getClasses();
      for (const cls of classes) {
        const name = cls.getName();
        if (name && (name.endsWith("Repository") || name.endsWith("Repo"))) {
          const entityCandidate = name.replace(/Repository$/, "").replace(/Repo$/, "");
          const normalizedEntity = entityCandidate.charAt(0).toUpperCase() + entityCandidate.slice(1);
          repositories[name] = normalizedEntity;
        }
      }

      const fileName = path.basename(sourceFile.getFilePath());
      if (fileName.includes("repository") || fileName.includes("Repo")) {
        const repNameMatch = fileName.match(/^([A-Za-z0-9_]+)(?:\.repository|\.repo|Repository|Repo)/i);
        if (repNameMatch) {
          const entityCandidate = repNameMatch[1];
          const normalizedEntity = entityCandidate.charAt(0).toUpperCase() + entityCandidate.slice(1);
          const repoName = normalizedEntity + "Repository";
          if (!repositories[repoName]) {
            repositories[repoName] = normalizedEntity;
          }
        }
      }

      // Check Mongoose model declarations: mongoose.model('User', schema)
      const callExpressions = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression);
      for (const call of callExpressions) {
        try {
          const expr = call.getExpression();
          if (expr.getText().includes("mongoose.model") || expr.getText().includes("model")) {
            const args = call.getArguments();
            if (args.length >= 1 && args[0].getKind() === SyntaxKind.StringLiteral) {
              const modelName = args[0].getText().replace(/['"`]/g, "");
              if (!entityOpsMap.has(modelName)) {
                entityOpsMap.set(modelName, new Set());
              }
            }
          }
        } catch {
          // Skip
        }
      }

      // Parse AST query pattern calls: e.g., prisma.user.findMany() or User.find()
      const queryOperations = new Set([
        "findMany", "findUnique", "findFirst", "find", "findOne",
        "create", "update", "delete", "destroy", "save",
        "insertOne", "insertMany", "aggregate", "select", "insert"
      ]);

      for (const call of callExpressions) {
        try {
          const expr = call.getExpression();
          if (expr.getKind() === SyntaxKind.PropertyAccessExpression) {
            const propAccess = expr as PropertyAccessExpression;
            const opName = propAccess.getName();

            if (queryOperations.has(opName)) {
              queryOpsCount++;
              const subExpr = propAccess.getExpression();

              // Case A: prisma.user.findMany()
              if (subExpr.getKind() === SyntaxKind.PropertyAccessExpression) {
                const subPropAccess = subExpr as PropertyAccessExpression;
                const baseText = subPropAccess.getExpression().getText();

                if (baseText === "prisma" || baseText === "db" || baseText.endsWith("Prisma")) {
                  const entity = subPropAccess.getName();
                  // Capitalize to normalize entity naming
                  const normalizedEntity = entity.charAt(0).toUpperCase() + entity.slice(1);
                  if (!entityOpsMap.has(normalizedEntity)) {
                    entityOpsMap.set(normalizedEntity, new Set());
                  }
                  entityOpsMap.get(normalizedEntity)!.add(this.mapOpType(opName));
                }
              }

              // Case B: User.find()
              if (subExpr.getKind() === SyntaxKind.Identifier) {
                const baseText = subExpr.getText();
                // Check if starts with Capital letter and is not a built-in noise word
                if (/^[A-Z][A-Za-z0-9_]*$/.test(baseText) && 
                    !["Promise", "Object", "Array", "String", "Number", "Boolean", "JSON", "Math", "Date", "Error", "Response", "Request", "Headers", "URL", "React"].includes(baseText)) {
                  if (!entityOpsMap.has(baseText)) {
                    entityOpsMap.set(baseText, new Set());
                  }
                  entityOpsMap.get(baseText)!.add(this.mapOpType(opName));
                }
              }
            }
          }
        } catch {
          // Skip
        }
      }
    }

    // 3. Schema.prisma file parsing (Prisma schema files) & Relationship Discovery
    const prismaFile = filePaths.find((f) => f.replace(/\\/g, "/").endsWith("schema.prisma"));
    if (prismaFile) {
      try {
        const schemaContent = await fs.readFile(path.join(repoPath, prismaFile), "utf8");
        
        // Parse relations from Prisma schema
        const modelBlocks = new Map<string, { name: string; fields: { name: string; type: string; isArray: boolean; isOptional: boolean }[] }>();
        const modelRegex = /model\s+([A-Za-z0-9_]+)\s*\{([^}]*)\}/gi;
        let match;
        while ((match = modelRegex.exec(schemaContent)) !== null) {
          const modelName = match[1];
          const body = match[2];
          const fields: any[] = [];
          const bodyLines = body.split("\n");
          for (const bodyLine of bodyLines) {
            const lineTrimmed = bodyLine.trim();
            if (!lineTrimmed || lineTrimmed.startsWith("//") || lineTrimmed.startsWith("@@")) continue;
            const parts = lineTrimmed.split(/\s+/);
            if (parts.length >= 2) {
              const fieldName = parts[0];
              let fieldType = parts[1];
              let isArray = false;
              let isOptional = false;
              if (fieldType.endsWith("[]")) {
                isArray = true;
                fieldType = fieldType.slice(0, -2);
              }
              if (fieldType.endsWith("?")) {
                isOptional = true;
                fieldType = fieldType.slice(0, -1);
              }
              fields.push({ name: fieldName, type: fieldType, isArray, isOptional });
            }
          }
          modelBlocks.set(modelName, { name: modelName, fields });
          if (!entityOpsMap.has(modelName)) {
            entityOpsMap.set(modelName, new Set());
          }
        }

        const seenRelations = new Set<string>();
        for (const [modelName, model] of modelBlocks.entries()) {
          for (const field of model.fields) {
            if (modelBlocks.has(field.type)) {
              const targetModelName = field.type;
              const targetModel = modelBlocks.get(targetModelName)!;
              const backField = targetModel.fields.find(f => f.type === modelName);

              let relFrom = modelName;
              let relTo = targetModelName;
              let relType = "one-to-many";

              if (field.isArray) {
                if (backField && backField.isArray) {
                  relType = "many-to-many";
                } else {
                  relType = "one-to-many";
                  relFrom = modelName;
                  relTo = targetModelName;
                }
              } else {
                if (backField && backField.isArray) {
                  relType = "one-to-many";
                  relFrom = targetModelName;
                  relTo = modelName;
                } else if (backField) {
                  relType = "one-to-one";
                } else {
                  relType = "many-to-one";
                }
              }

              const key = [relFrom, relTo, relType].sort().join("::");
              if (!seenRelations.has(key)) {
                seenRelations.add(key);
                relations.push({
                  from: relFrom,
                  to: relTo,
                  type: relType
                });
              }
            }
          }
        }

        const lines = schemaContent.split(/\r?\n/);
        for (const line of lines) {
          const trimmed = line.trim();
          const providerMatch = trimmed.match(/^provider\s*=\s*['"`]([A-Za-z0-9_]+)['"`]/i);
          if (providerMatch) {
            const provider = providerMatch[1].toLowerCase();
            if (provider === "postgresql") detectedDb = "PostgreSQL";
            else if (provider === "mongodb") detectedDb = "MongoDB";
            else if (provider === "mysql") detectedDb = "MySQL";
            else if (provider === "sqlite") detectedDb = "SQLite";
            else if (provider === "sqlserver") detectedDb = "SQL Server";
            else if (provider === "cockroachdb") detectedDb = "CockroachDB";
          }
        }
        if (!detectedOrm) detectedOrm = "Prisma";
      } catch {
        // Skip
      }
    }

    // Default connection defaults if none detected
    if (detectedOrm && !detectedDb) {
      if (detectedOrm === "Mongoose") detectedDb = "MongoDB";
      else if (detectedOrm === "Supabase") detectedDb = "PostgreSQL";
      else if (detectedOrm === "Firebase") detectedDb = "Firestore";
      else detectedDb = "PostgreSQL";
    }

    // Multi-database support
    const databasesSet = new Set<string>();
    if (detectedDb) databasesSet.add(detectedDb);
    if (parsedPkg && parsedPkg.dependencies) {
      const deps = parsedPkg.dependencies;
      if (deps["pg"] || deps["pg-pool"] || deps["postgres"]) databasesSet.add("PostgreSQL");
      if (deps["redis"] || deps["ioredis"]) databasesSet.add("Redis");
      if (deps["mongodb"] || deps["mongoose"]) databasesSet.add("MongoDB");
      if (deps["mysql"] || deps["mysql2"]) databasesSet.add("MySQL");
      if (deps["sqlite3"] || deps["better-sqlite3"]) databasesSet.add("SQLite");
      if (deps["@supabase/supabase-js"]) databasesSet.add("Supabase (PostgreSQL)");
      if (deps["firebase-admin"] || deps["firebase"]) databasesSet.add("Firebase");
    }
    const databases = Array.from(databasesSet);
    if (databases.length === 0 && detectedDb) {
      databases.push(detectedDb);
    }

    const entities: EntityOperationInfo[] = Array.from(entityOpsMap.entries()).map(([entity, ops]) => ({
      entity,
      operations: Array.from(ops).length > 0 ? Array.from(ops) : ["read"],
    }));

    entities.sort((a, b) => a.entity.localeCompare(b.entity));

    const metrics: DatabaseMetricsInfo = {
      entities: entities.length,
      repositories: Object.keys(repositories).length,
      queryOperations: queryOpsCount,
      database: detectedDb || "PostgreSQL",
    };

    logger.info(
      { orm: detectedOrm, db: detectedDb, connectionFile, entitiesCount: entities.length },
      "🔍 Database Discovery completed successfully"
    );

    return {
      type: detectedDb,
      orm: detectedOrm,
      connectionFile,
      entities,
      flows: [], // Populated by database-flow service later
      databases,
      relations,
      repositories,
      metrics,
    };
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
