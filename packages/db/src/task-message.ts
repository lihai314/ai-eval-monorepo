/**
 * The message contract between the BFF and the Render worker. Pure and
 * shared-testable: both sides' bugs would hide in this shape otherwise.
 * Field names mirror workers/eval/app/protocols.py EvalTask — keep in sync.
 */
export interface EvalTaskMessage {
  run_id: string;
  item_id: string;
  input: Record<string, unknown>;
  expected: Record<string, unknown> | null;
  sut: { base_url: string; path: string; headers?: Record<string, string> };
  metrics: Array<Record<string, unknown>>;
}

export const QUEUE_NAME = "eval_tasks";

export function buildTaskMessage(params: {
  runId: string;
  itemId: string;
  input: Record<string, unknown>;
  expected: Record<string, unknown> | null;
  sutBaseUrl: string;
  sutPath?: string;
  metrics?: Array<Record<string, unknown>>;
}): EvalTaskMessage {
  if (!params.runId || !params.itemId) {
    throw new Error("runId and itemId are required");
  }
  return {
    run_id: params.runId,
    item_id: params.itemId,
    input: params.input,
    expected: params.expected,
    sut: {
      base_url: params.sutBaseUrl.replace(/\/$/, ""),
      path: params.sutPath ?? "/api/triage",
    },
    metrics: params.metrics ?? [{ type: "exact_match" }],
  };
}
