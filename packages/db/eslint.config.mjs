import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "src/database.types.ts"] },
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
    },
  },
);
