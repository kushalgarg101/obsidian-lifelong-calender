import tsparser from "@typescript-eslint/parser";
import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

export default defineConfig([
  ...obsidianmd.configs.recommended,
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tsparser,
      parserOptions: { project: "./tsconfig.json" },
      globals: {
        console: "readonly",
        crypto: "readonly",
        window: "readonly",
        navigator: "readonly",
        document: "readonly",
      }
    },
    rules: {
      "obsidianmd/ui/sentence-case": ["warn", { allowAutoFix: true, acronyms: ["OpenAI", "Groq", "Gemini", "Ollama"] }],
    },
  },
]);
