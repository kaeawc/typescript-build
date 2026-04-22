import baseConfig from "./eslint.config.mjs";

const typeAwareRules = {
  "@typescript-eslint/await-thenable": "error",
  "@typescript-eslint/no-floating-promises": "error",
  "@typescript-eslint/no-misused-promises": [
    "error",
    {
      checksVoidReturn: {
        attributes: false,
      },
    },
  ],
};

export default [
  ...baseConfig,
  {
    files: ["**/*.ts"],
    ignores: ["dist/**/*", "node_modules/**/*", "coverage/**/*", "scratch/**/*"],
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.typecheck.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: typeAwareRules,
  },
  {
    files: ["test/**/*.ts"],
    rules: {
      "@typescript-eslint/await-thenable": "off",
    },
  },
];
