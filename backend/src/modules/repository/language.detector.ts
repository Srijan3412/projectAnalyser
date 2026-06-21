import path from "path";

const EXTENSION_MAP: Record<string, string> = {
  ".ts": "TypeScript",
  ".tsx": "TypeScript",
  ".js": "JavaScript",
  ".jsx": "JavaScript",
  ".py": "Python",
  ".go": "Go",
  ".rs": "Rust",
  ".java": "Java",
  ".cpp": "C++",
  ".c": "C",
  ".h": "C/C++ Header",
  ".cs": "C#",
  ".php": "PHP",
  ".rb": "Ruby",
  ".swift": "Swift",
  ".kt": "Kotlin",
  ".html": "HTML",
  ".css": "CSS",
  ".scss": "SCSS",
  ".json": "JSON",
  ".yml": "YAML",
  ".yaml": "YAML",
  ".md": "Markdown",
  ".sh": "Shell Script",
  ".bat": "Batch",
  ".ps1": "PowerShell",
};

export class LanguageDetector {
  static detect(filePaths: string[]): {
    languages: Record<string, number>;
    primaryLanguages: string[];
  } {
    const counts: Record<string, number> = {};

    for (const filePath of filePaths) {
      const ext = path.extname(filePath).toLowerCase();
      const language = EXTENSION_MAP[ext];
      if (language) {
        counts[language] = (counts[language] || 0) + 1;
      }
    }

    // Sort languages by count in descending order
    const sortedLanguages = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);

    return {
      languages: counts,
      primaryLanguages: sortedLanguages,
    };
  }
}
