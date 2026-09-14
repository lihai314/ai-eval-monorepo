import { describe, expect, it } from "vitest";
import { triageRequestSchema, triageResultSchema } from "../src/triage";

describe("triageRequestSchema", () => {
  it("accepts a minimal valid request", () => {
    const parsed = triageRequestSchema.parse({ issueNumber: 1, title: "crash on start" });
    expect(parsed.body).toBe("");
  });

  it("rejects non-positive issue numbers", () => {
    expect(triageRequestSchema.safeParse({ issueNumber: 0, title: "x" }).success).toBe(false);
  });
});

describe("triageResultSchema", () => {
  const valid = {
    category: "bug",
    severity: "high",
    labels: ["bug", "crash"],
    summary: "App crashes on startup when config file is missing.",
  };

  it("accepts a well-formed result", () => {
    expect(triageResultSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects unknown categories", () => {
    expect(triageResultSchema.safeParse({ ...valid, category: "wontfix" }).success).toBe(false);
  });

  it("requires at least one label", () => {
    expect(triageResultSchema.safeParse({ ...valid, labels: [] }).success).toBe(false);
  });
});
