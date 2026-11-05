import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Route handlers import through the `@/*` alias from tsconfig.json; Vite
  // doesn't read tsconfig paths, so mirror it here.
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
