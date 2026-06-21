import { SourceFile } from "ts-morph";

export class ExportExtractor {
  static extractFromTsMorph(sourceFile: SourceFile): string[] {
    const exports: string[] = [];
    try {
      for (const [name] of sourceFile.getExportedDeclarations()) {
        exports.push(name);
      }
    } catch {
      // Fallback if symbol resolution fails
    }
    return Array.from(new Set(exports));
  }

  static extractFromBabel(ast: any): string[] {
    const exports: string[] = [];

    const walk = (node: any) => {
      if (!node || typeof node !== "object") return;

      if (node.type === "ExportNamedDeclaration") {
        if (node.declaration) {
          const decl = node.declaration;
          if (decl.type === "VariableDeclaration") {
            for (const d of decl.declarations) {
              if (d.id && d.id.name) {
                exports.push(d.id.name);
              } else if (d.id && d.id.type === "ObjectPattern") {
                const extractObjectPatternNames = (pattern: any) => {
                  for (const prop of pattern.properties) {
                    if (prop.value) {
                      if (prop.value.name) {
                        exports.push(prop.value.name);
                      } else if (prop.value.type === "ObjectPattern") {
                        extractObjectPatternNames(prop.value);
                      }
                    }
                  }
                };
                extractObjectPatternNames(d.id);
              }
            }
          } else if (decl.id && decl.id.name) {
            exports.push(decl.id.name);
          }
        }
        if (node.specifiers) {
          for (const spec of node.specifiers) {
            if (spec.exported && spec.exported.name) {
              exports.push(spec.exported.name);
            }
          }
        }
      } else if (node.type === "ExportDefaultDeclaration") {
        exports.push("default");
      } else if (node.type === "ExportAllDeclaration") {
        exports.push("*");
      }

      for (const key in node) {
        if (node[key] && typeof node[key] === "object") {
          if (Array.isArray(node[key])) {
            node[key].forEach(walk);
          } else {
            walk(node[key]);
          }
        }
      }
    };

    walk(ast);
    return Array.from(new Set(exports));
  }
}
