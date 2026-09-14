import { getLlmFromEnv, TriageParseError, triageIssue } from "@ai-eval/agent";
import { triageRequestSchema } from "@ai-eval/shared";

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "request body must be valid JSON" }, { status: 400 });
  }

  const parsed = triageRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      {
        error: "invalid triage request",
        issues: parsed.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      },
      { status: 400 },
    );
  }

  try {
    const llm = getLlmFromEnv(process.env);
    const startedAt = Date.now();
    const result = await triageIssue(parsed.data, llm);
    return Response.json({
      issueNumber: parsed.data.issueNumber,
      model: llm.model,
      latencyMs: Date.now() - startedAt,
      result,
    });
  } catch (error) {
    if (error instanceof TriageParseError) {
      // 502: upstream (LLM) produced unusable output — distinct from our 400s.
      return Response.json(
        { error: "agent_output_invalid", detail: error.message },
        { status: 502 },
      );
    }
    throw error;
  }
}
