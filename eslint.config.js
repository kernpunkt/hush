import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettierConfig from "eslint-config-prettier";
import prettierPlugin from "eslint-plugin-prettier";

export default tseslint.config(
  {
    ignores: ["test/**", "dist/**", "vitest.config.ts"],
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
      prettierConfig,
    ],
    plugins: {
      prettier: prettierPlugin,
    },
    rules: {
      "prettier/prettier": "error",
      "@typescript-eslint/no-shadow": "off",
      "no-underscore-dangle": "off",
      "class-methods-use-this": "off",
      "@typescript-eslint/no-unused-vars": "warn",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/naming-convention": [
        "warn",
        {
          selector: "typeProperty",
          format: ["PascalCase", "UPPER_CASE", "camelCase", "snake_case"],
          leadingUnderscore: "allow",
          trailingUnderscore: "allow",
        },
      ],
    },
  }
);
