import { createEvalRun, listRuns } from "@ai-eval/db";
import { after } from "next/server";
import { currentUser } from "@/lib/supabase/server";
import { wakeWorker } from "@/lib/wake-worker";

export async function GET(): Promise<Response> {
  // Run detail includes per-item model output; the console gates on login, so
  // the API must too (it used to be readable anonymously).
  if (!(await currentUser())) {
    return Response.json({ error: "unauthenticated" }, { status: 401 });
  }
  try {
    return Response.json({ runs: await listRuns() });
  } catch (err) {
    return respond(err);
  }
}

export async function POST(request: Request): Promise<Response> {
  // Writing = spending (queue fan-out, later LLM calls). Auth-gated.
  if (!(await currentUser())) {
    return Response.json({ error: "unauthenticated" }, { status: 401 });
  }
  try {
    const body = (await request.json()) as { datasetName?: unknown };
    const datasetName = typeof body?.datasetName === "string" ? body.datasetName : "";
    if (!datasetName) {
      return Response.json({ error: "datasetName (string) is required" }, { status: 400 });
    }
    const result = await createEvalRun(datasetName);
    // Wake the worker now instead of waiting up to 30 minutes for the cron.
    // `after` runs once the response is flushed, so a cold Render start
    // (~1 min) doesn't hold the user's request open.
    after(() => wakeWorker());
    return Response.json(result, { status: 201 });
  } catch (err) {
    return respond(err);
  }
}

function respond(err: unknown): Response {
  const message = err instanceof Error ? err.message : String(err);
  // Missing PG_DSN is a configuration state, not a server bug.
  const status = message.includes("PG_DSN") || message.includes("dataset not found") ? 503 : 500;
  return Response.json({ error: message }, { status });
}
