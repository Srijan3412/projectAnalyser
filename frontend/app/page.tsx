"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
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
  ChatMessage, FileNode, ImpactAnalysis, StaticAnalysisReport, ArchitectureDiff
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

  // ── Input State ──
  const [githubUrl, setGithubUrl] = useState("");
  const [localPath, setLocalPath] = useState("c:\\Users\\91798\\Documents\\New folder (3)");
  const [errorMessage, setErrorMessage] = useState("");
  const [activeTab, setActiveTab] = useState<"github" | "zip" | "local">("github");

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

  // ── Compare State ──
  const [compareJobId, setCompareJobId] = useState("");
  const { data: jobsListData } = useQuery({
    queryKey: ["jobsList"],
    queryFn: getJobsList,
    refetchInterval: 5000,
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
    refetchInterval: 1500,
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

  return (
    <main className="flex-1 flex flex-col items-center justify-start max-w-6xl w-full mx-auto px-4 py-16 relative">
      {/* Decorative Glows */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-primary/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute top-10 right-10 w-[200px] h-[200px] bg-emerald-500/5 rounded-full blur-[60px] pointer-events-none" />

      {/* Hero */}
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

      {/* Main Action Block */}
      <div className="w-full max-w-3xl z-10 mb-16">
        {!currentJobId ? (
          <div className="space-y-6">
            {/* Input Tab Selector */}
            <div className="flex justify-center bg-zinc-900/60 p-1.5 rounded-2xl border border-border/60 max-w-md mx-auto backdrop-blur-md">
              {(["github", "zip", "local"] as const).map((tab) => (
                <button key={tab} type="button"
                  onClick={() => { setActiveTab(tab); setErrorMessage(""); }}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold tracking-wider transition-all duration-300 ${activeTab === tab ? "bg-primary text-background shadow-lg font-bold" : "text-muted-foreground hover:text-white"}`}
                >
                  {tab === "github" && <><Github className="w-4 h-4" />GitHub URL</>}
                  {tab === "zip" && <><Binary className="w-4 h-4" />ZIP Upload</>}
                  {tab === "local" && <><Folder className="w-4 h-4" />Local Path</>}
                </button>
              ))}
            </div>

            {activeTab === "github" && (
              <form onSubmit={(e) => { e.preventDefault(); if (githubUrl.trim()) urlMutation.mutate(githubUrl); }} className="flex flex-col md:flex-row gap-3">
                <div className="flex-1">
                  <Input type="url" placeholder="https://github.com/username/repository" value={githubUrl} onChange={(e) => setGithubUrl(e.target.value)} icon={<Github className="w-5 h-5" />} required disabled={isPending} />
                </div>
                <Button type="submit" isLoading={isPending} className="px-8 py-4">Analyze Repo</Button>
              </form>
            )}
            {activeTab === "zip" && <FileDropzone onFileDrop={handleFileDrop} disabled={isPending} />}
            {activeTab === "local" && (
              <div className="space-y-2">
                <form onSubmit={(e) => { e.preventDefault(); if (localPath.trim()) localMutation.mutate(localPath); }} className="flex flex-col md:flex-row gap-3">
                  <div className="flex-1">
                    <Input type="text" placeholder="c:\Users\..." value={localPath} onChange={(e) => setLocalPath(e.target.value)} icon={<Folder className="w-5 h-5" />} required disabled={isPending} />
                  </div>
                  <Button type="submit" isLoading={isPending} className="px-8 py-4">Scan Directory</Button>
                </form>
                <p className="text-[10px] text-muted-foreground/80 italic">Scans restricted to <code>c:\Users\91798\Documents</code></p>
              </div>
            )}

            {errorMessage && (
              <div className="p-4 rounded-xl bg-red-950/20 border border-red-900/50 text-red-400 text-sm text-center">{errorMessage}</div>
            )}
          </div>
        ) : (
          /* Processing / Results Card */
          <Card className="p-8 space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-xs font-semibold text-primary uppercase tracking-widest">Active Analysis</p>
                <h3 className="text-xl font-bold">Job ID: <span className="font-mono text-zinc-400">{currentJobId}</span></h3>
              </div>
              <Badge variant={getStatusVariant() as any}>{status}</Badge>
            </div>

            <div className="pt-2"><Progress value={getProgressValue()} showText={true} /></div>

            <div className="space-y-4 pt-4 border-t border-border/50">
              {[
                { step: 1, label: "Repository Ingestion", active: status !== "idle" },
                { step: 2, label: status === "scanning" ? "Scanning files and structures..." : "Codebase File Structure Map", active: status === "scanning" || status === "completed" },
                { step: 3, label: status === "completed" ? "Intelligence Pipeline Complete!" : "Languages & Framework Detection", active: status === "completed" },
              ].map(({ step, label, active }) => (
                <div key={step} className="flex items-center gap-3">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${active ? "bg-primary text-background" : "bg-zinc-800 text-zinc-650"}`}>{step}</div>
                  <span className={`text-sm ${active ? "text-zinc-300 font-semibold" : "text-zinc-550"}`}>{label}</span>
                </div>
              ))}
            </div>

            {/* ═══════════════ RESULTS SECTION ═══════════════ */}
            {status === "completed" && result && (
              <div className="pt-6 border-t border-border/50 space-y-6">

                {/* Tab Bar */}
                <div className="flex flex-wrap gap-1.5 p-1.5 bg-zinc-900/60 rounded-xl border border-border/60 w-full backdrop-blur-md justify-center">
                  {resultTabs.filter(t => t.show).map(tab => (
                    <button key={tab.id} type="button"
                      onClick={() => setActiveResultTab(tab.id)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold tracking-wider transition-all duration-300 ${activeResultTab === tab.id ? "bg-primary text-background shadow-lg font-bold" : "text-muted-foreground hover:text-white"}`}
                    >
                      {tab.icon}{tab.label}
                    </button>
                  ))}
                </div>

                {/* ─── OVERVIEW TAB ─── */}
                {activeResultTab === "overview" && (
                  <div className="space-y-5 text-left">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {[
                        { label: "Files", value: result.overview.totalFiles },
                        { label: "Routes", value: result.overview.totalRoutes },
                        { label: "Dependencies", value: result.overview.totalDependencies },
                        { label: "Env Vars", value: result.overview.totalEnvVars },
                      ].map(s => (
                        <div key={s.label} className="p-4 rounded-xl bg-zinc-900/60 border border-border/60 text-center">
                          <div className="text-2xl font-extrabold text-primary">{s.value}</div>
                          <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mt-1">{s.label}</div>
                        </div>
                      ))}
                    </div>

                    {result.metadata?.frameworkMetadata && (
                      <div className="p-4 rounded-xl bg-zinc-900/40 border border-border/60 space-y-3">
                        <h4 className="text-xs font-bold uppercase tracking-widest text-primary">Tech Stack Detected</h4>
                        <div className="flex flex-wrap gap-2">
                          {result.metadata.frameworkMetadata.frameworks.map((fw: any) => <Badge key={fw.name} variant="primary">{fw.name}</Badge>)}
                          <Badge variant="secondary">{result.metadata.frameworkMetadata.language}</Badge>
                          <Badge variant="secondary">{result.metadata.frameworkMetadata.runtime}</Badge>
                          {result.metadata.frameworkMetadata.packageManager && <Badge variant="secondary">{result.metadata.frameworkMetadata.packageManager}</Badge>}
                        </div>
                      </div>
                    )}

                    {/* Auth Detection Summary */}
                    {authData && authData.authType !== "None detected" && (
                      <div className="p-4 rounded-xl bg-emerald-950/20 border border-emerald-800/40 space-y-3">
                        <div className="flex items-center gap-2">
                          <Shield className="w-4 h-4 text-emerald-400" />
                          <h4 className="text-xs font-bold uppercase tracking-widest text-emerald-400">Authentication Detected</h4>
                          <Badge variant="success">{authData.authType}</Badge>
                        </div>
                        <div className="space-y-1">
                          {authData.evidence.map((e, i) => (
                            <div key={i} className="text-[11px] text-emerald-300/80 flex items-center gap-1.5">
                              <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                              {e}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {result.metadata?.entryPoints && result.metadata.entryPoints.length > 0 && (
                      <div className="p-4 rounded-xl bg-zinc-900/40 border border-border/60 space-y-3">
                        <h4 className="text-xs font-bold uppercase tracking-widest text-primary">Entry Points</h4>
                        <div className="space-y-2">
                          {result.metadata.entryPoints.map((ep: any) => (
                            <div key={ep.filePath} className="flex items-center justify-between p-2 rounded-lg bg-zinc-800/50 border border-border/40">
                              <code className="text-xs font-mono text-emerald-400">{ep.filePath}</code>
                              <Badge variant="success">{Math.round(ep.confidence * 100)}%</Badge>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {result.metadata?.languages && Object.keys(result.metadata.languages).length > 0 && (
                      <div className="p-4 rounded-xl bg-zinc-900/40 border border-border/60 space-y-3">
                        <h4 className="text-xs font-bold uppercase tracking-widest text-primary">Language Breakdown</h4>
                        <div className="space-y-2">
                          {Object.entries(result.metadata.languages as Record<string, number>)
                            .sort(([, a], [, b]) => b - a)
                            .map(([lang, lines]) => (
                              <div key={lang} className="flex items-center gap-3">
                                <span className="text-xs font-mono text-zinc-300 w-24 shrink-0">{lang}</span>
                                <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                                  <div className="h-full bg-primary rounded-full" style={{ width: `${Math.min(100, (lines / (result.metadata?.totalLines || 1)) * 100)}%` }} />
                                </div>
                                <span className="text-[10px] text-muted-foreground w-14 text-right">{(lines as number).toLocaleString()} lines</span>
                              </div>
                            ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* ─── ARCHITECTURE TAB ─── */}
                {activeResultTab === "arch" && result.architecture?.graph && (
                  <div className="space-y-4 text-left">
                    {/* Mode Switcher */}
                    <div className="flex bg-zinc-900/60 p-1.5 rounded-xl border border-border/60 gap-1.5 justify-center max-w-lg mx-auto mb-4">
                      {(["layer", "file", "route", "dependency", "trace", "metro", "subway"] as const).map(mode => (
                        <button
                          key={mode}
                          onClick={() => setArchViewMode(mode)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold tracking-wider transition-all duration-300 ${archViewMode === mode ? "bg-primary text-background shadow-lg font-bold" : "text-muted-foreground hover:text-white"}`}
                        >
                          {mode === "layer" ? "Layered View" : mode === "file" ? "File Graph" : mode === "route" ? "Route Graph" : mode === "dependency" ? "Dependency Graph" : mode === "trace" ? "Execution Trace" : mode === "metro" ? "Metro Map" : "Subway Map"}
                        </button>
                      ))}
                    </div>

                    {archViewMode === "layer" && (
                      <LayerView result={result} />
                    )}

                    {archViewMode === "file" && (
                      <FileGraph result={result} />
                    )}

                    {archViewMode === "route" && (
                      <RouteGraph result={result} />
                    )}

                    {archViewMode === "dependency" && (
                      <DependencyGraph result={result} />
                    )}

                    {archViewMode === "trace" && (
                      <ExecutionTrace 
                        result={result} 
                        onSwitchTab={setActiveResultTab} 
                        onSetImpactFile={setSelectedImpactFile} 
                        initialRouteId={selectedTraceRouteId}
                      />
                    )}

                    {archViewMode === "metro" && (
                      <MetroMap
                        result={result}
                        onSwitchTab={setActiveResultTab}
                        onSetImpactFile={setSelectedImpactFile}
                        onSelectTraceRouteId={(routeId) => {
                          setSelectedTraceRouteId(routeId);
                          setArchViewMode("trace");
                        }}
                      />
                    )}

                    {archViewMode === "subway" && (
                      <SubwayMap
                        result={result}
                        onSwitchTab={setActiveResultTab}
                        onSetImpactFile={setSelectedImpactFile}
                        onSelectTraceRouteId={(routeId) => {
                          setSelectedTraceRouteId(routeId);
                          setArchViewMode("trace");
                        }}
                      />
                    )}
                  </div>
                )}

                {/* ─── ROUTES TAB ─── */}
                {activeResultTab === "routes" && (
                  <div className="space-y-4 text-left">
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

                    <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
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
                              className={`p-3 rounded-xl border cursor-pointer transition-all duration-200 ${isTraced ? "bg-primary/10 border-primary/40" : "bg-zinc-900/40 border-border/60 hover:border-border"}`}
                            >
                              <div className="flex items-center gap-2">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono border shrink-0 ${mc}`}>{route.method.toUpperCase()}</span>
                                <code className="text-xs font-mono text-zinc-200 flex-1 truncate">{route.path}</code>
                                {route.group && <Badge variant="secondary" className="text-[9px]">{route.group}</Badge>}
                                {(route.middleware?.length ?? 0) > 0 && <Badge variant="success" className="text-[9px]">🔒 Auth</Badge>}
                                <button
                                  onClick={() => {
                                    if (isTraced) { setTraceRoute(null); setTraceAnimStep(-1); }
                                    else { setTraceRoute(route); setTraceAnimStep(-1); }
                                  }}
                                  className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[9px] font-bold transition-all ${isTraced ? "bg-primary text-background" : "bg-zinc-800/80 border border-border/60 text-zinc-300 hover:border-primary/40 hover:text-primary"}`}
                                >
                                  <Zap className="w-3 h-3" />{isTraced ? "Close" : "Trace"}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}

                {/* ─── DATABASE TAB ─── */}
                {activeResultTab === "db" && result.metadata?.databaseInfo && (
                  <div className="space-y-4 text-left">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {[
                        { label: "Type", value: result.metadata.databaseInfo.type ?? "—" },
                        { label: "ORM", value: result.metadata.databaseInfo.orm ?? "—" },
                        { label: "Entities", value: result.metadata.databaseInfo.entities.length },
                        { label: "Flows", value: result.metadata.databaseInfo.flows?.length ?? 0 },
                      ].map(s => (
                        <div key={s.label} className="p-3 rounded-xl bg-zinc-900/60 border border-border/60 text-center">
                          <div className="text-lg font-extrabold text-primary">{s.value}</div>
                          <div className="text-[9px] text-muted-foreground uppercase tracking-wider font-semibold mt-0.5">{s.label}</div>
                        </div>
                      ))}
                    </div>

                    {result.metadata.databaseInfo.entities.length > 0 && (
                      <div className="p-4 rounded-xl bg-zinc-900/40 border border-border/60 space-y-3">
                        <h4 className="text-xs font-bold uppercase tracking-widest text-primary">Entity Operations</h4>
                        <div className="space-y-2">
                          {result.metadata.databaseInfo.entities.map((ent: EntityOperation) => {
                            const isSel = selectedEntity?.entity === ent.entity;
                            return (
                              <div key={ent.entity}
                                className={`p-3 rounded-xl border cursor-pointer transition-all duration-200 ${isSel ? "bg-primary/10 border-primary/40" : "bg-zinc-800/50 border-border/40 hover:border-border"}`}
                                onClick={() => setSelectedEntity(isSel ? null : ent)}
                              >
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-bold text-zinc-200">{ent.entity}</span>
                                  <div className="flex gap-1">{ent.operations.map(op => <Badge key={op} variant="secondary" className="text-[9px]">{op}</Badge>)}</div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {result.metadata.databaseInfo.flows?.length > 0 && (
                      <div className="p-4 rounded-xl bg-zinc-900/40 border border-border/60 space-y-3">
                        <div className="flex items-center gap-3">
                          <h4 className="text-xs font-bold uppercase tracking-widest text-primary">Database Flows</h4>
                          <input className="text-xs bg-zinc-900/80 border border-border/60 rounded-lg px-2 py-1 text-zinc-300 focus:outline-none max-w-[180px]"
                            placeholder="Filter..." value={dbFlowSearch} onChange={e => setDbFlowSearch(e.target.value)} />
                        </div>
                        <div className="space-y-2 max-h-[280px] overflow-y-auto">
                          {result.metadata.databaseInfo.flows
                            .filter((f: any) => !dbFlowSearch || f.route.toLowerCase().includes(dbFlowSearch.toLowerCase()))
                            .map((flow: any, fi: number) => (
                              <div key={fi} className="p-3 rounded-lg bg-zinc-800/50 border border-border/40 space-y-2">
                                <div className="flex items-center gap-2">
                                  <span className="text-[9px] font-mono font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded">{flow.method}</span>
                                  <code className="text-xs font-mono text-zinc-200">{flow.route}</code>
                                </div>
                                {flow.entities?.length > 0 && <div className="flex flex-wrap gap-1">{flow.entities.map((e: string) => <Badge key={e} variant="secondary" className="text-[9px]">{e}</Badge>)}</div>}
                              </div>
                            ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* ─── HEALTH TAB ─── */}
                {activeResultTab === "health" && healthData && (
                  <div className="space-y-5 text-left">
                    {/* Health Dashboard Header Cards */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                      {/* Score Gauge */}
                      <div className="flex items-center gap-5 p-5 rounded-2xl bg-zinc-900/40 border border-border/60">
                        <div className="relative w-20 h-20 shrink-0">
                          <svg viewBox="0 0 100 100" className="w-20 h-20 -rotate-90">
                            <circle cx="50" cy="50" r="40" fill="none" stroke="#27272a" strokeWidth="10" />
                            <circle cx="50" cy="50" r="40" fill="none"
                              stroke={score >= 80 ? "#22c55e" : score >= 60 ? "#f59e0b" : "#ef4444"}
                              strokeWidth="10"
                              strokeDasharray={`${(score / 100) * 251.2} 251.2`}
                              strokeLinecap="round"
                              className="transition-all duration-1000"
                            />
                          </svg>
                          <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <span className="text-xl font-extrabold text-white">{score}</span>
                            <span className="text-[8px] text-muted-foreground font-semibold">/100</span>
                          </div>
                        </div>
                        <div className="min-w-0">
                          <h3 className="text-sm font-extrabold text-white mb-0.5">
                            {score >= 80 ? "Healthy" : score >= 60 ? "Fair" : "Needs Refactor"}
                          </h3>
                          <p className="text-[10px] text-muted-foreground leading-normal line-clamp-2">
                            {score >= 80
                              ? "Clean codebase with low technical debt."
                              : score >= 60
                              ? "Some structural issues detected."
                              : "Significant issues found. Refactor recommended."}
                          </p>
                          <div className="flex items-center gap-1.5 mt-1.5">
                            <div className={`w-1.5 h-1.5 rounded-full ${score >= 80 ? "bg-emerald-400" : score >= 60 ? "bg-amber-400" : "bg-red-400"}`} />
                            <span className={`text-[9px] font-bold ${score >= 80 ? "text-emerald-400" : score >= 60 ? "text-amber-400" : "text-red-400"}`}>
                              {score >= 80 ? "Low Risk" : score >= 60 ? "Medium Risk" : "High Risk"}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Risk Trend Chart */}
                      <div className="p-4 rounded-2xl bg-zinc-900/40 border border-border/60 flex flex-col justify-between">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Health History & Trends</span>
                          <span className="text-[8px] text-zinc-550 font-semibold">Last 5 commits</span>
                        </div>
                        <div className="relative w-full h-[65px] flex items-center justify-center">
                          <svg className="w-full h-full" viewBox="0 0 280 65">
                            {/* Grid lines */}
                            <line x1="10" y1="10" x2="270" y2="10" stroke="#1f1f22" strokeDasharray="3,3" />
                            <line x1="10" y1="32" x2="270" y2="32" stroke="#1f1f22" strokeDasharray="3,3" />
                            <line x1="10" y1="55" x2="270" y2="55" stroke="#1f1f22" strokeDasharray="3,3" />
                            {/* Trend line */}
                            <polyline
                              fill="none"
                              stroke="hsl(var(--primary, 60 100% 50%))"
                              strokeWidth="2"
                              points={`15,${55 - (85 - 50) * 1.0} 75,${55 - (82 - 50) * 1.0} 135,${55 - (76 - 50) * 1.0} 195,${55 - (78 - 50) * 1.0} 255,${55 - (score - 50) * 1.0}`}
                            />
                            {/* Dots and Labels */}
                            {[85, 82, 76, 78, score].map((val, idx) => {
                              const x = idx * 60 + 15;
                              const y = 55 - (val - 50) * 1.0;
                              return (
                                <g key={idx}>
                                  <circle cx={x} cy={y} r="3" fill="#09090b" stroke="hsl(var(--primary, 60 100% 50%))" strokeWidth="1.5" />
                                  <text x={x} y={y - 6} textAnchor="middle" fontSize="7" fill="#a1a1aa" fontWeight="bold">{val}</text>
                                  <text x={x} y="62" textAnchor="middle" fontSize="6.5" fill="#52525b">{idx === 4 ? "current" : `c${idx + 1}`}</text>
                                </g>
                              );
                            })}
                          </svg>
                        </div>
                      </div>

                      {/* Top Risks */}
                      <div className="p-4 rounded-2xl bg-zinc-900/40 border border-border/60 space-y-2.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block">Top System Risks</span>
                        <div className="space-y-1.5">
                          {topRisks.length > 0 ? (
                            topRisks.map((risk, index) => (
                              <div key={risk.file} className="flex items-center justify-between p-1.5 rounded-lg bg-zinc-950/40 border border-border/40">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="text-[8px] font-extrabold w-4 h-4 rounded-full bg-red-950/80 border border-red-800/40 flex items-center justify-center text-red-400 shrink-0">
                                    {index + 1}
                                  </span>
                                  <code className="text-[10px] font-mono text-zinc-300 truncate" title={risk.file}>
                                    {risk.basename}
                                  </code>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  {risk.loc > 0 && <span className="text-[8px] text-zinc-550">{risk.loc} LOC</span>}
                                  <span className={`text-[8.5px] font-bold px-1.5 py-0.5 rounded ${risk.score >= 50 ? "bg-red-950/50 text-red-400" : risk.score >= 25 ? "bg-amber-950/50 text-amber-400" : "bg-emerald-950/50 text-emerald-400"}`}>
                                    {risk.score}% Risk
                                  </span>
                                </div>
                              </div>
                            ))
                          ) : (
                            <span className="text-[9px] text-zinc-650 italic block">No risks identified. Codebase clean.</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {isStaticLoading && (
                      <div className="flex items-center justify-center p-4 text-zinc-550 gap-2 border border-border/40 rounded-xl bg-zinc-900/20">
                        <Loader2 className="w-4 h-4 animate-spin text-primary" />
                        <span className="text-[10px] font-medium">Loading full backend analysis...</span>
                      </div>
                    )}

                    {/* Breakdown Cards */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {[
                        { key: "dead" as const, label: "Dead Files", value: deadCount, icon: <FileText className="w-4 h-4" />, color: "text-orange-400", border: "border-orange-800/40", bg: "bg-orange-950/20", deduction: Math.min(20, deadCount * 2) },
                        { key: "cycles" as const, label: "Cycles", value: cycleCount, icon: <GitBranch className="w-4 h-4" />, color: "text-red-400", border: "border-red-800/40", bg: "bg-red-950/20", deduction: Math.min(24, cycleCount * 4) },
                        { key: "broken" as const, label: "Broken Imports", value: brokenCount, icon: <AlertTriangle className="w-4 h-4" />, color: "text-yellow-400", border: "border-yellow-800/40", bg: "bg-yellow-950/20", deduction: Math.min(25, brokenCount * 5) },
                        { key: "large" as const, label: "Large Files", value: largeCount, icon: <Activity className="w-4 h-4" />, color: "text-blue-400", border: "border-blue-800/40", bg: "bg-blue-950/20", deduction: Math.min(15, largeCount) },
                        { key: "complexity" as const, label: "Complex Files", value: complexCount, icon: <Zap className="w-4 h-4" />, color: "text-rose-400", border: "border-rose-800/40", bg: "bg-rose-950/20", deduction: hasReport ? Math.min(10, staticAnalysisReport.complexity.filter((c: any) => c.rating === "risky").length * 2) : 0, show: hasReport },
                        { key: "god" as const, label: "God Services", value: godCount, icon: <Layers className="w-4 h-4" />, color: "text-purple-400", border: "border-purple-800/40", bg: "bg-purple-950/20", deduction: hasReport ? Math.min(15, godCount * 5) : 0, show: hasReport },
                        { key: "exports" as const, label: "Unused Exports", value: unusedExportsCount, icon: <Settings className="w-4 h-4" />, color: "text-teal-400", border: "border-teal-800/40", bg: "bg-teal-950/20", deduction: 0, show: hasReport },
                      ].filter(c => c.show !== false).map(card => (
                        <button key={card.key} onClick={() => setHealthSection(healthSection === card.key ? null : card.key)}
                          className={`p-4 rounded-xl border text-left transition-all duration-200 cursor-pointer ${card.bg} ${card.border} hover:scale-105 ${healthSection === card.key ? "ring-2 ring-current" : ""} ${card.color}`}>
                          <div className="flex items-center justify-between mb-2">
                            {card.icon}
                            {card.deduction > 0 && <span className="text-[9px] font-bold opacity-60">-{card.deduction}pts</span>}
                          </div>
                          <div className="text-2xl font-extrabold">{card.value}</div>
                          <div className="text-[9px] font-bold uppercase tracking-wider opacity-70 mt-0.5">{card.label}</div>
                        </button>
                      ))}
                    </div>

                    {/* Expanded Section */}
                    {healthSection === "dead" && deadCount > 0 && (
                      <div className="p-4 rounded-xl bg-orange-950/10 border border-orange-800/30 space-y-2">
                        <h4 className="text-xs font-bold text-orange-400 uppercase tracking-widest">Dead Code Files (0 references)</h4>
                        <div className="space-y-1 max-h-[200px] overflow-y-auto">
                          {(hasReport ? staticAnalysisReport.deadCode : healthData.deadFiles).map((f: any) => {
                            const filePath = f.file ?? f.path;
                            const lineCount = f.lineCount ?? 0;
                            return (
                              <div key={filePath} className="flex items-center justify-between p-2 rounded-lg bg-zinc-900/60 border border-border/40">
                                <code className="text-[10px] font-mono text-zinc-300 truncate">{filePath.split(/[\\/]/).slice(-2).join("/")}</code>
                                <span className="text-[9px] text-zinc-500 shrink-0 ml-2">{lineCount || f.confidence ? `${lineCount || "n/a"} lines / ${f.confidence ?? 100}% conf` : ""}</span>
                              </div>
                            );
                          })}
                        </div>
                        <p className="text-[10px] text-muted-foreground">These files have no incoming references. Consider removing them or adding explicit exports.</p>
                      </div>
                    )}

                    {healthSection === "large" && largeCount > 0 && (
                      <div className="p-4 rounded-xl bg-blue-950/10 border border-blue-800/30 space-y-2">
                        <h4 className="text-xs font-bold text-blue-400 uppercase tracking-widest">Large Files ({">"}500 lines)</h4>
                        <div className="space-y-1 max-h-[200px] overflow-y-auto">
                          {(hasReport ? staticAnalysisReport.largeFiles : healthData.largeFiles).map((f: any) => {
                            const filePath = f.file ?? f.path;
                            const lines = f.lines ?? f.lineCount;
                            return (
                              <div key={filePath} className="flex items-center justify-between p-2 rounded-lg bg-zinc-900/60 border border-border/40">
                                <code className="text-[10px] font-mono text-zinc-300 truncate">{filePath.split(/[\\/]/).slice(-2).join("/")}</code>
                                <span className="text-[9px] text-blue-400 shrink-0 ml-2 font-bold">{lines} lines</span>
                              </div>
                            );
                          })}
                        </div>
                        <p className="text-[10px] text-muted-foreground">Consider splitting large files into smaller, focused modules.</p>
                      </div>
                    )}

                    {healthSection === "broken" && (
                      <div className="p-4 rounded-xl bg-yellow-950/10 border border-yellow-800/30 space-y-2">
                        <h4 className="text-xs font-bold text-yellow-400 uppercase tracking-widest">Broken Import Edges</h4>
                        <div className="space-y-1 max-h-[200px] overflow-y-auto">
                          {((result as any).graphIssues ?? [] as any[]).filter((i: any) => i.type === "broken_edge").map((issue: any, idx: number) => (
                            <div key={idx} className="p-2 rounded-lg bg-zinc-900/60 border border-border/40">
                              <p className="text-[10px] text-zinc-300">{issue.description}</p>
                            </div>
                          ))}
                          {((result as any).graphIssues ?? [] as any[]).filter((i: any) => i.type === "broken_edge").length === 0 && (
                            <p className="text-[10px] text-zinc-500">No broken imports detected.</p>
                          )}
                        </div>
                      </div>
                    )}

                    {healthSection === "cycles" && (
                      <div className="p-4 rounded-xl bg-red-950/10 border border-red-800/30 space-y-2">
                        <h4 className="text-xs font-bold text-red-400 uppercase tracking-widest">Circular Dependencies</h4>
                        <div className="space-y-1 max-h-[200px] overflow-y-auto pr-1">
                          {hasReport && staticAnalysisReport.cycles.length > 0 ? (
                            staticAnalysisReport.cycles.map((c: any, cIdx: number) => (
                              <div key={cIdx} className="p-2.5 rounded-lg bg-zinc-900/60 border border-border/40 space-y-1">
                                <span className="text-[9px] font-bold text-zinc-500">Cycle {cIdx + 1} ({c.length} nodes):</span>
                                <div className="flex flex-wrap items-center gap-1">
                                  {c.cycle.map((node: string, nIdx: number) => (
                                    <React.Fragment key={nIdx}>
                                      <code className="text-[9px] font-mono text-red-400 bg-zinc-950 px-1 py-0.5 rounded">{node}</code>
                                      {nIdx < c.cycle.length - 1 && <span className="text-[9px] text-zinc-650">→</span>}
                                    </React.Fragment>
                                  ))}
                                </div>
                              </div>
                            ))
                          ) : (
                            <p className="text-[10px] text-muted-foreground">{cycleCount} circular dependency cycle{cycleCount !== 1 ? "s" : ""} detected. Break circular dependency chains by introducing intermediate shared interfaces or config modules.</p>
                          )}
                        </div>
                      </div>
                    )}

                    {healthSection === "complexity" && hasReport && staticAnalysisReport.complexity.length > 0 && (
                      <div className="p-4 rounded-xl bg-rose-950/10 border border-rose-800/30 space-y-2">
                        <h4 className="text-xs font-bold text-rose-400 uppercase tracking-widest">Complexity Hotspots (estimated cyclomatic complexity)</h4>
                        <div className="space-y-2 max-h-[250px] overflow-y-auto pr-1">
                          {staticAnalysisReport.complexity.map((c: any) => (
                            <div key={c.file} className="p-2.5 rounded-lg bg-zinc-900/60 border border-border/40 space-y-1.5">
                              <div className="flex items-center justify-between">
                                <code className="text-[10px] font-mono text-zinc-300 truncate w-3/4">{c.file}</code>
                                <Badge variant={c.rating === "risky" ? "error" : "warning"} className="text-[9px] font-bold uppercase">{c.rating}: {c.score}</Badge>
                              </div>
                              {c.hotspots && c.hotspots.length > 0 && (
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-[8px] text-zinc-550 uppercase font-semibold">Hotspots:</span>
                                  {c.hotspots.map((fn: string) => (
                                    <code key={fn} className="text-[9px] font-mono text-rose-400 bg-zinc-950 px-1 py-0.5 rounded">{fn}</code>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                        <p className="text-[10px] text-muted-foreground">Files with high cyclomatic complexity have many decision points and branches, making them hard to test and maintain.</p>
                      </div>
                    )}

                    {healthSection === "god" && hasReport && staticAnalysisReport.godServices.length > 0 && (
                      <div className="p-4 rounded-xl bg-purple-950/10 border border-purple-800/30 space-y-2">
                        <h4 className="text-xs font-bold text-purple-400 uppercase tracking-widest">God Service Modules</h4>
                        <div className="space-y-1.5 max-h-[250px] overflow-y-auto pr-1">
                          {staticAnalysisReport.godServices.map((g: any) => (
                            <div key={g.file} className="p-2.5 rounded-lg bg-zinc-900/60 border border-border/40">
                              <div className="flex items-center justify-between mb-1">
                                <code className="text-[10px] font-mono text-zinc-300 truncate w-2/3">{g.file}</code>
                                <span className="text-[9px] font-bold text-purple-400">
                                  {g.lines} lines / {g.exportedFunctions} exports{g.methods !== undefined ? ` / ${g.methods} methods` : ""}
                                </span>
                              </div>
                              <p className="text-[9px] text-zinc-400 leading-relaxed italic">{g.reason}</p>
                            </div>
                          ))}
                        </div>
                        <p className="text-[10px] text-muted-foreground">God modules have too many responsibilities. Consider breaking them down into smaller single-responsibility files.</p>
                      </div>
                    )}

                    {healthSection === "exports" && hasReport && staticAnalysisReport.unusedExports.length > 0 && (
                      <div className="p-4 rounded-xl bg-teal-950/10 border border-teal-800/30 space-y-2">
                        <h4 className="text-xs font-bold text-teal-400 uppercase tracking-widest">Unused Exports ({staticAnalysisReport.unusedExports.length})</h4>
                        <div className="space-y-1 max-h-[250px] overflow-y-auto pr-1">
                          {staticAnalysisReport.unusedExports.map((e: any, idx: number) => (
                            <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-zinc-900/60 border border-border/40">
                              <div className="min-w-0">
                                <code className="text-[10px] font-mono text-zinc-300 truncate block">{e.export}</code>
                                <span className="text-[8px] text-zinc-550 block font-mono font-semibold">{e.file.split(/[\\/]/).pop()}</span>
                              </div>
                              <Badge variant="secondary" className="text-[8px] tracking-wide uppercase font-semibold shrink-0 ml-2">{e.type}</Badge>
                            </div>
                          ))}
                        </div>
                        <p className="text-[10px] text-muted-foreground">These functions, classes, interfaces, or variables are exported but never imported anywhere in the workspace.</p>
                      </div>
                    )}

                    {/* Recommendations */}
                    <div className="p-4 rounded-xl bg-zinc-900/40 border border-border/60 space-y-3">
                      <h4 className="text-xs font-bold uppercase tracking-widest text-primary">Recommendations</h4>
                      <div className="space-y-2">
                        {hasReport ? (
                          staticAnalysisReport.summary.recommendations.map((rec: string, rIdx: number) => (
                            <div key={rIdx} className="flex items-start gap-2 text-[11px] text-zinc-300">
                              <CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                              {rec}
                            </div>
                          ))
                        ) : (
                          <>
                            {healthData.cycles > 0 && <div className="flex items-start gap-2 text-[11px] text-zinc-300"><AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />{healthData.cycles} circular dependencies found — apply dependency inversion or extract shared modules.</div>}
                            {healthData.deadFiles.length > 0 && <div className="flex items-start gap-2 text-[11px] text-zinc-300"><AlertTriangle className="w-3.5 h-3.5 text-orange-400 shrink-0 mt-0.5" />{healthData.deadFiles.length} unreferenced files — audit and remove dead code to reduce bundle size.</div>}
                            {healthData.largeFiles.length > 0 && <div className="flex items-start gap-2 text-[11px] text-zinc-300"><AlertTriangle className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />{healthData.largeFiles.length} files exceed 500 lines — split into smaller focused modules.</div>}
                            {healthData.score >= 80 && <div className="flex items-start gap-2 text-[11px] text-emerald-300"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />Repository is healthy. Continue following clean architecture principles.</div>}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* ─── IMPACT ANALYSIS TAB ─── */}
                {activeResultTab === "impact" && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
                    {/* Left Panel: Searchable Timeline / File List */}
                    <div className="space-y-4 md:col-span-1 border-r border-border/40 pr-0 md:pr-4">
                      <h4 className="text-xs font-bold uppercase tracking-widest text-primary mb-2">Codebase Impact Finder</h4>
                      
                      <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                        <input
                          className="w-full pl-8 py-2 text-xs bg-zinc-900/80 border border-border/60 rounded-lg text-zinc-300 focus:outline-none focus:border-primary/40"
                          placeholder="Filter timeline files..."
                          value={impactSearch}
                          onChange={(e) => setImpactSearch(e.target.value)}
                        />
                      </div>

                      {isTimelineLoading ? (
                        <div className="flex items-center justify-center p-8 text-zinc-500 gap-2">
                          <Loader2 className="w-4 h-4 animate-spin text-primary" />
                          <span className="text-xs">Loading timeline...</span>
                        </div>
                      ) : (
                        <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                          <div className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider mb-1">Most Critical Files (PageRank Rank)</div>
                          {(timelineData?.timeline ?? [])
                            .filter((item: any) => !impactSearch || item.file.toLowerCase().includes(impactSearch.toLowerCase()))
                            .map((item: any) => {
                              const isSelected = selectedImpactFile === item.fullPath || selectedImpactFile === item.file;
                              return (
                                <button
                                  key={item.fullPath}
                                  onClick={() => setSelectedImpactFile(item.fullPath)}
                                  className={`w-full p-2.5 rounded-xl border text-left transition-all duration-200 flex items-center justify-between ${isSelected ? "bg-primary/10 border-primary/40 text-primary" : "bg-zinc-900/40 border-border/60 hover:border-border text-zinc-300"}`}
                                >
                                  <div className="min-w-0">
                                    <code className="text-[10px] font-mono font-bold block truncate">{item.file}</code>
                                    <span className="text-[8px] text-zinc-550 font-medium">{item.directDependents} direct dependents</span>
                                  </div>
                                  <Badge variant={isSelected ? "primary" : "secondary"} className="text-[8px] shrink-0 font-bold ml-2">Score: {Math.round(item.importanceScore)}</Badge>
                                </button>
                              );
                            })}
                          
                          {/* Fallback to simple file nodes search if timeline list is empty */}
                          {(!timelineData?.timeline || timelineData.timeline.length === 0) && (result.files ?? [])
                            .filter((f: any) => {
                              const pathLower = f.path.toLowerCase();
                              return !pathLower.startsWith("route:") && !pathLower.startsWith("env:") && !pathLower.startsWith("db:") && !pathLower.startsWith("entity:") &&
                                     (!impactSearch || f.path.toLowerCase().includes(impactSearch.toLowerCase()));
                            })
                            .slice(0, 30)
                            .map((file: any) => {
                              const isSelected = selectedImpactFile === file.path;
                              const basename = file.path.split(/[\\/]/).pop() ?? file.path;
                              return (
                                <button
                                  key={file.path}
                                  onClick={() => setSelectedImpactFile(file.path)}
                                  className={`w-full p-2.5 rounded-xl border text-left transition-all duration-200 flex items-center justify-between ${isSelected ? "bg-primary/10 border-primary/40 text-primary" : "bg-zinc-900/40 border-border/60 hover:border-border text-zinc-300"}`}
                                >
                                  <code className="text-[10px] font-mono font-bold truncate">{basename}</code>
                                </button>
                              );
                            })}
                        </div>
                      )}
                    </div>

                    {/* Right Panel: Selected File Impact Details */}
                    <div className="md:col-span-2 space-y-4">
                      {!selectedImpactFile ? (
                        <div className="h-[350px] flex flex-col items-center justify-center text-center p-6 border border-dashed border-border/80 rounded-2xl bg-zinc-950/20 text-zinc-550">
                          <Activity className="w-12 h-12 text-zinc-700 mb-3" />
                          <h4 className="text-sm font-bold text-zinc-300">Run Change Impact Analysis</h4>
                          <p className="text-xs text-zinc-500 max-w-xs mt-1 leading-relaxed">Select any file from the left sidebar timeline or search list to trace potential breakages and dependent paths.</p>
                        </div>
                      ) : isImpactLoading ? (
                        <div className="h-[350px] flex flex-col items-center justify-center text-center p-6 border border-border/50 rounded-2xl bg-zinc-950/20">
                          <Loader2 className="w-8 h-8 animate-spin text-primary mb-2" />
                          <span className="text-xs text-zinc-400">Tracing dependency linkages...</span>
                        </div>
                      ) : impactData?.impact ? (() => {
                        const imp = impactData.impact as ImpactAnalysis;
                        const baseName = imp.targetFile.split(/[\\/]/).pop() ?? imp.targetFile;

                        return (
                          <div className="space-y-4">
                            {/* Selected Header */}
                            <div className="p-4 rounded-xl bg-zinc-900/60 border border-border/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                              <div>
                                <span className="text-[8px] font-bold text-primary uppercase tracking-widest block mb-0.5">Selected Module</span>
                                <code className="text-xs font-mono font-bold text-zinc-200">{baseName}</code>
                                <span className="text-[10px] text-zinc-500 block truncate font-mono max-w-[320px]">{imp.targetFile}</span>
                              </div>
                              <button
                                onClick={() => setSelectedImpactFile("")}
                                className="p-1 px-2.5 rounded-lg border border-border/60 hover:border-white text-zinc-400 hover:text-white text-[10px] font-bold transition shrink-0"
                              >
                                Clear Selection
                              </button>
                            </div>

                            {/* Impact score gauge & breakdown */}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                              {/* Gauge */}
                              <div className="p-4 rounded-xl bg-zinc-900/40 border border-border/60 flex flex-col items-center justify-center text-center sm:col-span-1">
                                <div className="relative w-20 h-20 mb-2">
                                  <svg viewBox="0 0 100 100" className="w-20 h-20 -rotate-90">
                                    <circle cx="50" cy="50" r="42" fill="none" stroke="#27272a" strokeWidth="8" />
                                    <circle cx="50" cy="50" r="42" fill="none"
                                      stroke={imp.impactScore >= 50 ? "#ef4444" : imp.impactScore >= 20 ? "#f59e0b" : "#22c55e"}
                                      strokeWidth="8"
                                      strokeDasharray={`${(imp.impactScore / 100) * 263.89} 263.89`}
                                      strokeLinecap="round"
                                      className="transition-all duration-1000"
                                    />
                                  </svg>
                                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                                    <span className="text-xl font-extrabold text-white">{imp.impactScore}%</span>
                                    <span className="text-[8px] text-zinc-550 uppercase tracking-widest font-semibold">Impact</span>
                                  </div>
                                </div>
                                <span className="text-[10px] font-bold text-zinc-400">Affected Codebase</span>
                              </div>

                              {/* Direct/Transitive counts */}
                              <div className="sm:col-span-2 grid grid-cols-2 gap-3">
                                <div className="p-4 rounded-xl bg-zinc-900/40 border border-border/60 text-center sm:text-left flex flex-col justify-center">
                                  <span className="text-[8px] text-zinc-550 font-bold uppercase tracking-widest block mb-1">Direct Dependents</span>
                                  <div className="text-3xl font-extrabold text-white">{imp.directDependents?.length ?? 0}</div>
                                  <span className="text-[9px] text-zinc-550 mt-1">Files importing directly</span>
                                </div>
                                <div className="p-4 rounded-xl bg-zinc-900/40 border border-border/60 text-center sm:text-left flex flex-col justify-center">
                                  <span className="text-[8px] text-zinc-550 font-bold uppercase tracking-widest block mb-1">Total Affected</span>
                                  <div className="text-3xl font-extrabold text-white">{imp.totalAffectedFiles ?? 0}</div>
                                  <span className="text-[9px] text-zinc-550 mt-1">Transitive dependency chain</span>
                                </div>
                              </div>
                            </div>

                            {/* Critical paths visualization */}
                            {imp.criticalPaths && imp.criticalPaths.length > 0 && (
                              <div className="p-4 rounded-xl bg-zinc-900/40 border border-border/60 space-y-3">
                                <div className="flex items-center gap-2">
                                  <Activity className="w-3.5 h-3.5 text-primary" />
                                  <h4 className="text-xs font-bold uppercase tracking-widest text-primary">Critical Propagation Paths</h4>
                                </div>
                                <div className="space-y-3 pt-1">
                                  {imp.criticalPaths.map((pathArray: string[], pIdx: number) => (
                                    <div key={pIdx} className="flex flex-wrap items-center gap-1.5 p-2 bg-zinc-950/60 rounded-lg border border-border/40">
                                      <span className="text-[8px] font-bold text-zinc-500 mr-1 uppercase">Path {pIdx + 1}:</span>
                                      {pathArray.map((fileItem: string, fIdx: number) => (
                                        <React.Fragment key={fIdx}>
                                          <code className={`text-[9px] font-mono px-2 py-0.5 rounded ${fIdx === 0 ? "bg-red-950/60 text-red-400 border border-red-900/30" : fIdx === pathArray.length - 1 ? "bg-primary/20 text-primary border border-primary/20" : "bg-zinc-800 text-zinc-300"}`}>
                                            {fileItem}
                                          </code>
                                          {fIdx < pathArray.length - 1 && <ArrowRight className="w-3 h-3 text-zinc-650 shrink-0" />}
                                        </React.Fragment>
                                      ))}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Dependents lists */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              {/* Direct list */}
                              <div className="p-4 rounded-xl bg-zinc-900/40 border border-border/60 space-y-2">
                                <h5 className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest">Direct Import Linkages</h5>
                                <div className="space-y-1.5 max-h-[180px] overflow-y-auto pr-1">
                                  {imp.directDependents && imp.directDependents.length > 0 ? (
                                    imp.directDependents.map((f: string) => (
                                      <div key={f} className="p-2 rounded bg-zinc-850 border border-border/30">
                                        <code className="text-[9px] font-mono text-zinc-300 block truncate">{f}</code>
                                      </div>
                                    ))
                                  ) : (
                                    <span className="text-[9px] text-zinc-550 block italic">No direct dependents. This module is self-contained.</span>
                                  )}
                                </div>
                              </div>

                              {/* Transitive list */}
                              <div className="p-4 rounded-xl bg-zinc-900/40 border border-border/60 space-y-2">
                                <h5 className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest">Indirect Affected Chain</h5>
                                <div className="space-y-1.5 max-h-[180px] overflow-y-auto pr-1">
                                  {imp.transitiveDependents && imp.transitiveDependents.length > 0 ? (
                                    imp.transitiveDependents.map((f: string) => (
                                      <div key={f} className="p-2 rounded bg-zinc-850 border border-border/30">
                                        <code className="text-[9px] font-mono text-zinc-300 block truncate">{f}</code>
                                      </div>
                                    ))
                                  ) : (
                                    <span className="text-[9px] text-zinc-550 block italic">No transitive dependents affected.</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })() : (
                        <div className="h-[350px] flex items-center justify-center text-center p-6 border border-border/50 rounded-2xl bg-zinc-950/20">
                          <span className="text-xs text-zinc-550">Failed to load impact details.</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* ─── COMPARE TAB ─── */}
                {activeResultTab === "compare" && (
                  <div className="space-y-6 text-left">
                    <div className="p-4 rounded-xl bg-zinc-900/40 border border-border/60 space-y-4">
                      <h4 className="text-xs font-bold uppercase tracking-widest text-primary">Architecture Diff Engine</h4>
                      <p className="text-xs text-muted-foreground">Select a comparison analysis run to calculate differences in routes, file size, line counts, and dependency structures.</p>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Baseline Selection */}
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Baseline Job (Current)</label>
                          <div className="p-2.5 rounded-lg bg-zinc-950/60 border border-border/40 text-xs font-mono text-zinc-300">
                            {result?.tree?.name || "current-run"} ({currentJobId})
                          </div>
                        </div>

                        {/* Comparison Selection */}
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Compare with Job</label>
                          <select
                            className="w-full text-xs bg-zinc-950/60 border border-border/40 rounded-lg px-3 py-2 text-zinc-300 focus:outline-none focus:border-primary/40"
                            value={compareJobId}
                            onChange={(e) => setCompareJobId(e.target.value)}
                          >
                            <option value="">— Select comparison run —</option>
                            {(jobsListData?.jobs || [])
                              .filter((j: any) => j.jobId !== currentJobId && j.status === "completed")
                              .map((job: any) => (
                                <option key={job.jobId} value={job.jobId}>
                                  {job.repoName} ({job.jobId}) — {job.totalFiles} files
                                </option>
                              ))}
                          </select>
                        </div>
                      </div>
                    </div>

                    {!compareJobId ? (
                      <div className="h-[250px] flex flex-col items-center justify-center text-center p-6 border border-dashed border-border/80 rounded-2xl bg-zinc-950/20 text-zinc-550">
                        <GitCompare className="w-12 h-12 text-zinc-700 mb-2" />
                        <h4 className="text-sm font-bold text-zinc-300">Compare Analyses</h4>
                        <p className="text-xs text-zinc-500 max-w-xs mt-1">Please select an analysis run from the dropdown above to view structural additions, deletions, or modifications.</p>
                      </div>
                    ) : isCompareLoading ? (
                      <div className="h-[250px] flex flex-col items-center justify-center text-center p-6 border border-border/50 rounded-2xl bg-zinc-950/20">
                        <Loader2 className="w-8 h-8 animate-spin text-primary mb-2" />
                        <span className="text-xs text-zinc-400">Computing structural differences...</span>
                      </div>
                    ) : compareData ? (() => {
                      const diff = compareData as ArchitectureDiff;
                      const hasChanges = diff.routes.length > 0 || diff.files.length > 0 || diff.dependencies.length > 0;

                      return (
                        <div className="space-y-6">
                          {/* Summary metrics */}
                          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                            {[
                              { label: "Routes Added", value: diff.summary.addedRoutesCount, color: "text-emerald-400", bg: "bg-emerald-950/20" },
                              { label: "Routes Removed", value: diff.summary.removedRoutesCount, color: "text-red-400", bg: "bg-red-950/20" },
                              { label: "Routes Modified", value: diff.summary.modifiedRoutesCount, color: "text-amber-400", bg: "bg-amber-950/20" },
                              { label: "Files Added", value: diff.summary.addedFilesCount, color: "text-emerald-400", bg: "bg-emerald-950/20" },
                              { label: "Files Removed", value: diff.summary.removedFilesCount, color: "text-red-400", bg: "bg-red-950/20" },
                              { label: "Files Modified", value: diff.summary.modifiedFilesCount, color: "text-amber-400", bg: "bg-amber-950/20" },
                            ].map(s => (
                              <div key={s.label} className={`p-3 rounded-xl border border-border/60 text-center ${s.bg}`}>
                                <div className={`text-xl font-extrabold ${s.color}`}>{s.value}</div>
                                <div className="text-[9px] text-muted-foreground uppercase tracking-wider font-semibold mt-0.5">{s.label}</div>
                              </div>
                            ))}
                          </div>

                          {!hasChanges ? (
                            <div className="p-4 rounded-xl bg-zinc-900/20 border border-border/40 text-center text-xs text-zinc-400">
                              Both analysis runs are structurally identical. No differences found.
                            </div>
                          ) : (
                            <div className="space-y-6">
                              {/* Routes Section */}
                              {diff.routes.length > 0 && (
                                <div className="p-4 rounded-xl bg-zinc-900/40 border border-border/60 space-y-3">
                                  <h5 className="text-xs font-bold uppercase tracking-wider text-primary">Routes Changed</h5>
                                  <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                                    {diff.routes.map((r, idx) => {
                                      const statusColors = {
                                        added: "bg-emerald-950/60 text-emerald-400 border-emerald-800/60",
                                        removed: "bg-red-950/60 text-red-400 border-red-800/60",
                                        modified: "bg-amber-950/60 text-amber-400 border-amber-800/60"
                                      };
                                      return (
                                        <div key={idx} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 rounded-lg bg-zinc-950/40 border border-border/40 text-xs">
                                          <div className="flex items-center gap-2 min-w-0">
                                            <span className="font-bold text-[9px] uppercase px-1.5 py-0.5 rounded bg-zinc-900 border border-border/40">{r.method}</span>
                                            <code className="font-mono text-zinc-200 truncate">{r.path}</code>
                                          </div>
                                          <div className="flex items-center gap-3 shrink-0">
                                            {r.details && <span className="text-[10px] text-zinc-400 italic">{r.details}</span>}
                                            <Badge className={`uppercase text-[9px] ${statusColors[r.status]}`}>{r.status}</Badge>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}

                              {/* Files Section */}
                              {diff.files.length > 0 && (
                                <div className="p-4 rounded-xl bg-zinc-900/40 border border-border/60 space-y-3">
                                  <h5 className="text-xs font-bold uppercase tracking-wider text-primary">Files Changed</h5>
                                  <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                                    {diff.files.map((f, idx) => {
                                      const statusColors = {
                                        added: "bg-emerald-950/60 text-emerald-400 border-emerald-800/60",
                                        removed: "bg-red-950/60 text-red-400 border-red-800/60",
                                        modified: "bg-amber-950/60 text-amber-400 border-amber-800/60"
                                      };
                                      
                                      const formatBytes = (bytes: number) => {
                                        if (bytes === 0) return "0 B";
                                        const k = 1024;
                                        const sizes = ["B", "KB", "MB"];
                                        const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(k));
                                        const prefix = bytes < 0 ? "-" : "+";
                                        return prefix + parseFloat((Math.abs(bytes) / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
                                      };

                                      const linesText = f.linesDiff > 0 ? `+${f.linesDiff}` : f.linesDiff;
                                      
                                      return (
                                        <div key={idx} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 rounded-lg bg-zinc-950/40 border border-border/40 text-xs">
                                          <code className="font-mono text-zinc-300 truncate w-2/3" title={f.path}>{f.path}</code>
                                          <div className="flex items-center gap-3 shrink-0">
                                            {f.status === "modified" && (
                                              <span className="text-[10px] text-zinc-400">
                                                {linesText} lines / {formatBytes(f.sizeDiff)}
                                              </span>
                                            )}
                                            {f.status === "added" && (
                                              <span className="text-[10px] text-emerald-400">
                                                {f.linesDiff} lines / {formatBytes(f.sizeDiff)}
                                              </span>
                                            )}
                                            {f.status === "removed" && (
                                              <span className="text-[10px] text-red-400">
                                                {Math.abs(f.linesDiff)} lines
                                              </span>
                                            )}
                                            <Badge className={`uppercase text-[9px] ${statusColors[f.status]}`}>{f.status}</Badge>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}

                              {/* Dependencies Section */}
                              {diff.dependencies.length > 0 && (
                                <div className="p-4 rounded-xl bg-zinc-900/40 border border-border/60 space-y-3">
                                  <h5 className="text-xs font-bold uppercase tracking-wider text-primary">Dependency Link Changes</h5>
                                  <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                                    {diff.dependencies.map((d, idx) => {
                                      const statusColors = {
                                        added: "bg-emerald-950/60 text-emerald-400 border-emerald-800/60",
                                        removed: "bg-red-950/60 text-red-400 border-red-800/60"
                                      };
                                      return (
                                        <div key={idx} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 rounded-lg bg-zinc-950/40 border border-border/40 text-xs">
                                          <div className="flex items-center gap-2 min-w-0">
                                            <code className="font-mono text-zinc-300 truncate">{d.source.split(/[\\/]/).pop()}</code>
                                            <span className="text-zinc-500 font-bold">→</span>
                                            <code className="font-mono text-zinc-300 truncate">{d.target.split(/[\\/]/).pop()}</code>
                                          </div>
                                          <Badge className={`uppercase text-[9px] ${statusColors[d.status]}`}>{d.status}</Badge>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })() : (
                      <div className="p-4 rounded-xl bg-zinc-900/20 border border-border/40 text-center text-xs text-zinc-400">
                        Failed to load comparison results.
                      </div>
                    )}
                  </div>
                )}

                {/* ─── ENV TAB ─── */}
                {activeResultTab === "env" && (
                  <div className="space-y-4 text-left">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                      <input className="w-full pl-8 py-2 text-xs bg-zinc-900/80 border border-border/60 rounded-lg text-zinc-300 focus:outline-none focus:border-primary/40"
                        placeholder="Search env vars..." value={envSearch} onChange={e => setEnvSearch(e.target.value)} />
                    </div>
                    {(result.metadata?.missingEnvVars?.length ?? 0) > 0 && (
                      <div className="p-3 rounded-xl bg-red-950/20 border border-red-900/40 flex items-start gap-2">
                        <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
                        <div>
                          <span className="text-red-400 text-xs font-bold">Missing from .env: </span>
                          {(result.metadata?.missingEnvVars ?? []).map((v: string) => <code key={v} className="text-[10px] font-mono text-red-400 ml-1">{v}</code>)}
                        </div>
                      </div>
                    )}
                    <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                      {(result.envVars ?? [])
                        .filter((e: EnvironmentVariable) => !envSearch || e.name.toLowerCase().includes(envSearch.toLowerCase()))
                        .map((env: EnvironmentVariable) => {
                          const isSel = selectedEnvVar?.name === env.name;
                          return (
                            <div key={env.name}
                              className={`p-3 rounded-xl border cursor-pointer transition-all duration-200 ${isSel ? "bg-primary/10 border-primary/40" : "bg-zinc-900/40 border-border/60 hover:border-border"}`}
                              onClick={() => setSelectedEnvVar(isSel ? null : env)}
                            >
                              <div className="flex items-center gap-2">
                                <div className={`w-2 h-2 rounded-full shrink-0 ${env.criticality === "HIGH" ? "bg-red-400" : "bg-zinc-500"}`} />
                                <code className="text-xs font-mono text-amber-400 flex-1">{env.name}</code>
                                <Badge variant="secondary" className="text-[9px]">{env.category}</Badge>
                                {env.criticality === "HIGH" && <Badge variant="error" className="text-[9px]">Critical</Badge>}
                              </div>
                              {isSel && (
                                <div className="mt-3 pt-3 border-t border-border/50 space-y-1.5">
                                  <p className="text-[10px] text-muted-foreground"><span className="text-zinc-400 font-semibold">Usages:</span> {env.usages}</p>
                                  {env.files?.length > 0 && (
                                    <div>
                                      <span className="text-[10px] text-zinc-400 font-semibold block mb-1">Found in:</span>
                                      {env.files.slice(0, 5).map((f: string) => <code key={f} className="text-[10px] font-mono text-emerald-400 block">{f}</code>)}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}

                {/* ─── AI ARCHITECT TAB ─── */}
                {activeResultTab === "ai-architect" && result.aiSummary && (
                  <div className="space-y-5 text-left">
                    <div className="p-5 rounded-2xl bg-gradient-to-br from-primary/10 to-emerald-500/5 border border-primary/20">
                      <div className="flex items-center gap-2 mb-3">
                        <Sparkles className="w-4 h-4 text-primary" />
                        <span className="text-xs font-bold uppercase tracking-widest text-primary">Repository Purpose</span>
                      </div>
                      <p className="text-sm text-zinc-200 leading-relaxed">{result.aiSummary.purpose}</p>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {Object.entries(result.aiSummary.stack as Record<string, string>).map(([key, value]) => (
                        <div key={key} className="p-3 rounded-xl bg-zinc-900/60 border border-border/60">
                          <div className="text-[9px] text-muted-foreground uppercase tracking-widest font-bold mb-1">{key}</div>
                          <div className="text-xs font-semibold text-zinc-200 truncate">{value || "—"}</div>
                        </div>
                      ))}
                    </div>

                    {/* Auth Evidence Section */}
                    {authData && (
                      <div className="p-4 rounded-xl bg-zinc-900/40 border border-border/60 space-y-3">
                        <div className="flex items-center gap-2">
                          <Shield className="w-4 h-4 text-primary" />
                          <h4 className="text-xs font-bold uppercase tracking-widest text-primary">Auth Detection Evidence</h4>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div>
                            <div className="text-[9px] text-muted-foreground uppercase tracking-widest font-bold mb-2">Detected Type</div>
                            <Badge variant={authData.authType !== "None detected" ? "success" : "secondary"} className="text-xs">{authData.authType}</Badge>
                          </div>
                          <div>
                            <div className="text-[9px] text-muted-foreground uppercase tracking-widest font-bold mb-2">Evidence</div>
                            <div className="space-y-1">
                              {authData.evidence.length > 0
                                ? authData.evidence.map((e, i) => <div key={i} className="text-[10px] text-zinc-300 flex items-center gap-1.5"><CheckCircle2 className="w-2.5 h-2.5 text-emerald-400 shrink-0" />{e}</div>)
                                : <span className="text-[10px] text-zinc-500">No auth evidence found</span>}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {result.aiSummary.lifecycle?.length > 0 && (
                      <div className="p-4 rounded-xl bg-zinc-900/40 border border-border/60 space-y-3">
                        <h4 className="text-xs font-bold uppercase tracking-widest text-primary">Request Lifecycle</h4>
                        <div className="flex flex-wrap items-center gap-2">
                          {result.aiSummary.lifecycle.map((step: string, idx: number) => (
                            <React.Fragment key={step}>
                              <span className="px-3 py-1.5 rounded-lg bg-zinc-800/80 border border-border/60 text-xs font-mono text-zinc-200">{step}</span>
                              {idx < result.aiSummary!.lifecycle.length - 1 && <ArrowRight className="w-3.5 h-3.5 text-primary" />}
                            </React.Fragment>
                          ))}
                        </div>
                      </div>
                    )}

                    {result.aiSummary.keyModules?.length > 0 && (
                      <div className="p-4 rounded-xl bg-zinc-900/40 border border-border/60 space-y-3">
                        <h4 className="text-xs font-bold uppercase tracking-widest text-primary">Key Modules</h4>
                        <div className="space-y-2">
                          {result.aiSummary.keyModules.map((mod: any) => (
                            <div key={mod.file} className="flex items-center justify-between p-2.5 rounded-lg bg-zinc-800/50 border border-border/40">
                              <div>
                                <code className="text-xs font-mono text-emerald-400">{mod.file}</code>
                                <p className="text-[10px] text-muted-foreground mt-0.5">{mod.role}</p>
                              </div>
                              <div className="text-[10px] font-bold text-primary shrink-0 ml-3">#{mod.importance}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {result.aiSummary.markdownSummary && (
                      <div className="p-5 rounded-xl bg-zinc-950/60 border border-border/60">
                        <h4 className="text-xs font-bold uppercase tracking-widest text-primary mb-4">Full Architecture Report</h4>
                        <div className="text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap font-mono">{result.aiSummary.markdownSummary}</div>
                      </div>
                    )}
                  </div>
                )}

                {/* ─── ONBOARDING TAB ─── */}
                {activeResultTab === "onboarding" && result.onboarding && (
                  <div className="space-y-5 text-left">
                    <div className="p-5 rounded-2xl bg-gradient-to-br from-emerald-900/20 to-teal-900/10 border border-emerald-800/40">
                      <div className="flex items-center gap-2 mb-3">
                        <Terminal className="w-4 h-4 text-emerald-400" />
                        <span className="text-xs font-bold uppercase tracking-widest text-emerald-400">Day 1 Guide</span>
                      </div>
                      <p className="text-sm text-zinc-200 leading-relaxed">{result.onboarding.summary}</p>
                    </div>

                    {/* Interactive Learning Path */}
                    <div className="p-4 rounded-xl bg-zinc-900/40 border border-border/60 space-y-3">
                      <h4 className="text-xs font-bold uppercase tracking-widest text-primary">Interactive Learning Path</h4>
                      <p className="text-[10px] text-muted-foreground">Click any step to inspect file details, dependencies, and its role in the system.</p>
                      <div className="space-y-0">
                        {result.onboarding.learningPath.map((step: any, idx: number) => {
                          const categoryColors: Record<string, string> = {
                            bootstrap:  "bg-yellow-500/20 border-yellow-500/60 text-yellow-400",
                            routing:    "bg-blue-500/20 border-blue-500/60 text-blue-400",
                            auth:       "bg-red-500/20 border-red-500/60 text-red-400",
                            service:    "bg-primary/20 border-primary/60 text-primary",
                            repository: "bg-purple-500/20 border-purple-500/60 text-purple-400",
                            database:   "bg-cyan-500/20 border-cyan-500/60 text-cyan-400",
                            config:     "bg-orange-500/20 border-orange-500/60 text-orange-400",
                            other:      "bg-zinc-700/40 border-zinc-600/60 text-zinc-400",
                          };
                          const color = categoryColors[step.category] ?? categoryColors.other;
                          const isOpen = openOnboardingStep === idx;

                          // Find file details from result.files
                          const fileNode = (result.files ?? []).find((f: FileNode) =>
                            f.path.endsWith(step.file) || f.path === step.file || f.path.includes(step.file.replace(/\\/g, "/"))
                          );

                          return (
                            <div key={step.file} className="flex gap-3 pb-3 last:pb-0">
                              {/* Timeline */}
                              <div className="flex flex-col items-center shrink-0">
                                <button
                                  onClick={() => setOpenOnboardingStep(isOpen ? null : idx)}
                                  className={`w-7 h-7 rounded-full border-2 flex items-center justify-center text-xs font-bold transition-all ${color} ${isOpen ? "scale-110" : ""}`}
                                >
                                  {isOpen ? <CheckCircle2 className="w-3.5 h-3.5" /> : step.order}
                                </button>
                                {idx < (result.onboarding?.learningPath?.length ?? 0) - 1 && (
                                  <div className="w-px flex-1 bg-border/40 mt-1 min-h-[16px]" />
                                )}
                              </div>

                              {/* Content */}
                              <div className="flex-1 min-w-0">
                                <button
                                  onClick={() => setOpenOnboardingStep(isOpen ? null : idx)}
                                  className="w-full text-left"
                                >
                                  <div className="flex items-center gap-2 mb-0.5">
                                    <span className="text-xs font-bold text-zinc-200">{step.label}</span>
                                    <Badge variant="secondary" className="text-[9px]">{step.category}</Badge>
                                  </div>
                                  <code className="text-[10px] font-mono text-emerald-400/80 block">{step.file}</code>
                                </button>

                                {/* Accordion Detail Panel */}
                                {isOpen && (
                                  <div className="mt-3 p-3 rounded-xl bg-zinc-950/60 border border-primary/20 space-y-3 text-left">
                                    {/* Purpose */}
                                    <div>
                                      <div className="text-[9px] font-bold text-primary uppercase tracking-widest mb-1">Purpose</div>
                                      <p className="text-[11px] text-zinc-300 leading-relaxed">{step.reason}</p>
                                    </div>

                                    {fileNode && (
                                      <>
                                        {/* Stats */}
                                        <div className="grid grid-cols-3 gap-2">
                                          {[
                                            { label: "Lines", value: fileNode.lineCount ?? 0 },
                                            { label: "Imports", value: (fileNode.internalImports?.length ?? 0) + (fileNode.externalImports?.length ?? 0) },
                                            { label: "Referenced By", value: fileNode.referencedBy?.length ?? 0 },
                                          ].map(s => (
                                            <div key={s.label} className="p-2 rounded-lg bg-zinc-900/60 border border-border/40 text-center">
                                              <div className="text-sm font-bold text-primary">{s.value}</div>
                                              <div className="text-[8px] text-muted-foreground uppercase">{s.label}</div>
                                            </div>
                                          ))}
                                        </div>

                                        {/* Internal Imports */}
                                        {fileNode.internalImports && fileNode.internalImports.length > 0 && (
                                          <div>
                                            <div className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest mb-1">Dependencies (imports)</div>
                                            <div className="flex flex-wrap gap-1">
                                              {fileNode.internalImports.slice(0, 8).map((imp: string) => (
                                                <code key={imp} className="text-[9px] font-mono text-blue-400 bg-zinc-900/60 px-1.5 py-0.5 rounded">{imp.split(/[\\/]/).pop()}</code>
                                              ))}
                                              {fileNode.internalImports.length > 8 && <span className="text-[9px] text-zinc-500">+{fileNode.internalImports.length - 8} more</span>}
                                            </div>
                                          </div>
                                        )}

                                        {/* Referenced By */}
                                        {fileNode.referencedBy && fileNode.referencedBy.length > 0 && (
                                          <div>
                                            <div className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest mb-1">Referenced By</div>
                                            <div className="flex flex-wrap gap-1">
                                              {fileNode.referencedBy.slice(0, 6).map((ref: string) => (
                                                <code key={ref} className="text-[9px] font-mono text-purple-400 bg-zinc-900/60 px-1.5 py-0.5 rounded">{ref.split(/[\\/]/).pop()}</code>
                                              ))}
                                              {fileNode.referencedBy.length > 6 && <span className="text-[9px] text-zinc-500">+{fileNode.referencedBy.length - 6} more</span>}
                                            </div>
                                          </div>
                                        )}
                                      </>
                                    )}

                                    {/* Architecture Position */}
                                    {result.architecture?.graph?.nodes && (() => {
                                      const archNode = result.architecture.graph.nodes.find((n: ArchitectureNode) =>
                                        n.file === fileNode?.path || n.label.toLowerCase().includes(step.label.toLowerCase())
                                      );
                                      return archNode ? (
                                        <div className="flex items-center gap-2">
                                          <div className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest">Architecture Layer:</div>
                                          <Badge variant="secondary" className="text-[9px]">{archNode.layer}</Badge>
                                        </div>
                                      ) : null;
                                    })()}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Critical Files */}
                    {result.onboarding.criticalFiles?.length > 0 && (
                      <div className="p-4 rounded-xl bg-zinc-900/40 border border-border/60 space-y-3">
                        <h4 className="text-xs font-bold uppercase tracking-widest text-primary">Critical Files</h4>
                        <div className="space-y-2">
                          {result.onboarding.criticalFiles.map((cf: any) => (
                            <div key={cf.file} className="flex items-start justify-between p-3 rounded-lg bg-zinc-800/50 border border-border/40 gap-3">
                              <div className="min-w-0">
                                <code className="text-xs font-mono text-emerald-400 block truncate">{cf.file}</code>
                                <p className="text-[10px] text-muted-foreground mt-0.5">{cf.role}</p>
                              </div>
                              <div className="shrink-0 text-[10px] font-bold text-zinc-400">Score: {cf.importanceScore}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Env Setup Checklist */}
                    {result.onboarding.envSetup?.length > 0 && (
                      <div className="p-4 rounded-xl bg-zinc-900/40 border border-border/60 space-y-3">
                        <h4 className="text-xs font-bold uppercase tracking-widest text-primary">Environment Setup Checklist</h4>
                        <div className="space-y-2">
                          {result.onboarding.envSetup.map((env: any) => (
                            <div key={env.name} className="flex items-center gap-3 p-2.5 rounded-lg bg-zinc-800/50 border border-border/40">
                              <div className={`w-2 h-2 rounded-full shrink-0 ${env.criticality === "HIGH" ? "bg-red-400" : "bg-zinc-500"}`} />
                              <code className="text-xs font-mono text-amber-400 shrink-0">{env.name}</code>
                              <span className="text-[10px] text-muted-foreground truncate">{env.description}</span>
                              {env.criticality === "HIGH" && <Badge variant="error" className="ml-auto shrink-0 text-[9px]">Required</Badge>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Architecture Tour */}
                    {result.onboarding.architectureTour?.length > 0 && (
                      <div className="p-4 rounded-xl bg-zinc-900/40 border border-border/60 space-y-3">
                        <h4 className="text-xs font-bold uppercase tracking-widest text-primary">Architecture Tour (Request Flow)</h4>
                        <div className="flex flex-wrap items-center gap-2">
                          {result.onboarding.architectureTour.map((file: string, idx: number) => (
                            <React.Fragment key={file}>
                              <code className="text-[10px] font-mono text-zinc-300 bg-zinc-800/60 border border-border/40 px-2 py-1 rounded-lg truncate max-w-[200px]">{file}</code>
                              {idx < result.onboarding!.architectureTour.length - 1 && <ArrowRight className="w-3.5 h-3.5 text-primary shrink-0" />}
                            </React.Fragment>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Analyze Another */}
                <div className="flex justify-end pt-4 border-t border-border/50">
                  <Button onClick={reset} variant="secondary">Analyze Another Codebase</Button>
                </div>
              </div>
            )}
          </Card>
        )}
      </div>

      {/* Feature Grid */}
      <div className="w-full pt-8 z-10">
        <h3 className="text-center text-sm font-semibold tracking-widest text-primary uppercase mb-8">Intelligence Pipeline</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {[
            { icon: <Layers className="w-5 h-5 text-primary" />, title: "Layer Architecture", desc: "Layer/File/Route graph modes with focus isolation and BFS subgraph rendering." },
            { icon: <Zap className="w-5 h-5 text-primary" />, title: "Execution Trace", desc: "Animate any route's flow from HTTP entry through controllers, services to the database." },
            { icon: <Heart className="w-5 h-5 text-primary" />, title: "Repository Health", desc: "Score 0–100 with dead code, cycle, and broken import breakdown." },
            { icon: <Terminal className="w-5 h-5 text-primary" />, title: "Interactive Onboarding", desc: "Click any learning step to inspect file dependencies, references, and architecture layer." },
          ].map(card => (
            <Card key={card.title} className="text-left flex flex-col justify-start">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mb-4">{card.icon}</div>
              <h4 className="text-md font-bold mb-2">{card.title}</h4>
              <p className="text-xs text-muted-foreground leading-relaxed">{card.desc}</p>
            </Card>
          ))}
        </div>
      </div>

      {/* AI Chat Button */}
      {status === "completed" && result && (
        <button onClick={() => setIsChatOpen(true)}
          className="fixed bottom-6 right-6 z-40 flex items-center gap-2 px-5 py-3 rounded-full bg-gradient-to-r from-primary to-emerald-500 hover:from-primary/90 hover:to-emerald-500/90 text-background font-bold text-sm shadow-2xl hover:shadow-primary/20 hover:scale-105 active:scale-95 transition-all duration-300"
        >
          <MessageSquare className="w-5 h-5" />
          <span>Ask AI Copilot</span>
          <Sparkles className="w-4 h-4 text-amber-300 fill-amber-300" />
        </button>
      )}

      {/* AI Chat Drawer */}
      {status === "completed" && result && isChatOpen && (
        <>
          <div className="fixed inset-0 bg-black/45 backdrop-blur-sm z-40" onClick={() => setIsChatOpen(false)} />
          <div className="fixed top-0 right-0 bottom-0 w-full max-w-[480px] bg-zinc-950/95 backdrop-blur-2xl border-l border-border/80 z-50 shadow-2xl flex flex-col">
            <div className="p-4 border-b border-border/50 flex items-center justify-between bg-zinc-900/40">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
                  <Bot className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h4 className="text-sm font-bold flex items-center gap-1.5">Architecture Copilot <Sparkles className="w-3.5 h-3.5 text-primary" /></h4>
                  <p className="text-[10px] text-muted-foreground font-semibold">Powered by Gemini & Multi-Agent Collaboration</p>
                </div>
              </div>
              <button onClick={() => setIsChatOpen(false)} className="p-1.5 rounded-lg hover:bg-zinc-800/80 text-muted-foreground hover:text-foreground transition text-xs font-bold">✕</button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {chatHistory.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 text-zinc-500 space-y-4">
                  <Bot className="w-12 h-12 text-zinc-700 mb-2" />
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-zinc-300">Ask anything about this codebase</p>
                    <p className="text-[10px] text-muted-foreground max-w-xs leading-relaxed">
                      &quot;Which endpoints execute database writes?&quot;, &quot;Explain the auth flow&quot;, or &quot;Where should I start?&quot;
                    </p>
                  </div>
                  <div className="flex flex-col gap-2 w-full max-w-xs pt-4">
                    {[
                      "Where is JWT created?",
                      "How does login work?",
                      "Which route updates users?",
                      "Where should I start as a new developer?"
                    ].map((prompt, pIdx) => (
                      <button key={pIdx} onClick={() => setChatMessage(prompt)}
                        className="text-left text-[11px] p-2.5 rounded-xl border border-border/40 bg-card/25 hover:bg-card/45 hover:border-primary/30 transition text-zinc-300 font-medium">
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                chatHistory.map((msg) => {
                  const isUser = msg.role === "user";
                  return (
                    <div key={msg.id} className={`flex flex-col ${isUser ? "items-end" : "items-start"} space-y-1`}>
                      <div className="flex items-center gap-1.5 px-1">
                        <span className="text-[9px] text-muted-foreground font-semibold font-mono">{isUser ? "You" : "Agents"}</span>
                        <span className="text-[8px] text-zinc-650">{new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                      </div>
                      <div className={`p-3.5 rounded-2xl max-w-[90%] text-xs leading-relaxed border shadow-sm ${isUser ? "bg-zinc-800/80 border-border/80 text-zinc-200 rounded-tr-none" : "bg-emerald-950/20 border-emerald-900/40 text-emerald-300 rounded-tl-none font-medium"}`}>
                        {msg.content}
                      </div>
                      {!isUser && msg.agentLogs && msg.agentLogs.length > 0 && (
                        <div className="w-full max-w-[90%] mt-1.5">
                          <button onClick={() => setExpandedAgentLogs(prev => ({ ...prev, [msg.id]: !prev[msg.id] }))}
                            className="flex items-center gap-1 text-[9px] text-primary/70 hover:text-primary font-bold tracking-wider uppercase transition pl-1">
                            {expandedAgentLogs[msg.id] ? <><ChevronUp className="w-3.5 h-3.5" />Hide Trace</> : <><ChevronDown className="w-3.5 h-3.5" />Show Agent Trace ({msg.agentLogs.length})</>}
                          </button>
                          {expandedAgentLogs[msg.id] && (
                            <div className="mt-1.5 p-3 rounded-xl bg-zinc-950/60 border border-border/40 font-mono text-[9px] text-zinc-400 space-y-1 max-h-[150px] overflow-y-auto">
                              {msg.agentLogs.map((logLine, lIdx) => <div key={lIdx} className="border-b border-zinc-900/30 pb-0.5 last:border-0">{logLine}</div>)}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
              {chatMutation.isPending && (
                <div className="flex flex-col items-start space-y-1">
                  <div className="flex items-center gap-1.5 px-1">
                    <span className="text-[9px] text-primary/80 font-bold uppercase tracking-wider">Agents Collaborating</span>
                    <Loader2 className="w-3 h-3 text-primary animate-spin" />
                  </div>
                  <div className="p-3.5 rounded-2xl rounded-tl-none bg-emerald-950/20 border border-emerald-900/30 text-xs text-emerald-400 font-medium max-w-[80%]">
                    Specialists compiling response...
                  </div>
                </div>
              )}
              <div id="chat-bottom" />
            </div>

            <form onSubmit={async (e) => {
              e.preventDefault();
              if (!chatMessage.trim() || chatMutation.isPending) return;
              const userMsg: ChatMessage = { id: Math.random().toString(36).substring(2, 11), role: "user", content: chatMessage, timestamp: new Date().toISOString() };
              setChatHistory(prev => [...prev, userMsg]);
              const sentMsg = chatMessage;
              setChatMessage("");
              setTimeout(() => document.getElementById("chat-bottom")?.scrollIntoView({ behavior: "smooth" }), 50);
              chatMutation.mutate({ jobId: currentJobId!, message: sentMsg });
            }} className="p-3 border-t border-border/50 bg-zinc-900/30 flex gap-2">
              <Input placeholder="Ask anything about the codebase..." value={chatMessage} onChange={(e) => setChatMessage(e.target.value)} disabled={chatMutation.isPending} className="text-xs h-9" />
              <Button type="submit" disabled={!chatMessage.trim() || chatMutation.isPending} className="h-9 px-4 bg-primary text-background hover:bg-primary/90">
                <Send className="w-4 h-4" />
              </Button>
            </form>
          </div>
        </>
      )}
    </main>
  );
}
