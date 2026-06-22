"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useAnalysisStore } from "../store/analysis.store";
import {
  submitGithubUrl, submitZipFile, submitLocalPath,
  submitChatMessage, getAnalysisStatus, getAnalysisResults,
  getImpactAnalysis, getStaticAnalysis, getRepositoryTimeline,
  getJobsList, getArchitectureDiff
} from "../lib/api/client";
import {
  RouteNode, EnvironmentVariable, EntityOperation, ArchitectureNode,
  ChatMessage, FileNode, ImpactAnalysis, StaticAnalysisReport, ArchitectureDiff,
  LearningStep
} from "@shared/types";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Progress } from "../components/ui/progress";
import { Input } from "../components/ui/input";
import { FileDropzone } from "../components/ui/dropzone";
import {
  Github, Binary, Network, Settings, FolderGit, Folder,
  CheckCircle2, Terminal, Layers, MessageSquare, Send,
  Sparkles, ChevronDown, ChevronUp, Loader2, Bot,
  Heart, AlertTriangle, Zap, Eye, Search, X, Play,
  Shield, Database, GitBranch, Activity, FileText, ArrowRight,
  GitCompare
} from "lucide-react";
import "@xyflow/react/dist/style.css";

import LayerView from "../components/architecture/LayerView";
import FileGraph from "../components/architecture/FileGraph";
import RouteGraph from "../components/architecture/RouteGraph";
import DependencyGraph from "../components/architecture/DependencyGraph";
import ExecutionTrace from "../components/architecture/ExecutionTrace";
import MetroMap from "../components/architecture/MetroMap/MetroMap";
import SubwayMap from "../components/architecture/SubwayMap/SubwayMap";
import ArchitectureViewer from "../components/architecture/ArchitectureViewer";

import IngestionControl from "../components/ingestion/IngestionControl";
import ProgressTracker from "../components/ingestion/ProgressTracker";
import OverviewAnalytics from "../components/diagnostics/OverviewAnalytics";
import AuthDetector from "../components/diagnostics/AuthDetector";
import LanguageBreakdown from "../components/diagnostics/LanguageBreakdown";

// ─── Types ─────────────────────────────────────────────────────────────────────

type ResultTab = "overview" | "arch" | "routes" | "db" | "health" | "impact" | "compare" | "env" | "ai-architect" | "onboarding";
type ArchViewMode = "layer" | "file" | "route" | "dependency" | "trace" | "metro" | "subway";

// ─── Health Score Calculator ───────────────────────────────────────────────────

function computeHealthScore(result: any) {
  if (!result) return null;
  const files: FileNode[] = result.files || [];
  const realFiles = files.filter((f: FileNode) =>
    !f.path.startsWith("ROUTE:") && !f.path.startsWith("ENV:") &&
    !f.path.startsWith("DB:") && !f.path.startsWith("ENTITY:")
  );

  const cycles = result.graph?.metrics?.cycles ?? 0;
  const deadFiles = realFiles.filter((f: FileNode) =>
    (f.referencedBy?.length ?? 0) === 0 && !f.path.includes("index") && !f.path.includes("main") && !f.path.includes("server")
  );
  const largeFiles = realFiles.filter((f: FileNode) => (f.lineCount ?? 0) > 500);
  const brokenImports = ((result.graphIssues ?? []) as any[]).filter((i: any) => i.type === "broken_edge" && i.severity === "error").length;

  const cycleDeduction = Math.min(30, cycles * 3);
  const deadDeduction = Math.min(20, deadFiles.length * 2);
  const brokenDeduction = Math.min(25, brokenImports * 5);
  const largeDeduction = Math.min(15, largeFiles.length * 1);

  const score = Math.max(0, 100 - cycleDeduction - deadDeduction - brokenDeduction - largeDeduction);
  return { score, cycles, deadFiles, largeFiles, brokenImports };
}

// ─── Auth Detector (frontend, deterministic) ──────────────────────────────────

function detectAuth(result: any) {
  if (!result) return null;
  const envVars: EnvironmentVariable[] = result.envVars || [];
  const routes: RouteNode[] = result.routes || [];

  const evidence: string[] = [];
  let authType = "None detected";

  if (envVars.some((e: EnvironmentVariable) => /jwt|jwt_secret|access_token_secret/i.test(e.name))) {
    authType = "JWT";
    evidence.push("JWT_SECRET environment variable");
  }
  if (envVars.some((e: EnvironmentVariable) => /oauth|client_id|client_secret/i.test(e.name))) {
    authType = "OAuth 2.0";
    evidence.push("OAUTH_CLIENT_ID / CLIENT_SECRET environment variables");
  }
  if (envVars.some((e: EnvironmentVariable) => /session_secret|session/i.test(e.name))) {
    authType = "Session-based";
    evidence.push("SESSION_SECRET environment variable");
  }
  if (envVars.some((e: EnvironmentVariable) => /nextauth|auth0|supabase|firebase|clerk/i.test(e.name))) {
    const match = envVars.find((e: EnvironmentVariable) => /nextauth|auth0|supabase|firebase|clerk/i.test(e.name));
    if (match?.name.toLowerCase().includes("nextauth")) { authType = "NextAuth.js"; evidence.push("NEXTAUTH_URL env var"); }
    if (match?.name.toLowerCase().includes("auth0")) { authType = "Auth0"; evidence.push("AUTH0_DOMAIN env var"); }
    if (match?.name.toLowerCase().includes("supabase")) { authType = "Supabase Auth"; evidence.push("SUPABASE_URL env var"); }
    if (match?.name.toLowerCase().includes("firebase")) { authType = "Firebase Auth"; evidence.push("FIREBASE_API_KEY env var"); }
    if (match?.name.toLowerCase().includes("clerk")) { authType = "Clerk"; evidence.push("CLERK_SECRET_KEY env var"); }
  }

  const authRoutes = routes.filter((r: RouteNode) => /auth|login|logout|token|refresh|oauth/i.test(r.path));
  if (authRoutes.length > 0) evidence.push(`${authRoutes.length} auth-related routes (${authRoutes.map(r => r.path).slice(0,3).join(", ")})`);

  const protectedRoutes = routes.filter((r: RouteNode) => (r.middleware?.length ?? 0) > 0);
  if (protectedRoutes.length > 0) evidence.push(`${protectedRoutes.length} routes have middleware protection`);

  const highCritEnvs = envVars.filter((e: EnvironmentVariable) => e.criticality === "HIGH" && /secret|key|password|token/i.test(e.name));
  if (highCritEnvs.length > 0) evidence.push(`${highCritEnvs.length} high-criticality secret env vars`);

  return { authType, evidence, authRoutes, protectedRoutes };
}

// ─── Execution Trace Builder ───────────────────────────────────────────────────

