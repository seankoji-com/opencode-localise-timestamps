// @ts-check
import tseslint from "typescript-eslint"

export default tseslint.config(
  { ignores: ["dist/**"] },
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
  {
    // Tests mock loosely-typed plugin hook I/O; `any` there is a mocking
    // convenience, not a type-safety gap in the code under test.
    files: ["test/**"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
)
