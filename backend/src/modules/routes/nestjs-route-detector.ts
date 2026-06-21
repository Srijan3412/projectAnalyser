import { SourceFile } from "ts-morph";
import { RouteInfo } from "./types.js";

export class NestJSRouteDetector {
  /**
   * Scans NestJS controllers, methods, and route decorators in a class.
   */
  static detect(sourceFile: SourceFile, relativeFilePath: string): RouteInfo[] {
    const routes: RouteInfo[] = [];

    const classes = sourceFile.getClasses();
    for (const cls of classes) {
      // Check for @Controller() decorator
      const controllerDecorator = cls.getDecorator("Controller");
      if (!controllerDecorator) continue;

      // Extract controller prefix
      let controllerPrefix = "";
      const args = controllerDecorator.getArguments();
      if (args.length >= 1) {
        controllerPrefix = args[0].getText().replace(/['"`]/g, "");
      }

      // Ensure prefix starts with /
      if (controllerPrefix && !controllerPrefix.startsWith("/")) {
        controllerPrefix = "/" + controllerPrefix;
      }

      // Check all methods in the class
      for (const method of cls.getMethods()) {
        const routeDecorators = [
          { name: "Get", method: "GET" },
          { name: "Post", method: "POST" },
          { name: "Put", method: "PUT" },
          { name: "Delete", method: "DELETE" },
          { name: "Patch", method: "PATCH" },
          { name: "All", method: "ALL" },
        ];

        for (const decConfig of routeDecorators) {
          const dec = method.getDecorator(decConfig.name);
          if (dec) {
            let routePath = "";
            const decArgs = dec.getArguments();
            if (decArgs.length >= 1) {
              routePath = decArgs[0].getText().replace(/['"`]/g, "");
            }

            // Combine controllerPrefix and routePath
            let fullPath = controllerPrefix;
            if (routePath) {
              if (routePath.startsWith("/")) {
                fullPath = fullPath ? `${fullPath}${routePath}` : routePath;
              } else {
                fullPath = fullPath ? `${fullPath}/${routePath}` : `/${routePath}`;
              }
            }

            // Standardize path (remove duplicate slashes, leading/trailing formatting)
            fullPath = fullPath.replace(/\/+/g, "/");
            if (!fullPath.startsWith("/")) {
              fullPath = "/" + fullPath;
            }
            if (fullPath.length > 1 && fullPath.endsWith("/")) {
              fullPath = fullPath.slice(0, -1);
            }

            // Check for @UseGuards(), @UseInterceptors() on method or class level
            const middleware: string[] = [];
            const useGuardsMethod = method.getDecorator("UseGuards");
            if (useGuardsMethod) {
              useGuardsMethod.getArguments().forEach(arg => middleware.push(arg.getText()));
            }
            const useGuardsClass = cls.getDecorator("UseGuards");
            if (useGuardsClass) {
              useGuardsClass.getArguments().forEach(arg => middleware.push(arg.getText()));
            }
            const useInterceptorsMethod = method.getDecorator("UseInterceptors");
            if (useInterceptorsMethod) {
              useInterceptorsMethod.getArguments().forEach(arg => middleware.push(arg.getText()));
            }
            const useInterceptorsClass = cls.getDecorator("UseInterceptors");
            if (useInterceptorsClass) {
              useInterceptorsClass.getArguments().forEach(arg => middleware.push(arg.getText()));
            }

            // Extract group
            const segments = fullPath.split("/").filter(s => s && s !== "api" && !/^v[0-9]+$/i.test(s));
            const group = segments.length > 0 && !segments[0].startsWith(":") ? segments[0] : "default";

            // Extract version
            const vMatch = fullPath.match(/\/v([0-9]+)\b/i);
            const version = vMatch ? `v${vMatch[1]}` : undefined;

            routes.push({
              method: decConfig.method,
              path: fullPath || "/",
              framework: "NestJS",
              file: relativeFilePath,
              handler: `${cls.getName()}.${method.getName()}`,
              middleware: middleware.length > 0 ? middleware : undefined,
              group,
              version,
              confidence: 100,
            });
          }
        }
      }
    }

    return routes;
  }
}
