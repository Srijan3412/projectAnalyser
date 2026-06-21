import { create } from "zustand";
import { AnalysisResult } from "@shared/types";

interface AnalysisState {
  currentJobId: string | null;
  status: string;
  result: AnalysisResult | null;
  setJob: (jobId: string | null, status?: string) => void;
  setStatus: (status: string) => void;
  setResult: (result: AnalysisResult | null) => void;
  reset: () => void;
}

export const useAnalysisStore = create<AnalysisState>((set) => ({
  currentJobId: null,
  status: "idle",
  result: null,
  setJob: (jobId, status = "uploaded") => set({ currentJobId: jobId, status, result: null }),
  setStatus: (status) => set({ status }),
  setResult: (result) => set({ result }),
  reset: () => set({ currentJobId: null, status: "idle", result: null }),
}));
