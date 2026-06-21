import { QueryClient } from "@tanstack/react-query";
import { AnalysisResult, ChatMessage, AiArchitectSummary, OnboardingGuide, ImpactAnalysis, StaticAnalysisReport, ArchitectureDiff, ExecutionTrace, FeatureFlow, RepositorySubway } from "@shared/types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

export async function submitGithubUrl(url: string): Promise<{ jobId: string }> {
  const response = await fetch(`${API_BASE_URL}/api/analyze`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ url }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || "Failed to submit GitHub URL for analysis");
  }

  return response.json();
}

export async function submitZipFile(file: File): Promise<{ jobId: string }> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${API_BASE_URL}/api/analyze`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || "Failed to upload ZIP file for analysis");
  }

  return response.json();
}

export async function getAnalysisStatus(jobId: string): Promise<{ status: string }> {
  const response = await fetch(`${API_BASE_URL}/api/analyze/${jobId}/status`);
  if (!response.ok) {
    throw new Error("Failed to fetch job status");
  }
  return response.json();
}

export async function getAnalysisResults(jobId: string): Promise<AnalysisResult> {
  const response = await fetch(`${API_BASE_URL}/api/analyze/${jobId}/results`);
  if (!response.ok) {
    throw new Error("Failed to fetch analysis results");
  }
  return response.json();
}

export async function submitLocalPath(path: string): Promise<{ jobId: string }> {
  const response = await fetch(`${API_BASE_URL}/api/analyze`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ path, source: "local" }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || errorData.message || "Failed to submit local path for analysis");
  }

  return response.json();
}

export async function submitChatMessage(jobId: string, message: string): Promise<{ message: ChatMessage }> {
  const response = await fetch(`${API_BASE_URL}/api/analyze/${jobId}/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ message }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || errorData.message || "Failed to communicate with AI orchestrator");
  }

  return response.json();
}

export async function getAiSummary(jobId: string): Promise<{ aiSummary: AiArchitectSummary | null }> {
  const response = await fetch(`${API_BASE_URL}/api/analyze/${jobId}/ai-summary`);
  if (!response.ok) {
    throw new Error("Failed to fetch AI architecture summary");
  }
  return response.json();
}

export async function getOnboardingGuide(jobId: string): Promise<{ onboarding: OnboardingGuide | null }> {
  const response = await fetch(`${API_BASE_URL}/api/analyze/${jobId}/onboarding`);
  if (!response.ok) {
    throw new Error("Failed to fetch onboarding guide");
  }
  return response.json();
}

export async function getImpactAnalysis(jobId: string, file: string): Promise<{ impact: ImpactAnalysis; timeline: any[] }> {
  const response = await fetch(`${API_BASE_URL}/api/analyze/${jobId}/impact?file=${encodeURIComponent(file)}`);
  if (!response.ok) {
    throw new Error("Failed to fetch impact analysis");
  }
  return response.json();
}

export async function getStaticAnalysis(jobId: string): Promise<StaticAnalysisReport> {
  const response = await fetch(`${API_BASE_URL}/api/analyze/${jobId}/static`);
  if (!response.ok) {
    throw new Error("Failed to fetch static analysis report");
  }
  return response.json();
}

export async function getRepositoryTimeline(jobId: string): Promise<{ timeline: any[] }> {
  const response = await fetch(`${API_BASE_URL}/api/analyze/${jobId}/timeline`);
  if (!response.ok) {
    throw new Error("Failed to fetch repository timeline");
  }
  return response.json();
}

export async function getJobsList(): Promise<{ jobs: any[] }> {
  const response = await fetch(`${API_BASE_URL}/api/analyze/jobs`);
  if (!response.ok) {
    throw new Error("Failed to fetch jobs list");
  }
  return response.json();
}

export async function getArchitectureDiff(jobId: string, compareJobId: string): Promise<ArchitectureDiff> {
  const response = await fetch(`${API_BASE_URL}/api/analyze/${jobId}/compare/${compareJobId}`);
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || errorData.message || "Failed to compare architecture runs");
  }
  return response.json();
}

export async function getArchitectureLayers(jobId: string): Promise<{ layers: Record<string, string[]> }> {
  const response = await fetch(`${API_BASE_URL}/api/analyze/${jobId}/architecture`);
  if (!response.ok) {
    throw new Error("Failed to fetch architecture layers");
  }
  return response.json();
}

export async function getExecutionTraces(jobId: string): Promise<{ traces: ExecutionTrace[] }> {
  const response = await fetch(`${API_BASE_URL}/api/analyze/${jobId}/traces`);
  if (!response.ok) {
    throw new Error("Failed to fetch execution traces");
  }
  return response.json();
}

export async function getFileContent(jobId: string, filePath: string): Promise<{ content: string }> {
  const response = await fetch(`${API_BASE_URL}/api/analyze/${jobId}/file?path=${encodeURIComponent(filePath)}`);
  if (!response.ok) {
    throw new Error("Failed to fetch file contents");
  }
  return response.json();
}

export async function getFeaturesMap(jobId: string): Promise<{ features: FeatureFlow[] }> {
  const response = await fetch(`${API_BASE_URL}/api/analyze/${jobId}/features`);
  if (!response.ok) {
    throw new Error("Failed to fetch features map");
  }
  return response.json();
}

export async function getSubwayMap(jobId: string): Promise<{ subway: RepositorySubway; layout: { nodes: any[]; edges: any[] } }> {
  const response = await fetch(`${API_BASE_URL}/api/analyze/${jobId}/subway`);
  if (!response.ok) {
    throw new Error("Failed to fetch subway map");
  }
  return response.json();
}


