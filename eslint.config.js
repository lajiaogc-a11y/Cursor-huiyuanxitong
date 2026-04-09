import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist",
      "**/dist/**",
      "server/dist",
      "server/dist/**",
      "release",
      "**/release/**",
      "reference-ui/**",
      "会员前端设计/**",
    ],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-explicit-any": "off",
    },
  },

  // ── 架构分层边界 ──────────────────────────────────────────────────

  // pages/ 禁止直接 import api 层和 HTTP client
  {
    files: ["src/pages/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["@/api/**"], message: "pages 层禁止直接 import api 层 — 通过 services/hooks 间接调用。" },
            { group: ["@/lib/apiClient", "@/lib/apiClient/**"], message: "pages 层禁止直接 import apiClient — 通过 services 间接调用。" },
          ],
        },
      ],
    },
  },

  // components/ 禁止直接 import api 层和 HTTP client
  {
    files: ["src/components/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["@/api/**"], message: "components 层禁止直接 import api 层 — 通过 services/hooks 间接调用。" },
            { group: ["@/lib/apiClient", "@/lib/apiClient/**"], message: "components 层禁止直接 import apiClient — 通过 services 间接调用。" },
          ],
        },
      ],
    },
  },

  // hooks/ 禁止反向依赖 pages，新代码禁止直接 import api 层
  {
    files: ["src/hooks/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "warn",
        {
          patterns: [
            { group: ["@/pages/**"], message: "hooks 层禁止反向依赖 pages 层。" },
            { group: ["@/api/**"], message: "hooks 层应通过 services 间接调用 api 层（历史代码除外，见白名单）。" },
          ],
        },
      ],
    },
  },

  // services/ 禁止反向依赖 pages 和 components
  {
    files: ["src/services/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["@/pages/**"], message: "services 层禁止反向依赖 pages 层。" },
            { group: ["@/components/**"], message: "services 层禁止反向依赖 components 层 — 请重构为 components 调用 services。" },
          ],
        },
      ],
    },
  },
);
