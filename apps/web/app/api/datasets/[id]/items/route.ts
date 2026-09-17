import { addItem, getDatasetDetail } from "@ai-eval/db";
import { datasetItemPayloadSchema } from "@ai-eval/shared";
import { currentUser } from "@/lib/supabase/server";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  if (!(await currentUser())) {
    return Response.json({ error: "unauthenticated" }, { status: 401 });
  }
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return Response.json({ error: "invalid dataset id" }, { status: 400 });
  }
  const parsed = datasetItemPayloadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      {
        error: "invalid item payload",
        issues: parsed.error.issues.map((i) => `${i.path}: ${i.message}`),
      },
      { status: 400 },
    );
  }
  try {
    const dataset = await getDatasetDetail(id);
    if (!dataset) return Response.json({ error: "dataset not found" }, { status: 404 });
    const item = await addItem(id, parsed.data.input, parsed.data.expected);
    return Response.json(item, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: message.includes("PG_DSN") ? 503 : 500 });
  }
}
