import { defineConfig, globalIgnores } from "eslint/config";
import js from "@eslint/js";

const eslintConfig = defineConfig([
  js.configs.recommended,
  globalIgnores([
    "build/**",
    "dist/**",
    // Leftover Next.js scaffold — dead code, not part of the Vite app.
    // Delete `app/` and `.next/` to remove this entirely.
    "app/**",
    ".next/**",
  ]),
  // Node scripts (smoke tests, build helpers) run on Node, not in the browser.
  {
    files: ["*.mjs", "smoke-test.mjs"],
    languageOptions: {
      globals: {
        process: "readonly",
        console: "readonly",
        Buffer: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
      },
    },
  },
]);

export default eslintConfig;
