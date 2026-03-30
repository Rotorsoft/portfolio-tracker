import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    coverage: {
      provider: "v8",
      include: ["packages/domain/src/**/*.ts", "packages/app/src/client/live.ts", "packages/app/src/client/fmt.ts"],
      exclude: ["packages/domain/src/drizzle/index.ts", "packages/domain/src/index.ts"],
      thresholds: { statements: 90, branches: 60, functions: 90, lines: 90 },
    },
  },
});
