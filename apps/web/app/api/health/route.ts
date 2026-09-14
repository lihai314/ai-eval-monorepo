/**
 * Liveness + identity endpoint. This is the smoke-test target: it reports the
 * exact commit that is running, so "deployed" and "deployed the right thing"
 * are distinguishable.
 */
export async function GET(): Promise<Response> {
  return Response.json({
    status: "ok",
    service: "issue-pilot-web",
    version: process.env.APP_VERSION ?? "dev",
    gitSha: process.env.GIT_SHA ?? "dev",
    gitBranch: process.env.GIT_BRANCH ?? "unknown",
    llmMode: process.env.OPENAI_API_KEY ? "live" : "mock",
    checkedAt: new Date().toISOString(),
  });
}
