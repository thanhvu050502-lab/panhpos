import { defineConfig, globalIgnores } from "eslint/config";
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

const eslintConfig = defineConfig([
  js.configs.recommended,
  ...tseslint.configs.recommended,
  globalIgnores(["build/**", "dist/**"]),
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
  // App source: enable react-hooks rules; relax noisy typescript-eslint defaults
  // so the upgrade doesn't drown the codebase in a sea of pre-existing warnings.
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      // The codebase intentionally uses `any` in cache/payload paths; tighten later.
      "@typescript-eslint/no-explicit-any": "off",
      // Allow unused vars prefixed with `_` (destructuring drops, etc.).
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },
]);

export default eslintConfig;
