import { Project } from "ts-morph";
import * as babelParser from "@babel/parser";
import { ImportExtractor } from "./import-extractor.js";
import { ExportExtractor } from "./export-extractor.js";
import { ParseResult } from "./types.js";
import { logger } from "../../core/logger/index.js";

export class FileParserService {
  private static project = new Project({ useInMemoryFileSystem: true });

  static parseFile(filePath: string, content: string): ParseResult {
    // 1. Try ts-morph first
    try {
      const sourceFile = this.project.createSourceFile(filePath, content, { overwrite: true });
      const imports = ImportExtractor.extractFromTsMorph(sourceFile);
      const exports = ExportExtractor.extractFromTsMorph(sourceFile);

      // Clean up memory
      this.project.removeSourceFile(sourceFile);

      return { imports, exports };
    } catch (err: any) {
      logger.warn({ filePath, err: err.message }, "⚠️ ts-morph parsing failed, falling back to Babel");
    }

    // 2. Fallback to Babel
    try {
      const ast = babelParser.parse(content, {
        sourceType: "module",
        plugins: [
          "jsx",
          "typescript",
          "decorators-legacy",
          "classProperties",
          "dynamicImport",
          "exportDefaultFrom",
          "objectRestSpread",
        ],
      });
      const imports = ImportExtractor.extractFromBabel(ast);
      const exports = ExportExtractor.extractFromBabel(ast);
      return { imports, exports };
    } catch (err: any) {
      logger.error({ filePath, err: err.message }, "❌ Babel parsing also failed for file");
      return { imports: [], exports: [] };
    }
  }
}
