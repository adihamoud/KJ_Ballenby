import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";
import jsxA11y from "eslint-plugin-jsx-a11y";

const compat = new FlatCompat({
  baseDirectory: dirname(fileURLToPath(import.meta.url)),
});

const config = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  // next/core-web-vitals registers jsx-a11y but turns on only a handful of its rules. Run the
  // whole strict set on every component (docs/ACCESSIBILITY.md); the plugin is already loaded,
  // so only the rules are added here.
  {
    files: ["src/**/*.tsx"],
    rules: {
      ...jsxA11y.flatConfigs.strict.rules,
      // Our checkbox labels nest the text one level deeper (label > span > span > text).
      "jsx-a11y/label-has-associated-control": ["error", { depth: 3 }],
    },
  },
  {
    ignores: [".next/**", "out/**", "playwright-report/**", "test-results/**", "next-env.d.ts"],
  },
];

export default config;
