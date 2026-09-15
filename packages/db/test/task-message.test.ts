import { describe, expect, it } from "vitest";
import { buildTaskMessage, QUEUE_NAME } from "../src/task-message";

describe("buildTaskMessage", () => {
  const base = {
    runId: "run-1",
    itemId: "item-1",
    input: { issueNumber: 42, title: "t", body: "b" },
    expected: { result: { category: "chore" } },
    sutBaseUrl: "https://app.example.com/",
  };

  it("matches the worker's EvalTask wire shape", () => {
    const msg = buildTaskMessage(base);
    expect(Object.keys(msg).sort()).toEqual([
      "expected",
      "input",
      "item_id",
      "metrics",
      "run_id",
      "sut",
    ]);
    expect(msg.sut).toEqual({ base_url: "https://app.example.com", path: "/api/triage" });
    expect(msg.metrics).toEqual([{ type: "exact_match" }]);
  });

  it("trims trailing slash on base_url and honors custom path", () => {
    const msg = buildTaskMessage({ ...base, sutPath: "/api/other" });
    expect(msg.sut.path).toBe("/api/other");
    expect(msg.sut.base_url.endsWith("/")).toBe(false);
  });

  it("rejects missing ids", () => {
    expect(() => buildTaskMessage({ ...base, runId: "" })).toThrow(/required/);
  });

  it("queue name is the one migrations created", () => {
    expect(QUEUE_NAME).toBe("eval_tasks");
  });
});
