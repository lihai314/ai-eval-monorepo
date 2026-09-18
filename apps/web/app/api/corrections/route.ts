import { deriveExpected, upsertCorrection } from "@ai-eval/db";

/** Correction feedback webhook: called by correction.yml on issue label changes.
 *  Auth: Bearer CORRECTION_SECRET (shared with the GitHub workflow).
 *  Body: { issueNumber, title, body, labels[] } — labels come from the issue. */

export async function POST(request: Request): Promise<Response> {
  const secret = process.env.CORRECTION_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }

  const b = body as Record<string, unknown>;
  const issueNumber = Number(b?.issueNumber);
  const title = typeof b?.title === "string" ? b.title : "";
  const issueBody = typeof b?.body === "string" ? b.body : "";
  const labels = Array.isArray(b?.labels)
    ? b.labels.filter((l): l is string => typeof l === "string")
    : [];

  if (!issueNumber || !title) {
    return Response.json({ error: "issueNumber and title are required" }, { status: 400 });
  }

  const expected = deriveExpected(labels);
  if (!expected) {
    return Response.json(
      { error: "no category label found — cannot derive ground truth", labels },
      { status: 422 },
    );
  }

  try {
    const action = await upsertCorrection({
      issueNumber,
      title,
      body: issueBody,
      category: expected.category,
      severity: expected.severity,
    });
    return Response.json({ ok: true, action }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: message.includes("PG_DSN") ? 503 : 500 });
  }
}
