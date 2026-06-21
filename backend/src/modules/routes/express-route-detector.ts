import { SourceFile, SyntaxKind } from "ts-morph";
import { RouteInfo } from "./types.js";

export class ExpressRouteDetector {
  /**
   * Scans Express, Fastify, Hono, or Koa style routes and mounts in a file.
   */
  static detect(
    sourceFile: SourceFile,
    relativeFilePath: string,
    framework: string
  ): { routes: RouteInfo[]; mounts: { prefix: string; routerVar: string; importedFrom?: string }[] } {
    const routes: RouteInfo[] = [];
    const mounts: { prefix: string; routerVar: string; importedFrom?: string }[] = [];

    // Find all call expressions
    const callExpressions = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression);

    // Get all imports to map variable names to their source files (for mount resolving)
    const imports: Record<string, string> = {};
    for (const importDecl of sourceFile.getImportDeclarations()) {
      const moduleSpec = importDecl.getModuleSpecifierValue();
      for (const spec of importDecl.getNamedImports()) {
        imports[spec.getName()] = moduleSpec;
      }
      const defaultImport = importDecl.getDefaultImport();
      if (defaultImport) {
        imports[defaultImport.getText()] = moduleSpec;
      }
      const namespaceImport = importDecl.getNamespaceImport();
      if (namespaceImport) {
        imports[namespaceImport.getText()] = moduleSpec;
      }
    }

    for (const call of callExpressions) {
      const expression = call.getExpression();
      
      // Look for e.g. router.get("/users", handler) or app.post(...)
      if (expression.getKind() === SyntaxKind.PropertyAccessExpression) {
        const propAccess = expression.asKindOrThrow(SyntaxKind.PropertyAccessExpression);
        const propName = propAccess.getName().toLowerCase(); // "get", "post", "use", "register", etc.
        const args = call.getArguments();

        if (args.length >= 1) {
          const firstArg = args[0];
          
          // Case 1: Route definition (get, post, put, delete, patch, options, head)
          const httpMethods = new Set(["get", "post", "put", "delete", "patch", "options", "head"]);
          if (httpMethods.has(propName)) {
            const isLiteral = firstArg.getKind() === SyntaxKind.StringLiteral || firstArg.getKind() === SyntaxKind.NoSubstitutionTemplateLiteral;
            const routePath = isLiteral ? firstArg.getText().replace(/['"`]/g, "") : firstArg.getText();
            const confidence = isLiteral ? 100 : 60;

            let handlerName: string | undefined;
            if (args.length >= 2) {
              handlerName = args[args.length - 1].getText();
              if (handlerName.includes("=>") || handlerName.includes("function")) {
                handlerName = "anonymous";
              }
            }

            const middleware: string[] = [];
            for (let i = 1; i < args.length - 1; i++) {
              const midText = args[i].getText();
              if (!midText.includes("=>") && !midText.includes("function")) {
                middleware.push(midText);
              }
            }

            // Extract group
            const segments = routePath.split("/").filter(s => s && s !== "api" && !/^v[0-9]+$/i.test(s));
            const group = segments.length > 0 && !segments[0].startsWith(":") ? segments[0] : "default";

            // Extract version
            const vMatch = routePath.match(/\/v([0-9]+)\b/i);
            const version = vMatch ? `v${vMatch[1]}` : undefined;

            routes.push({
              method: propName.toUpperCase(),
              path: routePath,
              framework,
              file: relativeFilePath,
              handler: handlerName,
              middleware: middleware.length > 0 ? middleware : undefined,
              group,
              version,
              confidence,
            });
          }

          // Case 2: Route mount (use, register, route)
          const mountMethods = new Set(["use", "register", "route"]);
          if (mountMethods.has(propName)) {
            if (args.length === 1 && firstArg.getKind() === SyntaxKind.Identifier) {
              // E.g., app.use(authRouter)
              const routerVarMounted = firstArg.getText();
              const importedFrom = imports[routerVarMounted];
              mounts.push({
                prefix: "",
                routerVar: routerVarMounted,
                importedFrom,
              });
            } else if (args.length >= 2 && args[1].getKind() === SyntaxKind.Identifier) {
              // E.g., app.use("/auth", authRouter)
              if (firstArg.getKind() === SyntaxKind.StringLiteral || firstArg.getKind() === SyntaxKind.NoSubstitutionTemplateLiteral) {
                const routePath = firstArg.getText().replace(/['"`]/g, "");
                const routerVarMounted = args[1].getText();
                const importedFrom = imports[routerVarMounted];
                mounts.push({
                  prefix: routePath,
                  routerVar: routerVarMounted,
                  importedFrom,
                });
              }
            }
          }
        }
      }
    }

    return { routes, mounts };
  }
}
