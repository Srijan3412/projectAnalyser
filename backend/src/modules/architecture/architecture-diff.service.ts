import { AnalysisResult, ArchitectureDiff, RouteDiff, FileDiff, DependencyDiff } from "@shared/types";

export class ArchitectureDiffService {
  static compare(resultA: AnalysisResult, resultB: AnalysisResult): ArchitectureDiff {
    const filesA = resultA.files || [];
    const filesB = resultB.files || [];
    const routesA = resultA.routes || [];
    const routesB = resultB.routes || [];
    const depsA = resultA.dependencies || [];
    const depsB = resultB.dependencies || [];

    // Map files by path
    const fileMapA = new Map(filesA.map(f => [f.path, f]));
    const fileMapB = new Map(filesB.map(f => [f.path, f]));

    const fileDiffs: FileDiff[] = [];
    let addedFilesCount = 0;
    let removedFilesCount = 0;
    let modifiedFilesCount = 0;

    // Check files in B (added or modified)
    for (const fB of filesB) {
      const fA = fileMapA.get(fB.path);
      if (!fA) {
        fileDiffs.push({
          path: fB.path,
          status: "added",
          linesDiff: fB.lineCount || 0,
          sizeDiff: fB.size || 0
        });
        addedFilesCount++;
      } else {
        const lineCountA = fA.lineCount || 0;
        const lineCountB = fB.lineCount || 0;
        const sizeA = fA.size || 0;
        const sizeB = fB.size || 0;
        if (lineCountA !== lineCountB || sizeA !== sizeB) {
          fileDiffs.push({
            path: fB.path,
            status: "modified",
            linesDiff: lineCountB - lineCountA,
            sizeDiff: sizeB - sizeA
          });
          modifiedFilesCount++;
        }
      }
    }

    // Check files removed (in A but not B)
    for (const fA of filesA) {
      if (!fileMapB.has(fA.path)) {
        fileDiffs.push({
          path: fA.path,
          status: "removed",
          linesDiff: -(fA.lineCount || 0),
          sizeDiff: -(fA.size || 0)
        });
        removedFilesCount++;
      }
    }

    // Map routes by method:path
    const routeKey = (r: { method: string; path: string }) => `${r.method.toUpperCase()}:${r.path}`;
    const routeMapA = new Map(routesA.map(r => [routeKey(r), r]));
    const routeMapB = new Map(routesB.map(r => [routeKey(r), r]));

    const routeDiffs: RouteDiff[] = [];
    let addedRoutesCount = 0;
    let removedRoutesCount = 0;
    let modifiedRoutesCount = 0;

    // Check routes in B (added or modified)
    for (const rB of routesB) {
      const key = routeKey(rB);
      const rA = routeMapA.get(key);
      if (!rA) {
        routeDiffs.push({
          method: rB.method,
          path: rB.path,
          status: "added",
          details: `Defined in ${rB.file}`
        });
        addedRoutesCount++;
      } else {
        const fileChanged = rA.file !== rB.file;
        const chainA = (rA.chain || []).join(",");
        const chainB = (rB.chain || []).join(",");
        const chainChanged = chainA !== chainB;

        if (fileChanged || chainChanged) {
          const details: string[] = [];
          if (fileChanged) details.push(`Moved from ${rA.file} to ${rB.file}`);
          if (chainChanged) details.push(`Execution chain updated`);
          routeDiffs.push({
            method: rB.method,
            path: rB.path,
            status: "modified",
            details: details.join("; ") || "Handler or chain modified"
          });
          modifiedRoutesCount++;
        }
      }
    }

    // Check routes removed
    for (const rA of routesA) {
      const key = routeKey(rA);
      if (!routeMapB.has(key)) {
        routeDiffs.push({
          method: rA.method,
          path: rA.path,
          status: "removed",
          details: `Was defined in ${rA.file}`
        });
        removedRoutesCount++;
      }
    }

    // Map dependencies by source->target
    const depKey = (d: { source: string; target: string }) => `${d.source}->${d.target}`;
    const depSetA = new Set(depsA.map(d => depKey(d)));
    const depSetB = new Set(depsB.map(d => depKey(d)));

    const dependencyDiffs: DependencyDiff[] = [];

    for (const dB of depsB) {
      const key = depKey(dB);
      if (!depSetA.has(key)) {
        dependencyDiffs.push({
          source: dB.source,
          target: dB.target,
          status: "added"
        });
      }
    }

    for (const dA of depsA) {
      const key = depKey(dA);
      if (!depSetB.has(key)) {
        dependencyDiffs.push({
          source: dA.source,
          target: dA.target,
          status: "removed"
        });
      }
    }

    return {
      routes: routeDiffs,
      files: fileDiffs,
      dependencies: dependencyDiffs,
      summary: {
        addedRoutesCount,
        removedRoutesCount,
        modifiedRoutesCount,
        addedFilesCount,
        removedFilesCount,
        modifiedFilesCount
      }
    };
  }
}
