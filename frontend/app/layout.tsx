import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "projectAnalyser — Understand Any Codebase in 30 Seconds",
  description: "Upload ZIPs or paste GitHub URLs to automatically discover routing patterns, dependency maps, and configuration settings.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`h-full dark ${inter.variable} antialiased`}>
      <body className="min-h-full flex flex-col bg-background text-foreground antialiased selection:bg-primary selection:text-background font-sans">
        <Providers>
          <div className="flex-1 flex flex-col">
            {children}
          </div>
        </Providers>
      </body>
    </html>
  );
}
