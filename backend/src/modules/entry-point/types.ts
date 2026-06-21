import { EntryPointInfo } from "@shared/types";

export interface EntryPointCandidate extends EntryPointInfo {}

export interface ParsedPackageJson {
  exists: boolean;
  name: string | null;
  main?: string;
  module?: string;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  scripts: Record<string, string>;
  workspaces: string[];
}
