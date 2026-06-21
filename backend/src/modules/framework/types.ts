export interface FrameworkInfo {
  name: string;
  confidence: number;
}

export interface FrameworkMetadata {
  frameworks: FrameworkInfo[];
  runtime: string;
  packageManager: string;
  language: string;
  monorepo: boolean;
}

export interface FrameworkRule {
  name: string;
  dependencies: string[];
  devDependencies?: string[];
  fileCues?: string[];
  codeCues?: string[];
}
