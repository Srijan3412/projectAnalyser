import { FeatureFlow } from "@shared/types";

export interface FeatureDefinition {
  id: string;
  name: string;
  color: string;
  folders: RegExp[];
  routePrefixes: string[];
}
