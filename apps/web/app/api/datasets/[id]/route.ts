import { getDatasetDetail } from "@ai-eval/db";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return Response.json({ error: "invalid dataset id" }, { status: 400 });
  }
  try {
    const dataset = await getDatasetDetail(id);
    if (!dataset) return Response.json({ error: "not found" }, { status: 404 });
    return Response.json(dataset);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: message.includes("PG_DSN") ? 503 : 500 });
  }
}
