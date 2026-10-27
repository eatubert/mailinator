import next from "eslint-config-next/core-web-vitals";
import unusedImports from "eslint-plugin-unused-imports";
import tseslint from "typescript-eslint";

const eslintConfig = [
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      ".open-next/**",
      ".sst/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      "sst.config.ts",
      "sst-env.d.ts",
    ],
  },
  // Next.js rules: react, react-hooks, jsx-a11y, @next/next, Core Web Vitals
  ...next,
  // TypeScript recommended rules
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    plugins: {
      "unused-imports": unusedImports,
    },
    rules: {
      // Defer unused-vars handling to the unused-imports plugin (single source of truth)
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "unused-imports/no-unused-imports": "error",
      "unused-imports/no-unused-vars": [
        "warn",
        {
          vars: "all",
          varsIgnorePattern: "^_",
          args: "after-used",
          argsIgnorePattern: "^_",
        },
      ],
    },
  },
];

export default eslintConfig;
