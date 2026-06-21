export interface EntityOperationInfo {
  entity: string;
  operations: string[];
}

export interface EntityRelationInfo {
  from: string;
  to: string;
  type: string;
}

export interface DatabaseMetricsInfo {
  entities: number;
  repositories: number;
  queryOperations: number;
  database: string;
}

export interface DatabaseFlowInfo {
  route: string;
  method: string;
  chain: string[];
  database: string;
  entities?: string[];
  operations?: string[];
  transactionChain?: string[];
}

export interface DatabaseDiscoveryInfo {
  type?: string;
  orm?: string;
  connectionFile?: string;
  entities: EntityOperationInfo[];
  flows: DatabaseFlowInfo[];
  databases?: string[];
  relations?: EntityRelationInfo[];
  repositories?: Record<string, string>;
  metrics?: DatabaseMetricsInfo;
}
