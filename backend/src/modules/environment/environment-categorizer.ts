import { ENV_CATEGORIES } from "./env-rules.js";

export class EnvironmentCategorizer {
  /**
   * Categorizes an environment variable based on its name.
   */
  static categorize(name: string): string {
    const nameLower = name.toLowerCase();

    // Trace Security first as it is highest priority
    if (ENV_CATEGORIES.Security.some((kw) => nameLower.includes(kw))) {
      return "Security";
    }

    for (const [category, keywords] of Object.entries(ENV_CATEGORIES)) {
      if (category === "Security") continue;
      if (keywords.some((kw) => nameLower.includes(kw))) {
        return category;
      }
    }

    return "General";
  }
}
