import { RouteInfo } from "./types.js";

export class OpenApiExporter {
  /**
   * Generates an OpenAPI 3.0 spec from a list of discovered routes.
   */
  static generateSpec(repoName: string, routes: RouteInfo[]): any {
    const spec: any = {
      openapi: "3.0.0",
      info: {
        title: `${repoName} API Specification`,
        description: `Automatically extracted API documentation for ${repoName}.`,
        version: "1.0.0",
      },
      paths: {},
    };

    for (const route of routes) {
      // Convert Express/NestJS parameter style (:id) to OpenAPI curly-brace style ({id})
      let openApiPath = route.path.replace(/:([a-zA-Z0-9_]+)/g, "{$1}");

      if (!spec.paths[openApiPath]) {
        spec.paths[openApiPath] = {};
      }

      const methodLower = route.method.toLowerCase();

      // Extract path parameters
      const parameters: any[] = [];
      const paramMatches = route.path.match(/:([a-zA-Z0-9_]+)/g);
      if (paramMatches) {
        for (const match of paramMatches) {
          parameters.push({
            name: match.slice(1),
            in: "path",
            required: true,
            schema: {
              type: "string",
            },
          });
        }
      }

      // Format description with metadata
      const descriptionLines = [
        `**Framework**: ${route.framework}`,
        `**Handler**: \`${route.handler || "anonymous"}\``,
        `**File**: \`${route.file}\``,
      ];
      if (route.middleware && route.middleware.length > 0) {
        descriptionLines.push(`**Middleware**: ${route.middleware.map(m => `\`${m}\``).join(", ")}`);
      }
      if (route.confidence !== undefined) {
        descriptionLines.push(`**Confidence**: ${route.confidence}%`);
      }

      spec.paths[openApiPath][methodLower] = {
        summary: route.handler && route.handler !== "anonymous" 
          ? `Handler: ${route.handler}` 
          : `${route.method} ${route.path}`,
        description: descriptionLines.join("\n\n"),
        tags: route.group ? [route.group] : ["default"],
        parameters: parameters.length > 0 ? parameters : undefined,
        responses: {
          "200": {
            description: "Successful response details.",
          },
        },
      };
    }

    return spec;
  }
}
