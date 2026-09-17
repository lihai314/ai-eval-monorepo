import { deleteItem, updateItemExpected } from "@ai-eval/db";
import { itemCorrectionSchema } from "@ai-eval/shared";
import { currentUser } from "@/lib/supabase/server";

/** PATCH = the correction entry point: updating expected flips provenance to
 *  'corrected' — the raw material of the P5 data flywheel. */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string; itemId: string }> },
): Promise<Response> {
  if (!(await currentUser())) {
    return Response.json({ error: "unauthenticated" }, { status: 401 });
  }
  const { itemId } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(itemId)) {
    return Response.json({ error: "invalid item id" }, { status: 400 });
  }
  const parsed = itemCorrectionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: "invalid correction", issues: parsed.error.issues.map((i) => i.message) },
      { status: 400 },
    );
  }
  try {
    await updateItemExpected(itemId, parsed.data.expected);
    return Response.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: message.includes("PG_DSN") ? 503 : 500 });
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string; itemId: string }> },
): Promise<Response> {
  if (!(await currentUser())) {
    return Response.json({ error: "unauthenticated" }, { status: 401 });
  }
  const { itemId } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(itemId)) {
    return Response.json({ error: "invalid item id" }, { status: 400 });
  }
  try {
    await deleteItem(itemId);
    return Response.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: message.includes("PG_DSN") ? 503 : 500 });
  }
}
