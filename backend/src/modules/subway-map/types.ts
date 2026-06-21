import { SubwayStation, SubwayLine, RepositorySubway } from "@shared/types";

export interface SubwayLayoutNode {
  id: string;
  type: string;
  data: {
    label: string;
    stationId: string;
  };
  position: { x: number; y: number };
  style?: any;
}

export interface SubwayLayoutEdge {
  id: string;
  source: string;
  target: string;
  animated?: boolean;
  style?: any;
}

export interface SubwayNetworkResponse {
  subway: RepositorySubway;
  layout: {
    nodes: SubwayLayoutNode[];
    edges: SubwayLayoutEdge[];
  };
}
