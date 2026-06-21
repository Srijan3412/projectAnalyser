export interface RouteInfo {
  method: string;
  path: string;
  framework?: string;
  file: string;
  handler?: string;
  middleware?: string[];
  group?: string;
  version?: string;
  confidence?: number;
  chain?: string[];
}

export interface RouteMetrics {
  total: number;
  get: number;
  post: number;
  put: number;
  delete: number;
  patch: number;
  others: number;
}
