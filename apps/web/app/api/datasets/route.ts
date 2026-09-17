import { createDataset, getDatasetsSummary } from "@ai-eval/db";
import { datasetCreateSchema } from "@ai-eval/shared";
import { currentUser } from "@/lib/supabase/server";

export async function GET(): Promise<Response> {
  try {
    return Response.json({ datasets: await getDatasetsSummary() });
  } catch (err) {
    return respond(err);
  }
}

export async function POST(request: Request): Promise<Response> {
  if (!(await currentUser())) {
    return Response.json({ error: "unauthenticated" }, { status: 401 });
  }
  const parsed = datasetCreateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: "invalid dataset name", issues: parsed.error.issues.map((i) => i.message) },
      { status: 400 },
    );
  }
  try {
    return Response.json(await createDataset(parsed.data.name), { status: 201 });
  } catch (err) {
    return respond(err);
  }
}

function respond(err: unknown): Response {
  const message = err instanceof Error ? err.message : String(err);
  const status = message.includes("PG_DSN") ? 503 : message.includes("already exists") ? 409 : 500;
  return Response.json({ error: message }, { status });
}
