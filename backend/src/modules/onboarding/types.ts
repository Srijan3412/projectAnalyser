/**
 * Phase 12 — Onboarding Engine
 * Internal types for priority analysis and learning path construction.
 */

export type FileCategory =
  | "bootstrap"
  | "routing"
  | "auth"
  | "service"
  | "repository"
  | "database"
  | "config"
  | "other";

export interface RankedFile {
  file: string;
  fullPath: string;
  category: FileCategory;
  importanceScore: number;   // 0–100, based on referencedBy count and category weight
  referencedBy: number;
}
