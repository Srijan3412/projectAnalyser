import { SourceFile, SyntaxKind } from "ts-morph";

export class ImportExtractor {
  static extractFromTsMorph(sourceFile: SourceFile): string[] {
    const imports: string[] = [];

    // 1. ES Imports
    for (const decl of sourceFile.getImportDeclarations()) {
      const moduleSpecifier = decl.getModuleSpecifierValue();
      if (moduleSpecifier) {
        imports.push(moduleSpecifier);
      }
    }

    // 2. CommonJS require & dynamic import()
    try {
      const callExpressions = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression);
      for (const call of callExpressions) {
        const callee = call.getExpression();
        const args = call.getArguments();

        if (callee.getText() === "require" && args.length === 1) {
          const arg = args[0];
          if (arg.getKind() === SyntaxKind.StringLiteral || arg.getKind() === SyntaxKind.NoSubstitutionTemplateLiteral) {
            const text = arg.getText().replace(/['"`]/g, "");
            imports.push(text);
          }
        }
      }
    } catch {
      // Ignored if parser traversal fails
    }

    try {
      const callExpressions = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression);
      for (const call of callExpressions) {
        const callee = call.getExpression();
        if (callee.getKind() === SyntaxKind.ImportKeyword) {
          const args = call.getArguments();
          if (args.length === 1) {
            const arg = args[0];
            if (arg.getKind() === SyntaxKind.StringLiteral || arg.getKind() === SyntaxKind.NoSubstitutionTemplateLiteral) {
              const text = arg.getText().replace(/['"`]/g, "");
              imports.push(text);
            }
          }
        }
      }
    } catch {
      // Ignored
    }

    return Array.from(new Set(imports));
  }

  static extractFromBabel(ast: any): string[] {
    const imports: string[] = [];

    const walk = (node: any) => {
      if (!node || typeof node !== "object") return;

      if (node.type === "ImportDeclaration") {
        if (node.source && node.source.value) {
          imports.push(node.source.value);
        }
      } else if (node.type === "CallExpression") {
        if (node.callee && node.callee.name === "require" && node.arguments.length === 1) {
          const arg = node.arguments[0];
          if (arg.type === "StringLiteral" || arg.type === "Literal") {
            imports.push(arg.value);
          } else if (arg.type === "TemplateLiteral" && arg.quasis && arg.quasis.length === 1) {
            imports.push(arg.quasis[0].value.cooked);
          }
        } else if (node.callee && node.callee.type === "Import" && node.arguments.length === 1) {
          const arg = node.arguments[0];
          if (arg.type === "StringLiteral" || arg.type === "Literal") {
            imports.push(arg.value);
          } else if (arg.type === "TemplateLiteral" && arg.quasis && arg.quasis.length === 1) {
            imports.push(arg.quasis[0].value.cooked);
          }
        }
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
    return Array.from(new Set(imports));
  }
}
