export interface EnvironmentVariableInfo {
  name: string;
  category: string;
  files: string[];
  usages: number;
  usedBy?: string[];
  criticality?: "HIGH" | "LOW";
}