function buildExecutionTrace(route: RouteNode, result: any) {
  const steps: { id: string; label: string; type: string; sublabel?: string }[] = [];
  const envUsed: string[] = [];
  const entitiesUsed: string[] = [];

  // Step 1: Route
  steps.push({ id: "route", label: `${route.method} ${route.path}`, type: "route", sublabel: "HTTP Entry Point" });

  // Step 2: Middleware
  if (route.middleware && route.middleware.length > 0) {
    steps.push({ id: "middleware", label: route.middleware.join(", "), type: "middleware", sublabel: "Middleware Chain" });
  }

  // Steps 3+: Call chain files
  if (route.chain && route.chain.length > 0) {
    for (const chainFile of route.chain) {
      const basename = chainFile.split(/[\\/]/).pop() ?? chainFile;
      const noExt = basename.replace(/\.[^.]+$/, "");
      const lower = basename.toLowerCase();
      let type = "service";
      if (lower.includes("controller") || lower.includes("handler") || lower.includes("resolver")) type = "controller";
      else if (lower.includes("repository") || lower.includes("repo") || lower.includes("model")) type = "repository";
      else if (lower.includes("service")) type = "service";
      steps.push({ id: chainFile, label: noExt, type, sublabel: chainFile });
    }
  }

  // DB Flow matching
  const dbFlow = (result.metadata?.databaseInfo?.flows ?? []).find(
    (f: any) => f.route === route.path && f.method === route.method
  );
  if (dbFlow) {
    if (dbFlow.entities) {
      for (const ent of dbFlow.entities) {
        entitiesUsed.push(ent);
        steps.push({ id: `entity-${ent}`, label: ent, type: "entity", sublabel: "Database Entity" });
      }
    }
    const dbType = result.metadata?.databaseInfo?.type ?? "Database";
    steps.push({ id: "db", label: dbType, type: "database", sublabel: "Persistence Layer" });
  }

  // Env vars used by files in this chain
  const chainFiles = new Set(route.chain ?? []);
  chainFiles.add(route.file ?? "");
  (result.envVars ?? []).forEach((e: EnvironmentVariable) => {
    if ((e.files ?? []).some((f: string) => chainFiles.has(f))) {
      envUsed.push(e.name);
    }
  });

  return { steps, envUsed, entitiesUsed };
}



// ─── Main Component ─────────────────────────────────────────────────────────────

