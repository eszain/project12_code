import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Third-party Animate UI code copied in by the shadcn CLI. Kept as published so it can be updated with
    // `npx shadcn add`; these newer React Compiler lint rules flag patterns the library uses on purpose.
    files: ["src/components/animate-ui/**", "src/hooks/use-controlled-state.tsx", "src/hooks/use-auto-height.tsx", "src/hooks/use-mobile.ts"],
    rules: {
      "react-hooks/purity": "off",
      "react-hooks/static-components": "off",
      "react-hooks/refs": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
