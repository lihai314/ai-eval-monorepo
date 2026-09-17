import { describe, expect, it } from "vitest";
import { subsetMatch } from "../src/subset";

describe("subsetMatch", () => {
  const output = {
    issueNumber: 42,
    model: "glm-5.3-flash",
    latencyMs: 3000,
    result: { category: "docs", severity: "low", labels: ["readme"] },
  };

  it("asserts nested subset against the full response", () => {
    expect(subsetMatch({ result: { category: "docs" } }, output).ok).toBe(true);
    expect(subsetMatch({ result: { category: "bug" } }, output).ok).toBe(false);
  });

  it("reports missing and mismatched paths", () => {
    const r = subsetMatch({ result: { category: "docs", severity: "high" } }, output);
    expect(r.ok).toBe(false);
    expect(r.problems.join("; ")).toContain("severity");
  });

  it("normalizes numeric strings", () => {
    expect(subsetMatch({ issueNumber: 42 }, { issueNumber: "42" }).ok).toBe(true);
  });
});
