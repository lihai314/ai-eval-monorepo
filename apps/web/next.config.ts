import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Workspace packages ship as TypeScript sources; transpile them directly.
  transpilePackages: ["@ai-eval/shared", "@ai-eval/agent"],
  // Baked in at build time so /api/health can report exactly what is live —
  // this is what makes the smoke gate meaningful (deployed SHA == expected SHA).
  env: {
    GIT_SHA: process.env.GIT_SHA ?? "dev",
    GIT_BRANCH: process.env.GIT_BRANCH ?? "unknown",
    APP_VERSION: process.env.APP_VERSION ?? "0.1.0",
  },
};

export default nextConfig;
