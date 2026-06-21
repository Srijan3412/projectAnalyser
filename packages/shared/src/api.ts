import { RepositoryStatus } from "./repository.js";
import { AnalysisResult } from "./analysis.js";

export interface CreateAnalysisRequest {
  url?: string;
  path?: string;
  source: "github" | "zip" | "local";
}

export interface CreateAnalysisResponse {
  jobId: string;
}

export interface AnalysisStatusResponse {
  status: RepositoryStatus;
}

export type AnalysisResultResponse = AnalysisResult;

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  agentLogs?: string[];
}

export interface ChatRequest {
  message: string;
}

export interface ChatResponse {
  message: ChatMessage;
}

