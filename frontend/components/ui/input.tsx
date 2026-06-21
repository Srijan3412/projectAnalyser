import React from "react";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: React.ReactNode;
}

export function Input({ icon, className = "", ...props }: InputProps) {
  return (
    <div className="relative w-full">
      {icon && (
        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-muted-foreground/80">
          {icon}
        </div>
      )}
      <input
        className={`w-full ${
          icon ? "pl-12" : "pl-4"
        } pr-4 py-3.5 rounded-xl border border-border bg-card/30 backdrop-blur-md text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition duration-300 placeholder:text-zinc-650 text-sm ${className}`}
        {...props}
      />
    </div>
  );
}
