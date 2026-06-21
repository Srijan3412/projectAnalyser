import React from "react";
import { Loader2 } from "lucide-react";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  isLoading?: boolean;
}

export function Button({
  children,
  variant = "primary",
  isLoading = false,
  className = "",
  disabled,
  ...props
}: ButtonProps) {
  const baseStyles = "px-5 py-2.5 rounded-xl font-semibold transition duration-300 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm";
  
  const variants = {
    primary: "bg-primary text-background hover:bg-primary-hover shadow-lg hover:shadow-primary/10",
    secondary: "bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white border border-border/80",
    danger: "bg-red-650 text-white hover:bg-red-750",
    ghost: "bg-transparent text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200",
  };

  return (
    <button
      disabled={disabled || isLoading}
      className={`${baseStyles} ${variants[variant]} ${className}`}
      {...props}
    >
      {isLoading ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Please wait...</span>
        </>
      ) : (
        children
      )}
    </button>
  );
}
