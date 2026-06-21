import React, { useState } from "react";
import { UploadCloud } from "lucide-react";

interface FileDropzoneProps {
  onFileDrop: (file: File) => void;
  disabled?: boolean;
  className?: string;
}

export function FileDropzone({ onFileDrop, disabled = false, className = "" }: FileDropzoneProps) {
  const [dragActive, setDragActive] = useState(false);

  const handleDrag = (e: React.DragEvent) => {
    if (disabled) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    if (disabled) return;
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      onFileDrop(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onFileDrop(e.target.files[0]);
    }
  };

  return (
    <div
      onDragEnter={handleDrag}
      onDragOver={handleDrag}
      onDragLeave={handleDrag}
      onDrop={handleDrop}
      className={`border border-dashed rounded-2xl py-10 text-center transition duration-300 relative overflow-hidden flex flex-col items-center justify-center cursor-pointer ${
        dragActive 
          ? "border-primary bg-primary/5" 
          : "border-border bg-card/25 hover:border-zinc-700"
      } ${className}`}
    >
      <input
        type="file"
        id="file-upload"
        className="hidden"
        accept=".zip"
        onChange={handleFileChange}
        disabled={disabled}
      />
      <label htmlFor="file-upload" className="w-full cursor-pointer flex flex-col items-center">
        <UploadCloud className="w-12 h-12 text-zinc-550 mb-4 transition duration-300 hover:text-primary" />
        <p className="text-sm text-foreground font-medium mb-1">
          Drag and drop your repository ZIP here
        </p>
        <p className="text-xs text-muted-foreground">
          or <span className="text-primary hover:underline">browse files</span>
        </p>
      </label>
    </div>
  );
}