export default function Home() {
  const { currentJobId, status, result, setJob, setStatus, setResult, reset } = useAnalysisStore();

  // ── Ingestion Error State ──
  const [errorMessage, setErrorMessage] = useState("");

  // ── Result Tab State ──
  const [activeResultTab, setActiveResultTab] = useState<ResultTab>("overview");

  // ── Routes State ──
  const [routeSearch, setRouteSearch] = useState("");
  const [traceRoute, setTraceRoute] = useState<RouteNode | null>(null);
  const [traceAnimStep, setTraceAnimStep] = useState(-1);
  const traceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Env State ──
  const [envSearch, setEnvSearch] = useState("");
  const [selectedEnvVar, setSelectedEnvVar] = useState<EnvironmentVariable | null>(null);

  // ── DB State ──
  const [selectedEntity, setSelectedEntity] = useState<EntityOperation | null>(null);
  const [dbFlowSearch, setDbFlowSearch] = useState("");

  // ── Architecture State ──
  const [archViewMode, setArchViewMode] = useState<ArchViewMode>("layer");
  const [selectedTraceRouteId, setSelectedTraceRouteId] = useState<string>("");
  const [sidebarExpanded, setSidebarExpanded] = useState(true);

  // ── Compare State ──
  const [compareJobId, setCompareJobId] = useState("");
  const { data: jobsListData } = useQuery({
    queryKey: ["jobsList"],
    queryFn: getJobsList,
    refetchInterval: 30000, // Reduced from 5s to 30s to prevent 429 rate limit issues
  });
  const { data: compareData, isLoading: isCompareLoading } = useQuery({
    queryKey: ["compareJobs", currentJobId, compareJobId],
    queryFn: () => getArchitectureDiff(currentJobId!, compareJobId),
    enabled: !!currentJobId && !!compareJobId && activeResultTab === "compare",
  });

  // ── Health State ──
  const [healthSection, setHealthSection] = useState<"dead" | "cycles" | "broken" | "large" | "complexity" | "god" | "exports" | null>(null);

  // ── Impact State ──
  const [selectedImpactFile, setSelectedImpactFile] = useState("");
  const [impactSearch, setImpactSearch] = useState("");

  // ── Backend Queries ──
  const { data: staticAnalysisReport, isLoading: isStaticLoading } = useQuery({
    queryKey: ["staticAnalysis", currentJobId],
    queryFn: () => getStaticAnalysis(currentJobId!),
    enabled: !!currentJobId && activeResultTab === "health" && status === "completed",
  });

  const { data: impactData, isLoading: isImpactLoading } = useQuery({
    queryKey: ["impactAnalysis", currentJobId, selectedImpactFile],
    queryFn: () => getImpactAnalysis(currentJobId!, selectedImpactFile),
    enabled: !!currentJobId && !!selectedImpactFile && activeResultTab === "impact" && status === "completed",
  });

  const { data: timelineData, isLoading: isTimelineLoading } = useQuery({
    queryKey: ["timeline", currentJobId],
    queryFn: () => getRepositoryTimeline(currentJobId!),
    enabled: !!currentJobId && activeResultTab === "impact" && status === "completed",
  });

  // ── Onboarding State ──
  const [openOnboardingStep, setOpenOnboardingStep] = useState<number | null>(null);

  // ── Chat State ──
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMessage, setChatMessage] = useState("");
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [expandedAgentLogs, setExpandedAgentLogs] = useState<Record<string, boolean>>({});

  // ── Computed ──
  const healthData = computeHealthScore(result);
  const authData = detectAuth(result);

  const getTopRisks = () => {
    if (!result) return [];
    const files = result.files || [];
    const complexityList = staticAnalysisReport?.complexity || [];
    const godServicesList = staticAnalysisReport?.godServices || [];
    const deadFileList = staticAnalysisReport?.deadCode || [];
    
    const risks = files.filter((f: any) => {
      const pathLower = f.path.toLowerCase();
      return !pathLower.startsWith("route:") && !pathLower.startsWith("env:") && !pathLower.startsWith("db:") && !pathLower.startsWith("entity:") && !pathLower.includes(".config") && !pathLower.includes(".test");
    }).map((file: any) => {
      const comp = complexityList.find((c: any) => c.file === file.path);
      const god = godServicesList.find((g: any) => g.file === file.path);
      const isDead = deadFileList.some((d: any) => d.file === file.path);
      
      let threatScore = 0;
      if (comp) threatScore += comp.score * 2.5;
      else if (file.lineCount) threatScore += Math.min(25, file.lineCount / 20);

      if (god) threatScore += (god.methods || 0) * 2 + (god.exportedFunctions || 0) * 0.5;
      
      if (file.lineCount > 1000) threatScore += 25;
      else if (file.lineCount > 500) threatScore += 12;

      if (isDead) threatScore += 15;

      return {
        file: file.path,
        basename: file.path.split(/[\\/]/).pop() || file.path,
        score: Math.min(100, Math.round(threatScore)),
        complexity: comp?.score || null,
        methods: god?.methods || null,
        loc: file.lineCount || 0,
      };
    });

    return risks.sort((a, b) => b.score - a.score).slice(0, 3);
  };

  const topRisks = getTopRisks();

  const hasReport = !!staticAnalysisReport;
  const score = hasReport ? staticAnalysisReport.healthScore : (healthData?.score ?? 100);
  const deadCount = hasReport ? staticAnalysisReport.deadCode.length : (healthData?.deadFiles.length ?? 0);
  const cycleCount = hasReport ? staticAnalysisReport.cycles.length : (healthData?.cycles ?? 0);
  const brokenCount = healthData?.brokenImports ?? 0;
  const largeCount = hasReport ? staticAnalysisReport.largeFiles.length : (healthData?.largeFiles.length ?? 0);
  const complexCount = hasReport ? staticAnalysisReport.complexity.filter((c: any) => c.rating === "risky" || c.rating === "medium").length : 0;
  const godCount = hasReport ? staticAnalysisReport.godServices.length : 0;
  const unusedExportsCount = hasReport ? staticAnalysisReport.unusedExports.length : 0;

  // ── Trace animation ──
  const playTrace = useCallback((steps: any[]) => {
    setTraceAnimStep(0);
    let idx = 0;
    const tick = () => {
      idx++;
      if (idx < steps.length) {
        setTraceAnimStep(idx);
        traceRef.current = setTimeout(tick, 180);
      }
    };
    traceRef.current = setTimeout(tick, 180);
  }, []);

  useEffect(() => () => { if (traceRef.current) clearTimeout(traceRef.current); }, []);

  // ── Mutations ──
  const urlMutation = useMutation({
    mutationFn: submitGithubUrl,
    onSuccess: (data) => { setJob(data.jobId, "uploaded"); setErrorMessage(""); },
    onError: (error: Error) => setErrorMessage(error.message || "Failed to submit repository URL"),
  });
  const fileMutation = useMutation({
    mutationFn: submitZipFile,
    onSuccess: (data) => { setJob(data.jobId, "uploaded"); setErrorMessage(""); },
    onError: (error: Error) => setErrorMessage(error.message || "Failed to upload ZIP file"),
  });
  const localMutation = useMutation({
    mutationFn: submitLocalPath,
    onSuccess: (data) => { setJob(data.jobId, "uploaded"); setErrorMessage(""); },
    onError: (error: Error) => setErrorMessage(error.message || "Failed to submit local path"),
  });
  const chatMutation = useMutation({
    mutationFn: ({ jobId, message }: { jobId: string; message: string }) => submitChatMessage(jobId, message),
    onSuccess: (data) => setChatHistory((prev) => [...prev, data.message]),
    onError: (error: Error) => {
      const errMsg: ChatMessage = {
        id: Math.random().toString(36).substring(2, 11), role: "assistant",
        content: `Error: ${error.message || "Something went wrong."}`,
        timestamp: new Date().toISOString(), agentLogs: ["❌ Failed to get response from AI orchestrator."]
      };
      setChatHistory((prev) => [...prev, errMsg]);
    },
  });

  const { data: statusData } = useQuery({
    queryKey: ["status", currentJobId],
    queryFn: () => getAnalysisStatus(currentJobId!),
    enabled: !!currentJobId && status !== "completed" && status !== "failed",
    refetchInterval: 5000, // Reduced from 1.5s to 5s to prevent 429 rate limit issues
  });
  useEffect(() => { if (statusData?.status) setStatus(statusData.status); }, [statusData, setStatus]);

  const { data: resultData } = useQuery({
    queryKey: ["results", currentJobId],
    queryFn: () => getAnalysisResults(currentJobId!),
    enabled: !!currentJobId && status === "completed",
  });
  useEffect(() => { if (resultData) setResult(resultData); }, [resultData, setResult]);

  const handleFileDrop = (file: File) => {
    if (file.name.endsWith(".zip")) fileMutation.mutate(file);
    else setErrorMessage("Please upload a valid .zip compressed archive");
  };

  const isPending = urlMutation.isPending || fileMutation.isPending || localMutation.isPending;

  const getProgressValue = () => {
    switch (status) {
      case "uploaded": return 10; case "queued": return 20;
      case "cloning": case "extracting": return 45;
      case "scanning": return 75; case "completed": return 100;
      default: return 0;
    }
  };

  const getStatusVariant = () => {
    if (status === "completed") return "success";
    if (status === "failed") return "error";
    if (["cloning", "extracting", "scanning"].includes(status ?? "")) return "primary";
    return "secondary";
  };

  // ─── Render Tabs ──────────────────────────────────────────────────────────────

  const resultTabs: { id: ResultTab; label: string; icon: React.ReactNode; show: boolean }[] = [
    { id: "overview",     label: "Overview",      icon: <CheckCircle2 className="w-3.5 h-3.5" />,  show: true },
    { id: "arch",         label: "Architecture",  icon: <Layers className="w-3.5 h-3.5" />,        show: !!(result?.architecture?.graph) },
    { id: "routes",       label: "Routes",        icon: <Network className="w-3.5 h-3.5" />,       show: !!(result?.routes?.length) },
    { id: "db",           label: "Database",      icon: <Database className="w-3.5 h-3.5" />,      show: !!(result?.metadata?.databaseInfo?.entities?.length || result?.metadata?.databaseInfo?.orm) },
    { id: "health",       label: "Health",        icon: <Heart className="w-3.5 h-3.5" />,         show: !!(result?.graph?.metrics) },
    { id: "impact",       label: "Impact Analysis", icon: <Zap className="w-3.5 h-3.5" />,         show: !!(result?.graph?.metrics) },
    { id: "compare",      label: "Compare",       icon: <GitCompare className="w-3.5 h-3.5" />,    show: true },
    { id: "env",          label: "Environment",   icon: <Settings className="w-3.5 h-3.5" />,      show: !!(result?.envVars?.length) },
    { id: "ai-architect", label: "AI Architect",  icon: <Sparkles className="w-3.5 h-3.5" />,      show: !!(result?.aiSummary) },
    { id: "onboarding",   label: "Onboarding",    icon: <Terminal className="w-3.5 h-3.5" />,      show: !!(result?.onboarding) },
  ];

  // ─── Execution Trace Panel ────────────────────────────────────────────────────

  const renderExecutionTrace = () => {
    if (!traceRoute) return null;
    const { steps, envUsed } = buildExecutionTrace(traceRoute, result);

    const typeStyles: Record<string, string> = {
      route:      "bg-blue-950/60 border-blue-500/70 text-blue-300",
      middleware: "bg-orange-950/60 border-orange-500/70 text-orange-300",
      controller: "bg-amber-950/60 border-amber-500/70 text-amber-300",
      service:    "bg-primary/10 border-primary/60 text-primary",
      repository: "bg-purple-950/60 border-purple-500/70 text-purple-300",
      entity:     "bg-cyan-950/60 border-cyan-500/70 text-cyan-300",
      database:   "bg-red-950/60 border-red-500/70 text-red-300",
    };

    return (
      <div className="mt-4 rounded-2xl bg-zinc-950/80 border border-primary/20 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-zinc-900/60 border-b border-border/50">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-primary" />
            <span className="text-xs font-bold text-primary uppercase tracking-widest">Execution Trace</span>
            <code className="text-[10px] font-mono text-zinc-400 ml-1">{traceRoute.method} {traceRoute.path}</code>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setTraceAnimStep(-1); setTimeout(() => playTrace(steps), 50); }}
              className="flex items-center gap-1 px-2 py-1 rounded-lg bg-primary/10 border border-primary/30 text-primary text-[10px] font-bold hover:bg-primary/20 transition"
            >
              <Play className="w-3 h-3" /> Play
            </button>
            <button onClick={() => { setTraceRoute(null); setTraceAnimStep(-1); }} className="p-1 rounded-lg hover:bg-zinc-800 text-muted-foreground hover:text-white transition">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Flow Steps */}
          <div className="md:col-span-2 space-y-0">
            {steps.map((step, i) => {
              const visible = traceAnimStep === -1 || i <= traceAnimStep;
              return (
                <div key={step.id} className="flex flex-col items-center">
                  <div
                    className={`w-full transition-all duration-300 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"}`}
                    style={{ transitionDelay: `${i * 60}ms` }}
                  >
                    <div className={`p-3 rounded-xl border flex items-start gap-3 ${typeStyles[step.type] ?? typeStyles.service}`}>
                      <div className="flex flex-col items-center gap-1 shrink-0 mt-0.5">
                        <div className="w-5 h-5 rounded-full bg-current/20 flex items-center justify-center text-[9px] font-bold">{i + 1}</div>
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold font-mono truncate">{step.label}</div>
                        {step.sublabel && <div className="text-[9px] opacity-60 mt-0.5">{step.sublabel}</div>}
                      </div>
                    </div>
                  </div>
                  {i < steps.length - 1 && (
                    <div className={`w-px h-4 bg-border/50 transition-opacity duration-300 ${visible ? "opacity-100" : "opacity-0"}`} />
                  )}
                </div>
              );
            })}
          </div>

          {/* Side Panel */}
          <div className="space-y-3">
            {/* Env Used */}
            {envUsed.length > 0 && (
              <div className="p-3 rounded-xl bg-amber-950/20 border border-amber-800/40">
                <div className="text-[9px] font-bold text-amber-400 uppercase tracking-widest mb-2">Environment Used</div>
                <div className="space-y-1">
                  {envUsed.map(e => (
                    <code key={e} className="block text-[10px] font-mono text-amber-300">{e}</code>
                  ))}
                </div>
              </div>
            )}

            {/* Auth guard */}
            {(traceRoute.middleware?.length ?? 0) > 0 ? (
              <div className="p-3 rounded-xl bg-emerald-950/20 border border-emerald-800/40">
                <div className="text-[9px] font-bold text-emerald-400 uppercase tracking-widest mb-1">Auth Protected</div>
                <div className="flex flex-wrap gap-1">
                  {traceRoute.middleware!.map(m => <Badge key={m} variant="success" className="text-[9px]">{m}</Badge>)}
                </div>
              </div>
            ) : (
              <div className="p-3 rounded-xl bg-red-950/20 border border-red-800/40">
                <div className="flex items-center gap-1.5">
                  <AlertTriangle className="w-3 h-3 text-red-400" />
                  <span className="text-[9px] font-bold text-red-400">No Auth Middleware</span>
                </div>
                <p className="text-[9px] text-red-300/70 mt-1">This route has no detected middleware.</p>
              </div>
            )}

            {/* Method info */}
            <div className="p-3 rounded-xl bg-zinc-900/60 border border-border/50">
              <div className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest mb-2">Route Info</div>
              <div className="space-y-1 text-[10px]">
                <div><span className="text-zinc-500">Method:</span> <span className="text-zinc-200 font-mono font-bold">{traceRoute.method}</span></div>
                <div><span className="text-zinc-500">File:</span> <code className="text-emerald-400 text-[9px]">{(traceRoute.file ?? "").split(/[\\/]/).pop()}</code></div>
                {traceRoute.group && <div><span className="text-zinc-500">Group:</span> <span className="text-zinc-200">{traceRoute.group}</span></div>}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ─── MAIN RETURN ──────────────────────────────────────────────────────────────

  const visibleTabs = resultTabs.filter(t => t.show);

  // ─── Not yet started ───
  if (!currentJobId) {
    return (
      <main className="flex-1 flex flex-col items-center justify-start max-w-6xl w-full mx-auto px-4 py-16 relative">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-primary/5 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute top-10 right-10 w-[200px] h-[200px] bg-emerald-500/5 rounded-full blur-[60px] pointer-events-none" />
        <div className="text-center mb-16 z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-border bg-card/50 backdrop-blur-md mb-6 hover:border-primary/20 transition duration-300">
            <Terminal className="w-4 h-4 text-primary" />
            <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Repository Intelligence Platform</span>
          </div>
          <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight mb-6 bg-gradient-to-b from-white to-zinc-400 bg-clip-text text-transparent">
            Understand Any Codebase <br />
            <span className="bg-gradient-to-r from-primary to-emerald-400 bg-clip-text text-transparent">In 30 Seconds</span>
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto font-light leading-relaxed">
            AST Engine → Graph Engine → Route Engine → Database Engine → Auth Engine → Architecture Engine → AI
          </p>
        </div>
        <div className="w-full max-w-3xl z-10 mb-16">
          <IngestionControl
            onSubmitGithub={(url) => urlMutation.mutate(url)}
            onSubmitZip={(file) => fileMutation.mutate(file)}
            onSubmitLocal={(path) => localMutation.mutate(path)}
            isLoading={isPending}
            error={errorMessage}
          />
        </div>
      </main>
    );
  }

  // ─── In progress ───
  if (status !== "completed") {
    return (
      <main className="flex-1 flex flex-col items-center justify-center w-full px-4 py-16">
        <ProgressTracker
          status={status}
          progress={getProgressValue()}
          jobId={currentJobId}
          error={errorMessage}
        />
      </main>
    );
  }

  // ─── Awaiting result data (completed but result not loaded yet) ───
  if (!result) {
    return (
      <main className="flex-1 flex flex-col items-center justify-center w-full px-4 py-16">
        <ProgressTracker
          status={status}
          progress={99}
          jobId={currentJobId}
          error={null}
        />
      </main>
    );
  }

  // ─── Completed: full-screen sidebar dashboard ───

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-zinc-950">
      {/* ── Left Sidebar Navigation ─────────────────────────────────── */}
      <motion.aside
        initial={false}
        animate={{ width: sidebarExpanded ? 220 : 64 }}
        transition={{ duration: 0.25, ease: "easeInOut" }}
        className="bg-gradient-to-b from-zinc-900 to-zinc-950 flex flex-col shadow-2xl z-20 relative border-r border-border/30 shrink-0"
      >
        {/* Logo */}
        <div className="p-3 border-b border-border/30">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-emerald-400 flex items-center justify-center shadow-lg shrink-0">
              <Layers size={18} className="text-background" />
            </div>
            <AnimatePresence>
              {sidebarExpanded && (
                <motion.div
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  className="min-w-0 overflow-hidden"
                >
                  <h1 className="font-bold text-white text-sm truncate">Archaeologist</h1>
                  <p className="text-[10px] text-zinc-500 truncate">Repository Intelligence</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Job Info */}
        <AnimatePresence>
          {sidebarExpanded && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="px-3 py-2 border-b border-border/20 overflow-hidden"
            >
              <p className="text-[9px] text-zinc-600 uppercase tracking-widest font-bold">Active Job</p>
              <p className="text-[10px] font-mono text-zinc-400 truncate mt-0.5">{currentJobId}</p>
              <Badge variant={getStatusVariant() as any} className="mt-1 text-[9px]">{status}</Badge>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Nav Items */}
        <nav className="flex-1 p-2 overflow-y-auto space-y-0.5">
          {visibleTabs.map((tab) => {
            const isActive = activeResultTab === tab.id;
            return (
              <motion.button
                key={tab.id}
                onClick={() => setActiveResultTab(tab.id)}
                whileHover={{ x: sidebarExpanded ? 3 : 0 }}
                title={!sidebarExpanded ? tab.label : undefined}
                className={`w-full flex items-center gap-2.5 px-2 py-2.5 rounded-xl transition-all ${
                  isActive
                    ? "bg-primary/10 text-primary border border-primary/20"
                    : "text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/60"
                } ${!sidebarExpanded ? "justify-center" : ""}`}
              >
                <span className="shrink-0 w-4 h-4 flex items-center justify-center">{tab.icon}</span>
                <AnimatePresence>
                  {sidebarExpanded && (
                    <motion.span
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -8 }}
                      className="text-xs font-semibold tracking-wide truncate text-left flex-1"
                    >
                      {tab.label}
                    </motion.span>
                  )}
                </AnimatePresence>
              </motion.button>
            );
          })}
        </nav>

        {/* Reset Button */}
        <div className="p-2 border-t border-border/20">
          <button
            onClick={() => { reset(); }}
            className={`w-full flex items-center gap-2.5 px-2 py-2 rounded-xl text-zinc-600 hover:text-red-400 hover:bg-red-950/20 transition-all text-xs ${
              !sidebarExpanded ? "justify-center" : ""
            }`}
            title="New Analysis"
          >
            <X size={14} className="shrink-0" />
            <AnimatePresence>
              {sidebarExpanded && (
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="font-semibold"
                >
                  New Analysis
                </motion.span>
              )}
            </AnimatePresence>
          </button>
        </div>

        {/* Collapse Toggle */}
        <button
          onClick={() => setSidebarExpanded(!sidebarExpanded)}
          className="p-3 border-t border-border/20 text-zinc-600 hover:text-white transition-colors flex items-center justify-center"
        >
          <motion.div animate={{ rotate: sidebarExpanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
            <ChevronDown size={16} className="-rotate-90" />
          </motion.div>
        </button>
      </motion.aside>

      {/* ── Main Content ──────────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto overflow-x-hidden bg-zinc-950">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeResultTab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
            className="min-h-full p-6"
          >

            {/* ─── OVERVIEW TAB ─── */}
            {activeResultTab === "overview" && (
              <div className="space-y-6 max-w-5xl mx-auto">
                <div className="mb-6">
                  <p className="text-xs font-bold text-primary uppercase tracking-widest">Active Analysis</p>
                  <h2 className="text-2xl font-bold text-white mt-1">Repository Intelligence</h2>
                  <p className="text-sm text-zinc-500">Comprehensive analysis and metadata diagnostics</p>
                </div>
                <OverviewAnalytics
                  overview={result.overview}
                  frameworkMetadata={
                    result.metadata?.frameworkMetadata
                      ? {
                          language: result.metadata.frameworkMetadata.language,
                          runtime: result.metadata.frameworkMetadata.runtime,
                          packageManager: result.metadata.frameworkMetadata.packageManager,
                          frameworks: result.metadata.frameworkMetadata.frameworks
                        }
                      : undefined
                  }
                />
                <AuthDetector
                  authType={authData?.authType ?? "None detected"}
                  evidence={authData?.evidence ?? []}
                />
                {result.metadata?.languages && (
                  <LanguageBreakdown
                    languages={result.metadata.languages}
                    totalLines={result.metadata.totalLines}
                    entryPoints={result.metadata.entryPoints || []}
                  />
                )}
              </div>
            )}

            {/* ─── ARCHITECTURE TAB ─── */}
            {activeResultTab === "arch" && (
              <div className="w-full" style={{ height: "calc(100vh - 48px)" }}>
                <ArchitectureViewer
                  result={result}
                  onSwitchTab={setActiveResultTab}
                  onSetImpactFile={setSelectedImpactFile}
                  onSelectTraceRouteId={(routeId) => {
                    setSelectedTraceRouteId(routeId);
                    setActiveResultTab("arch");
                  }}
                />
              </div>
            )}

            {/* ─── ROUTES TAB ─── */}
            {activeResultTab === "routes" && (
              <div className="space-y-4 text-left max-w-5xl mx-auto">
                <div className="mb-6">
                  <p className="text-xs font-bold text-primary uppercase tracking-widest">Route Analysis</p>
                  <h2 className="text-2xl font-bold text-white mt-1">API Endpoints</h2>
                </div>
                <div className="flex items-center gap-3 mb-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <input
                      className="w-full pl-8 py-2 text-xs bg-zinc-900/80 border border-border/60 rounded-lg text-zinc-300 focus:outline-none focus:border-primary/40"
                      placeholder="Search routes..."
                      value={routeSearch}
                      onChange={(e) => setRouteSearch(e.target.value)}
                    />
                  </div>
                  {result.metadata?.routeMetrics && (
                    <div className="flex gap-1.5 shrink-0 flex-wrap">
                      {(Object.entries((result.metadata.routeMetrics as unknown) as Record<string, number>))
                        .filter(([k]) => k !== "total" && k !== "others")
                        .map(([method, count]) => (count as number) > 0 ? (
                          <Badge key={method} variant="secondary" className="text-[9px] uppercase">{method}: {count as number}</Badge>
                        ) : null)}
                    </div>
                  )}
                </div>

                {traceRoute && renderExecutionTrace()}

                <div className="space-y-2 max-h-[calc(100vh-280px)] overflow-y-auto pr-1">
                  {(result.routes ?? [])
                    .filter((r: RouteNode) => !routeSearch || r.path.toLowerCase().includes(routeSearch.toLowerCase()) || r.method.toLowerCase().includes(routeSearch.toLowerCase()))
                    .map((route: RouteNode, idx: number) => {
                      const methodColors: Record<string, string> = {
                        GET: "bg-emerald-950/40 text-emerald-400 border-emerald-800/60",
                        POST: "bg-blue-950/40 text-blue-400 border-blue-800/60",
                        PUT: "bg-amber-950/40 text-amber-400 border-amber-800/60",
                        PATCH: "bg-orange-950/40 text-orange-400 border-orange-800/60",
                        DELETE: "bg-red-950/40 text-red-400 border-red-800/60",
                      };
                      const mc = methodColors[route.method.toUpperCase()] ?? "bg-zinc-800/40 text-zinc-400 border-zinc-700/60";
                      const isTraced = traceRoute?.path === route.path && traceRoute?.method === route.method;

                      return (
                        <div key={`${route.method}-${route.path}-${idx}`}
                          onClick={() => setTraceRoute(isTraced ? null : route)}
                          className={`flex items-start gap-3 px-4 py-3 rounded-xl border cursor-pointer transition-all group ${
                            isTraced ? "bg-primary/10 border-primary/40" : "bg-zinc-900/60 border-border/40 hover:border-zinc-600/60"
                          }`}
                        >
                          <span className={`text-[10px] font-bold font-mono px-2 py-1 rounded-lg border shrink-0 ${mc}`}>{route.method}</span>
                          <div className="min-w-0 flex-1">
                            <code className="text-xs text-zinc-200 font-mono truncate block">{route.path}</code>
                            {route.file && <div className="text-[10px] text-zinc-600 font-mono truncate mt-0.5">{route.file}</div>}
                            {route.group && <Badge variant="secondary" className="text-[9px] mt-1">{route.group}</Badge>}
                          </div>
                          <div className="flex gap-1 shrink-0">
                            {(route.middleware ?? []).map(m => <Badge key={m} variant="primary" className="text-[9px]">{m}</Badge>)}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}

            {/* ─── DATABASE TAB ─── */}
            {activeResultTab === "db" && (
              <div className="space-y-6 max-w-5xl mx-auto">
                <div className="mb-6">
                  <p className="text-xs font-bold text-primary uppercase tracking-widest">Database Analysis</p>
                  <h2 className="text-2xl font-bold text-white mt-1">Schema & Entities</h2>
                </div>
                {result.metadata?.databaseInfo && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {result.metadata.databaseInfo.orm && <div className="bg-zinc-900/60 border border-border/50 rounded-xl p-4"><div className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1">ORM</div><div className="text-sm font-bold text-white">{result.metadata.databaseInfo.orm}</div></div>}
                    {result.metadata.databaseInfo.type && <div className="bg-zinc-900/60 border border-border/50 rounded-xl p-4"><div className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1">Database</div><div className="text-sm font-bold text-white">{result.metadata.databaseInfo.type}</div></div>}
                    <div className="bg-zinc-900/60 border border-border/50 rounded-xl p-4"><div className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1">Entities</div><div className="text-sm font-bold text-white">{result.metadata.databaseInfo.entities?.length ?? 0}</div></div>
                    <div className="bg-zinc-900/60 border border-border/50 rounded-xl p-4"><div className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1">Flows</div><div className="text-sm font-bold text-white">{result.metadata.databaseInfo.flows?.length ?? 0}</div></div>
                  </div>
                )}
                <div className="space-y-2 max-h-[calc(100vh-360px)] overflow-y-auto">
                  {(result.metadata?.databaseInfo?.entities ?? []).map((entity: EntityOperation, idx: number) => (
                    <div key={idx}
                      onClick={() => setSelectedEntity(selectedEntity?.entity === entity.entity ? null : entity)}
                      className={`p-4 rounded-xl border cursor-pointer transition-all ${
                        selectedEntity?.entity === entity.entity ? "bg-primary/10 border-primary/40" : "bg-zinc-900/60 border-border/40 hover:border-zinc-600"
                      }`}
                    >
                      <div className="flex items-center gap-3 mb-2">
                        <Database className="w-4 h-4 text-primary shrink-0" />
                        <span className="font-bold text-white text-sm">{entity.entity}</span>
                        <div className="flex gap-1 flex-wrap ml-auto">
                          {(entity.operations ?? []).map((op: string) => <Badge key={op} variant="secondary" className="text-[9px]">{op}</Badge>)}
                        </div>
                      </div>
                      {selectedEntity?.entity === entity.entity && (
                        <div className="mt-3 text-[11px] text-zinc-400 border-t border-border/20 pt-2">
                          <span className="text-zinc-500 font-bold uppercase tracking-wider text-[9px]">Active Operations:</span>
                          <div className="flex gap-2 mt-1">
                            {(entity.operations ?? []).map((op: string) => (
                              <span key={op} className="px-2 py-0.5 bg-zinc-800 rounded text-zinc-300 capitalize font-mono">{op}</span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ─── HEALTH TAB ─── */}
            {activeResultTab === "health" && (
              <div className="space-y-6 max-w-5xl mx-auto">
                <div className="mb-6">
                  <p className="text-xs font-bold text-primary uppercase tracking-widest">Code Quality</p>
                  <h2 className="text-2xl font-bold text-white mt-1">Health Diagnostics</h2>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-zinc-900/60 border border-border/50 rounded-xl p-4 col-span-2 md:col-span-1">
                    <div className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1">Health Score</div>
                    <div className={`text-4xl font-black ${score >= 80 ? 'text-emerald-400' : score >= 60 ? 'text-amber-400' : 'text-red-400'}`}>{score}</div>
                    <div className="text-[10px] text-zinc-600 mt-1">/100</div>
                  </div>
                  <div className="bg-zinc-900/60 border border-border/50 rounded-xl p-4"><div className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1">Cycles</div><div className="text-2xl font-bold text-red-400">{cycleCount}</div></div>
                  <div className="bg-zinc-900/60 border border-border/50 rounded-xl p-4"><div className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1">Dead Code</div><div className="text-2xl font-bold text-amber-400">{deadCount}</div></div>
                  <div className="bg-zinc-900/60 border border-border/50 rounded-xl p-4"><div className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1">Broken Imports</div><div className="text-2xl font-bold text-rose-400">{brokenCount}</div></div>
                </div>

                {isStaticLoading && <div className="flex items-center gap-2 text-zinc-500 text-xs"><Loader2 className="w-4 h-4 animate-spin" /> Loading detailed report...</div>}

                {hasReport && (
                  <div className="space-y-4">
                    {staticAnalysisReport.godServices?.length > 0 && (
                      <div className="bg-red-950/10 border border-red-900/30 rounded-xl p-4">
                        <div className="text-xs font-bold text-red-400 uppercase tracking-widest mb-3">God Services ({staticAnalysisReport.godServices.length})</div>
                        <div className="space-y-2">
                          {staticAnalysisReport.godServices.map((g: any, i: number) => (
                            <div key={i} className="flex items-center gap-3 text-xs">
                              <code className="text-zinc-300 font-mono truncate flex-1">{g.file}</code>
                              <Badge variant="error" className="text-[9px]">{g.methods} methods</Badge>
                              <Badge variant="secondary" className="text-[9px]">{g.loc} LOC</Badge>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {staticAnalysisReport.cycles?.length > 0 && (
                      <div className="bg-amber-950/10 border border-amber-900/30 rounded-xl p-4">
                        <div className="text-xs font-bold text-amber-400 uppercase tracking-widest mb-3">Circular Dependencies ({staticAnalysisReport.cycles.length})</div>
                        <div className="space-y-2">
                          {staticAnalysisReport.cycles.slice(0, 5).map((c: any, i: number) => (
                            <div key={i} className="flex items-start gap-2 text-[10px]">
                              <span className="text-zinc-600 font-bold mt-0.5">{i+1}.</span>
                              <code className="text-amber-300/80 font-mono">{Array.isArray(c) ? c.join(' → ') : c}</code>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {staticAnalysisReport.deadCode?.length > 0 && (
                      <div className="bg-zinc-900/60 border border-border/50 rounded-xl p-4">
                        <div className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-3">Dead Code ({staticAnalysisReport.deadCode.length})</div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                          {staticAnalysisReport.deadCode.slice(0, 10).map((f: any, i: number) => (
                            <code key={i} className="text-[10px] font-mono text-zinc-500 truncate">{typeof f === 'string' ? f : f.file}</code>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ─── IMPACT TAB ─── */}
            {activeResultTab === "impact" && (
              <div className="space-y-6 max-w-5xl mx-auto">
                <div className="mb-6">
                  <p className="text-xs font-bold text-primary uppercase tracking-widest">Change Analysis</p>
                  <h2 className="text-2xl font-bold text-white mt-1">Impact Analysis</h2>
                </div>
                <div className="flex gap-3 mb-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <input
                      className="w-full pl-8 py-2 text-xs bg-zinc-900/80 border border-border/60 rounded-lg text-zinc-300 focus:outline-none focus:border-primary/40"
                      placeholder="Search files to analyze impact..."
                      value={impactSearch}
                      onChange={(e) => setImpactSearch(e.target.value)}
                    />
                  </div>
                </div>
                {impactSearch && (
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {(result.files ?? []).filter((f: any) => !f.path.startsWith("ROUTE:") && !f.path.startsWith("ENV:") && !f.path.startsWith("DB:") && !f.path.startsWith("ENTITY:") && f.path.toLowerCase().includes(impactSearch.toLowerCase())).slice(0, 12).map((f: any, i: number) => (
                      <button key={i} onClick={() => setSelectedImpactFile(f.path)} className={`w-full text-left px-3 py-2 rounded-xl text-xs font-mono transition-all ${
                        selectedImpactFile === f.path ? "bg-primary/10 border border-primary/30 text-primary" : "bg-zinc-900/60 border border-border/40 text-zinc-400 hover:border-zinc-600"
                      }`}>{f.path}</button>
                    ))}
                  </div>
                )}
                {isImpactLoading && <div className="flex items-center gap-2 text-zinc-500 text-xs"><Loader2 className="w-4 h-4 animate-spin" /> Computing impact...</div>}
                {impactData && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-3 gap-4">
                      <div className="bg-zinc-900/60 border border-border/50 rounded-xl p-4"><div className="text-[10px] text-zinc-500 mb-1">Direct Impact</div><div className="text-2xl font-bold text-primary">{impactData.impact?.directDependents?.length ?? 0}</div></div>
                      <div className="bg-zinc-900/60 border border-border/50 rounded-xl p-4"><div className="text-[10px] text-zinc-500 mb-1">Transitive Impact</div><div className="text-2xl font-bold text-amber-400">{impactData.impact?.transitiveDependents?.length ?? 0}</div></div>
                      <div className="bg-zinc-900/60 border border-border/50 rounded-xl p-4"><div className="text-[10px] text-zinc-500 mb-1">Risk Score</div><div className="text-2xl font-bold text-red-400">{impactData.impact?.impactScore ?? 0}</div></div>
                    </div>
                    {impactData.impact?.directDependents && impactData.impact.directDependents.length > 0 && (
                      <div className="bg-zinc-900/60 border border-border/50 rounded-xl p-4">
                        <div className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-3">Directly Impacted Files</div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                          {impactData.impact.directDependents.slice(0, 10).map((f: string, i: number) => <code key={i} className="text-[10px] font-mono text-zinc-300 truncate">{f}</code>)}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ─── COMPARE TAB ─── */}
            {activeResultTab === "compare" && (
              <div className="space-y-6 max-w-5xl mx-auto">
                <div className="mb-6">
                  <p className="text-xs font-bold text-primary uppercase tracking-widest">Version Diff</p>
                  <h2 className="text-2xl font-bold text-white mt-1">Architecture Comparison</h2>
                </div>
                <div className="flex gap-3 items-end">
                  <div className="flex-1">
                    <label className="text-[10px] text-zinc-500 uppercase tracking-widest block mb-2">Compare with Job ID</label>
                    <input
                      className="w-full py-2 px-3 text-xs bg-zinc-900/80 border border-border/60 rounded-lg text-zinc-300 focus:outline-none focus:border-primary/40"
                      placeholder="Enter job ID to compare..."
                      value={compareJobId}
                      onChange={(e) => setCompareJobId(e.target.value)}
                    />
                  </div>
                  {jobsListData?.jobs && jobsListData.jobs.length > 0 && (
                    <select
                      className="py-2 px-3 text-xs bg-zinc-900/80 border border-border/60 rounded-lg text-zinc-300 focus:outline-none"
                      onChange={(e) => setCompareJobId(e.target.value)}
                      value={compareJobId}
                    >
                      <option value="">Select job...</option>
                      {jobsListData.jobs.filter((j: any) => j.jobId !== currentJobId).map((j: any) => (
                        <option key={j.jobId} value={j.jobId}>{j.jobId} ({j.status})</option>
                      ))}
                    </select>
                  )}
                </div>
                {isCompareLoading && <div className="flex items-center gap-2 text-zinc-500 text-xs"><Loader2 className="w-4 h-4 animate-spin" /> Running comparison...</div>}
                {compareData && (
                  <div className="space-y-6">
                    <div className="grid grid-cols-3 gap-4">
                      <div className="bg-emerald-950/10 border border-emerald-900/30 rounded-xl p-4"><div className="text-[10px] text-emerald-500 mb-1">Added Files</div><div className="text-2xl font-bold text-emerald-400">{compareData.summary?.addedFilesCount ?? 0}</div></div>
                      <div className="bg-red-950/10 border border-red-900/30 rounded-xl p-4"><div className="text-[10px] text-red-500 mb-1">Removed Files</div><div className="text-2xl font-bold text-red-400">{compareData.summary?.removedFilesCount ?? 0}</div></div>
                      <div className="bg-amber-950/10 border border-amber-900/30 rounded-xl p-4"><div className="text-[10px] text-amber-500 mb-1">Modified Files</div><div className="text-2xl font-bold text-amber-400">{compareData.summary?.modifiedFilesCount ?? 0}</div></div>
                    </div>
                    {compareData.files && compareData.files.length > 0 && (
                      <div className="bg-zinc-900/60 border border-border/50 rounded-xl p-4">
                        <div className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-3">File Changes</div>
                        <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                          {compareData.files.map((file, idx) => (
                            <div key={idx} className="flex items-center justify-between text-xs py-1 border-b border-zinc-800/60 last:border-0">
                              <span className="font-mono text-zinc-300 truncate max-w-[70%]">{file.path}</span>
                              <div className="flex items-center gap-2">
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded capitalize ${
                                  file.status === "added" ? "bg-emerald-500/10 text-emerald-400" :
                                  file.status === "removed" ? "bg-red-500/10 text-red-400" :
                                  "bg-amber-500/10 text-amber-400"
                                }`}>{file.status}</span>
                                {file.linesDiff !== 0 && (
                                  <span className={`font-mono text-[10px] ${file.linesDiff > 0 ? "text-emerald-400" : "text-red-400"}`}>
                                    {file.linesDiff > 0 ? `+${file.linesDiff}` : file.linesDiff} lines
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ─── ENV TAB ─── */}
            {activeResultTab === "env" && (
              <div className="space-y-4 max-w-5xl mx-auto">
                <div className="mb-6">
                  <p className="text-xs font-bold text-primary uppercase tracking-widest">Configuration</p>
                  <h2 className="text-2xl font-bold text-white mt-1">Environment Variables</h2>
                </div>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <input
                    className="w-full pl-8 py-2 text-xs bg-zinc-900/80 border border-border/60 rounded-lg text-zinc-300 focus:outline-none focus:border-primary/40"
                    placeholder="Search env vars..."
                    value={envSearch}
                    onChange={(e) => setEnvSearch(e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[calc(100vh-320px)] overflow-y-auto">
                  {(result.envVars ?? []).filter((e: EnvironmentVariable) => !envSearch || e.name.toLowerCase().includes(envSearch.toLowerCase())).map((envVar: EnvironmentVariable, idx: number) => (
                    <div key={idx}
                      onClick={() => setSelectedEnvVar(selectedEnvVar?.name === envVar.name ? null : envVar)}
                      className={`p-4 rounded-xl border cursor-pointer transition-all ${
                        selectedEnvVar?.name === envVar.name ? "bg-primary/10 border-primary/40" : "bg-zinc-900/60 border-border/40 hover:border-zinc-600"
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <Settings className="w-3.5 h-3.5 text-primary shrink-0" />
                        <code className="text-xs font-mono text-zinc-200 truncate flex-1">{envVar.name}</code>
                        <Badge variant="secondary" className="text-[9px]">{envVar.category || "General"}</Badge>
                        {envVar.criticality === "HIGH" && <Badge variant="error" className="text-[9px]">HIGH RISK</Badge>}
                      </div>
                      {selectedEnvVar?.name === envVar.name && (
                        <div className="space-y-1.5 mt-2">
                          <p className="text-[10px] text-zinc-400">Usages in code: <span className="text-zinc-200 font-bold">{envVar.usages}</span></p>
                          {envVar.usedBy && envVar.usedBy.length > 0 && (
                            <div className="text-[10px] text-zinc-400">
                              <span className="text-zinc-500 font-bold uppercase tracking-wider text-[8px] block mb-1">Used By:</span>
                              <div className="flex flex-wrap gap-1">
                                {envVar.usedBy.map((f: string, i: number) => <code key={i} className="text-[9px] font-mono text-zinc-400 bg-zinc-800/60 px-1.5 py-0.5 rounded truncate max-w-[120px]">{f.split(/[\\/]/).pop()}</code>)}
                              </div>
                            </div>
                          )}
                          {envVar.files && envVar.files.length > 0 && (
                            <div className="text-[10px] text-zinc-400 mt-2">
                              <span className="text-zinc-500 font-bold uppercase tracking-wider text-[8px] block mb-1">Declared In Files:</span>
                              <div className="flex flex-wrap gap-1">
                                {envVar.files.map((f: string, i: number) => <code key={i} className="text-[9px] font-mono text-zinc-500 bg-zinc-800/60 px-1.5 py-0.5 rounded truncate max-w-[120px]">{f.split(/[\\/]/).pop()}</code>)}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ─── AI ARCHITECT TAB ─── */}
            {activeResultTab === "ai-architect" && result.aiSummary && (
              <div className="space-y-6 max-w-5xl mx-auto">
                <div className="mb-6">
                  <p className="text-xs font-bold text-primary uppercase tracking-widest">AI Analysis</p>
                  <h2 className="text-2xl font-bold text-white mt-1">AI Architect</h2>
                </div>
                <div className="bg-zinc-900/60 border border-border/50 rounded-xl p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <Sparkles className="w-5 h-5 text-primary" />
                    <span className="text-sm font-bold text-white">Architecture Summary</span>
                  </div>
                  {result.aiSummary.purpose && (
                    <p className="text-sm text-zinc-300 leading-relaxed mb-4 font-semibold italic">
                      "{result.aiSummary.purpose}"
                    </p>
                  )}
                  {result.aiSummary.stack && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6 p-4 bg-zinc-950/40 rounded-xl border border-border/20">
                      {Object.entries(result.aiSummary.stack).map(([key, val]) => (
                        <div key={key} className="text-xs">
                          <span className="text-zinc-500 capitalize block mb-0.5">{key}</span>
                          <span className="text-zinc-200 font-medium font-mono">{String(val || 'N/A')}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {result.aiSummary.markdownSummary && (
                    <p className="text-sm text-zinc-400 leading-relaxed whitespace-pre-line border-t border-border/20 pt-4">
                      {result.aiSummary.markdownSummary}
                    </p>
                  )}
                </div>
                {result.staticAnalysis?.summary?.recommendations && result.staticAnalysis.summary.recommendations.length > 0 && (
                  <div className="bg-zinc-900/60 border border-border/50 rounded-xl p-6">
                    <div className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-4">Refactoring Recommendations</div>
                    <div className="space-y-2">
                      {result.staticAnalysis.summary.recommendations.map((item: string, i: number) => (
                        <div key={i} className="flex items-start gap-2 text-sm text-zinc-300">
                          <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                          <span>{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ─── ONBOARDING TAB ─── */}
            {activeResultTab === "onboarding" && result.onboarding && (
              <div className="space-y-6 max-w-5xl mx-auto">
                <div className="mb-6">
                  <p className="text-xs font-bold text-primary uppercase tracking-widest">Developer Guide</p>
                  <h2 className="text-2xl font-bold text-white mt-1">Onboarding Checklist</h2>
                </div>
                <div className="space-y-3">
                  {(result.onboarding.learningPath ?? []).map((step: LearningStep, idx: number) => (
                    <div key={idx}
                      onClick={() => setOpenOnboardingStep(openOnboardingStep === idx ? null : idx)}
                      className="bg-zinc-900/60 border border-border/40 rounded-xl p-4 cursor-pointer hover:border-zinc-600 transition-all"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary shrink-0">{idx + 1}</div>
                        <span className="text-sm font-semibold text-white flex-1">{step.label}</span>
                        <div className="text-[10px] text-zinc-500 font-mono bg-zinc-800/80 px-2 py-0.5 rounded capitalize">{step.category}</div>
                        {openOnboardingStep === idx ? <ChevronUp className="w-4 h-4 text-zinc-500" /> : <ChevronDown className="w-4 h-4 text-zinc-500" />}
                      </div>
                      {openOnboardingStep === idx && (
                        <div className="mt-3 ml-10 space-y-2">
                          {step.file && (
                            <p className="text-[10px] font-mono text-primary">
                              File: <span className="text-zinc-300">{step.file}</span>
                            </p>
                          )}
                          {step.reason && (
                            <p className="text-xs text-zinc-400 leading-relaxed">{step.reason}</p>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}

