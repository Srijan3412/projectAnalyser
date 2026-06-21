import { SourceFile } from "ts-morph";
import { RouteInfo } from "./types.js";
import path from "path";

export class NextRouteDetector {
  /**
   * Detects routes in Next.js App Router (app/api/**) and Pages Router (pages/api/**).
   */
  static detect(sourceFile: SourceFile, relativeFilePath: string): RouteInfo[] {
    const routes: RouteInfo[] = [];

    // Normalize relative path
    const normalizedPath = relativeFilePath.replace(/\\/g, "/");

    // 1. Next.js App Router (app/api/**/route.ts or route.js)
    if (normalizedPath.startsWith("app/api/") && (normalizedPath.endsWith("/route.ts") || normalizedPath.endsWith("/route.js"))) {
      const routeDir = path.dirname(normalizedPath).replace(/^app/, "");
      
      // Convert Next.js dynamic routing [id] or [...slug] to :id, :slug
      let routePath = routeDir
        .replace(/\[\.\.\.([^\]]+)\]/g, ":$1*")
        .replace(/\[([^\]]+)\]/g, ":$1");

      if (!routePath.startsWith("/")) {
        routePath = "/" + routePath;
      }

      // Check for exported functions GET, POST, PUT, DELETE, PATCH, etc.
      const httpMethods = ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"];
      
      // Extract group & version
      const segments = routePath.split("/").filter(s => s && s !== "api" && !/^v[0-9]+$/i.test(s));
      const group = segments.length > 0 && !segments[0].startsWith(":") ? segments[0] : "default";
      const vMatch = routePath.match(/\/v([0-9]+)\b/i);
      const version = vMatch ? `v${vMatch[1]}` : undefined;

      for (const func of sourceFile.getFunctions()) {
        if (func.isExported()) {
          const name = func.getName();
          if (name && httpMethods.includes(name.toUpperCase())) {
            routes.push({
              method: name.toUpperCase(),
              path: routePath,
              framework: "Next.js (App Router)",
              file: relativeFilePath,
              handler: name,
              group,
              version,
              confidence: 100,
            });
          }
        }
      }

      // Check for exported variable declarations (e.g. export const GET = ...)
      for (const varStatement of sourceFile.getVariableStatements()) {
        if (varStatement.isExported()) {
          for (const dec of varStatement.getDeclarations()) {
            const name = dec.getName();
            if (httpMethods.includes(name.toUpperCase())) {
              routes.push({
                method: name.toUpperCase(),
                path: routePath,
                framework: "Next.js (App Router)",
                file: relativeFilePath,
                handler: name,
                group,
                version,
                confidence: 100,
              });
            }
          }
        }
      }
    }

    // 2. Next.js Pages Router (pages/api/**/*.ts or pages/api/**/*.js)
    if (normalizedPath.startsWith("pages/api/") && (normalizedPath.endsWith(".ts") || normalizedPath.endsWith(".js"))) {
      const ext = path.extname(normalizedPath);
      let routePath = normalizedPath
        .replace(/^pages/, "")
        .replace(new RegExp(`${ext}$`), "")
        .replace(/\[\.\.\.([^\]]+)\]/g, ":$1*")
        .replace(/\[([^\]]+)\]/g, ":$1");

      if (!routePath.startsWith("/")) {
        routePath = "/" + routePath;
      }

      // Pages Router API handlers have a default export.
      // Let's parse string literal comparisons with req.method in the file.
      const text = sourceFile.getText();
      const detectedMethods = new Set<string>();
      const methodRegex = /req\.method\s*===?\s*['"`](GET|POST|PUT|DELETE|PATCH|OPTIONS|HEAD)['"`]/gi;
      let match;
      while ((match = methodRegex.exec(text)) !== null) {
        detectedMethods.add(match[1].toUpperCase());
      }

      if (detectedMethods.size === 0) {
        // Fallback: default to GET and POST
        detectedMethods.add("GET");
        detectedMethods.add("POST");
      }

      const segments = routePath.split("/").filter(s => s && s !== "api" && !/^v[0-9]+$/i.test(s));
      const group = segments.length > 0 && !segments[0].startsWith(":") ? segments[0] : "default";
      const vMatch = routePath.match(/\/v([0-9]+)\b/i);
      const version = vMatch ? `v${vMatch[1]}` : undefined;

      for (const method of detectedMethods) {
        routes.push({
          method,
          path: routePath,
          framework: "Next.js (Pages Router)",
          file: relativeFilePath,
          handler: "handler",
          group,
          version,
          confidence: 100,
        });
      }
    }

    return routes;
  }
}
