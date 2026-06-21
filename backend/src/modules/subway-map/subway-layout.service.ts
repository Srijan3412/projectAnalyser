import { RepositorySubway, SubwayStation } from "@shared/types";
import { SubwayLayoutNode, SubwayLayoutEdge, SubwayNetworkResponse } from "./types.js";
import { FEATURE_DEFS } from "../feature-map/feature-detector.service.js";

export class SubwayLayoutService {
  static layout(subway: RepositorySubway): { nodes: SubwayLayoutNode[]; edges: SubwayLayoutEdge[] } {
    const nodes: SubwayLayoutNode[] = [];
    const edges: SubwayLayoutEdge[] = [];

    const lines = subway.lines;
    const stations = subway.stations;

    // Track coordinates: positions[lineId][stationId] = { x, y }
    const positions: Record<string, Record<string, { x: number; y: number }>> = {};

    // 1. Initialize Positions (spaced vertically and horizontally)
    lines.forEach((line, fIdx) => {
      positions[line.feature] = {};
      line.stations.forEach((sId, stepIdx) => {
        positions[line.feature][sId] = {
          x: stepIdx * 250,
          y: fIdx * 250 + 100
        };
      });
    });

    // 2. Identify shared stations and group their instances
    const keyToInstances: Record<string, { lineId: string; nodeId: string }[]> = {};
    lines.forEach((line) => {
      line.stations.forEach((sId) => {
        const nodeId = `subway:${line.feature}:${sId}`;
        if (!keyToInstances[sId]) {
          keyToInstances[sId] = [];
        }
        keyToInstances[sId].push({
          lineId: line.feature,
          nodeId
        });
      });
    });

    // 3. Relaxation loop: Align vertical transfer columns
    for (let iter = 0; iter < 3; iter++) {
      Object.entries(keyToInstances).forEach(([sId, instances]) => {
        if (instances.length > 1) {
          // Calculate max X position
          let maxX = 0;
          instances.forEach((inst) => {
            const pos = positions[inst.lineId]?.[sId];
            if (pos && pos.x > maxX) {
              maxX = pos.x;
            }
          });

          // Apply shift to align all instances vertically
          instances.forEach((inst) => {
            const pos = positions[inst.lineId]?.[sId];
            if (pos) {
              const shift = maxX - pos.x;
              if (shift > 0) {
                const lineStations = lines.find(l => l.feature === inst.lineId)?.stations || [];
                const stationIdx = lineStations.findIndex(id => id === sId);
                if (stationIdx >= 0) {
                  // Shift this station and all subsequent ones on this line to maintain relative spacing
                  for (let i = stationIdx; i < lineStations.length; i++) {
                    const id = lineStations[i];
                    if (positions[inst.lineId]?.[id]) {
                      positions[inst.lineId][id].x += shift;
                    }
                  }
                }
              }
            }
          });
        }
      });
    }

    // 4. Generate ReactFlow Nodes
    lines.forEach((line) => {
      line.stations.forEach((sId) => {
        const pos = positions[line.feature]?.[sId];
        if (!pos) return;

        const nodeId = `subway:${line.feature}:${sId}`;
        const stationInfo = stations.find(s => s.id === sId);
        
        flowNodesPush(nodes, nodeId, stationInfo, sId, pos);
      });
    });

    // 5. Generate Horizontal Tube Lines (Track Edges)
    lines.forEach((line) => {
      const lineThickness = Math.max(3, Math.min(8, 3 + line.stations.length * 0.25));

      for (let i = 0; i < line.stations.length - 1; i++) {
        const sourceId = `subway:${line.feature}:${line.stations[i]}`;
        const targetId = `subway:${line.feature}:${line.stations[i + 1]}`;

        edges.push({
          id: `subway-edge:${line.feature}:${sourceId}:${targetId}`,
          source: sourceId,
          target: targetId,
          animated: false,
          style: {
            stroke: line.color,
            strokeWidth: lineThickness,
            opacity: 0.8
          }
        });
      }
    });

    // 6. Generate Vertical Transfer Connector Tunnels
    Object.entries(keyToInstances).forEach(([sId, instances]) => {
      if (instances.length > 1) {
        // Sort instances vertically by their Y coordinate (feature line index)
        const sortedInst = [...instances].sort((a, b) => {
          const fIdxA = lines.findIndex(l => l.feature === a.lineId);
          const fIdxB = lines.findIndex(l => l.feature === b.lineId);
          return fIdxA - fIdxB;
        });

        for (let i = 0; i < sortedInst.length - 1; i++) {
          const src = sortedInst[i];
          const dest = sortedInst[i + 1];

          edges.push({
            id: `subway-transfer:${sId}:${src.nodeId}:${dest.nodeId}`,
            source: src.nodeId,
            target: dest.nodeId,
            animated: false,
            style: {
              stroke: "#71717a", // zinc gray
              strokeWidth: 6,
              strokeDasharray: "4 4",
              opacity: 0.7
            }
          });
        }
      }
    });

    return {
      nodes,
      edges
    };
  }
}

// Private helper to isolate node construction and avoid type errors
function flowNodesPush(
  nodes: SubwayLayoutNode[],
  nodeId: string,
  stationInfo: SubwayStation | undefined,
  sId: string,
  pos: { x: number; y: number }
) {
  nodes.push({
    id: nodeId,
    type: "default",
    data: {
      label: sId,
      stationId: sId
    },
    position: pos,
    style: { background: "transparent", border: "none", padding: 0 }
  });
}
