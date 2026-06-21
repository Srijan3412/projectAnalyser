import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Github,
  Upload,
  FolderOpen,
  Link,
  FileArchive,
  AlertCircle,
  CheckCircle2,
  Loader2,
  ArrowRight
} from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { FileDropzone } from "../ui/dropzone";

type TabId = "github" | "zip" | "local";

interface TabConfig {
  id: TabId;
  label: string;
  icon: typeof Github;
  description: string;
}

const tabs: TabConfig[] = [
  {
    id: "github",
    label: "GitHub URL",
    icon: Github,
    description: "Clone a public or private repository"
  },
  {
    id: "zip",
    label: "ZIP Archive",
    icon: FileArchive,
    description: "Upload and extract a codebase archive"
  },
  {
    id: "local",
    label: "Local Directory",
    icon: FolderOpen,
    description: "Scan a local filesystem path"
  }
];

interface IngestionControlProps {
  onSubmitGithub: (url: string) => void;
  onSubmitZip: (file: File) => void;
  onSubmitLocal: (path: string) => void;
  isLoading: boolean;
  error: string | null;
}

export default function IngestionControl({
  onSubmitGithub,
  onSubmitZip,
  onSubmitLocal,
  isLoading,
  error
}: IngestionControlProps) {
  const [activeTab, setActiveTab] = useState<TabId>("github");
  const [githubUrl, setGithubUrl] = useState("");
  const [localPath, setLocalPath] = useState("c:\\Users\\91798\\Documents\\New folder (3)");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleSubmit = useCallback(
    (e?: React.FormEvent) => {
      if (e) e.preventDefault();
      if (isLoading) return;

      if (activeTab === "github" && githubUrl.trim()) {
        onSubmitGithub(githubUrl.trim());
      } else if (activeTab === "local" && localPath.trim()) {
        onSubmitLocal(localPath.trim());
      } else if (activeTab === "zip" && selectedFile) {
        onSubmitZip(selectedFile);
      }
    },
    [activeTab, githubUrl, localPath, selectedFile, onSubmitGithub, onSubmitZip, onSubmitLocal, isLoading]
  );

  const handleFileDrop = (file: File) => {
    setSelectedFile(file);
    onSubmitZip(file);
  };

  const isValid = () => {
    if (activeTab === "github") return githubUrl.trim().length > 0;
    if (activeTab === "local") return localPath.trim().length > 0;
    if (activeTab === "zip") return selectedFile !== null;
    return false;
  };

  return (
    <div className="w-full max-w-3xl mx-auto space-y-6">
      {/* Tab Header */}
      <div className="flex justify-center bg-zinc-900/60 p-1.5 rounded-2xl border border-border/60 max-w-md mx-auto backdrop-blur-md">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold tracking-wider transition-all duration-300 ${
                isActive
                  ? "bg-primary text-background shadow-lg font-bold"
                  : "text-muted-foreground hover:text-white"
              }`}
            >
              <Icon size={14} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className="glass-card rounded-2xl p-6 shadow-2xl">
        <AnimatePresence mode="wait">
          {/* GitHub Tab */}
          {activeTab === "github" && (
            <motion.div
              key="github"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-4"
            >
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center">
                  <Link className="text-primary" size={20} />
                </div>
                <div>
                  <h3 className="font-semibold text-white">Repository URL</h3>
                  <p className="text-xs text-muted-foreground">Enter a GitHub repository URL to clone and analyze</p>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="flex flex-col md:flex-row gap-3">
                <div className="flex-1">
                  <Input
                    type="url"
                    value={githubUrl}
                    onChange={(e) => setGithubUrl(e.target.value)}
                    placeholder="https://github.com/owner/repository"
                    icon={<Github className="w-5 h-5 text-muted-foreground" />}
                    required
                    disabled={isLoading}
                  />
                </div>
                <Button type="submit" isLoading={isLoading} disabled={!githubUrl.trim()} className="px-8 py-4">
                  Analyze Repo
                </Button>
              </form>

              <p className="text-[10px] text-muted-foreground/80 flex items-center gap-1">
                <AlertCircle size={12} className="text-primary" />
                Supports public repositories and private repos with environment token authentication.
              </p>
            </motion.div>
          )}

          {/* ZIP Tab */}
          {activeTab === "zip" && (
            <motion.div
              key="zip"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-4"
            >
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center">
                  <Upload className="text-primary" size={20} />
                </div>
                <div>
                  <h3 className="font-semibold text-white">Upload Archive</h3>
                  <p className="text-xs text-muted-foreground">Drag and drop a ZIP archive to analyze</p>
                </div>
              </div>

              <FileDropzone onFileDrop={handleFileDrop} disabled={isLoading} />
              
              {selectedFile && (
                <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-800/40 border border-zinc-700/50">
                  <div className="flex items-center gap-3">
                    <FileArchive className="text-primary" size={20} />
                    <span className="text-sm text-zinc-300 font-medium truncate max-w-md">{selectedFile.name}</span>
                  </div>
                  <span className="text-xs text-muted-foreground font-mono">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</span>
                </div>
              )}
            </motion.div>
          )}

          {/* Local Tab */}
          {activeTab === "local" && (
            <motion.div
              key="local"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-4"
            >
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center">
                  <FolderOpen className="text-primary" size={20} />
                </div>
                <div>
                  <h3 className="font-semibold text-white">Local Directory</h3>
                  <p className="text-xs text-muted-foreground">Scan a directory from your local filesystem</p>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="flex flex-col md:flex-row gap-3">
                <div className="flex-1">
                  <Input
                    type="text"
                    value={localPath}
                    onChange={(e) => setLocalPath(e.target.value)}
                    placeholder="c:\Users\..."
                    icon={<FolderOpen className="w-5 h-5 text-muted-foreground" />}
                    required
                    disabled={isLoading}
                  />
                </div>
                <Button type="submit" isLoading={isLoading} disabled={!localPath.trim()} className="px-8 py-4">
                  Scan Directory
                </Button>
              </form>

              <p className="text-[10px] text-muted-foreground/80 italic">
                Scans restricted to <code>c:\Users\91798\Documents</code>
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Error Display */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 p-4 rounded-xl bg-red-950/20 border border-red-900/50 flex items-start gap-3"
          >
            <AlertCircle className="text-red-400 flex-shrink-0 mt-0.5" size={16} />
            <div>
              <p className="text-red-400 font-medium text-sm">Error</p>
              <p className="text-red-300/80 text-sm">{error}</p>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
