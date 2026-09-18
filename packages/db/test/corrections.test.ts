import { describe, expect, it } from "vitest";
import { deriveExpected } from "../src/corrections";

describe("deriveExpected", () => {
  it("extracts category and severity from vocabulary labels", () => {
    expect(deriveExpected(["bug", "crash", "severity:high"])).toEqual({
      category: "bug",
      severity: "high",
    });
  });

  it("returns category without severity when absent", () => {
    expect(deriveExpected(["docs"])).toEqual({ category: "docs" });
  });

  it("returns null when no category label matches", () => {
    expect(deriveExpected(["enhancement", "good-first-issue"])).toBeNull();
  });

  it("ignores severity labels without a category", () => {
    expect(deriveExpected(["severity:critical"])).toBeNull();
  });

  it("returns the first match in CATEGORIES order (not label order)", () => {
    // CATEGORIES order: bug, feature, docs, question, chore
    expect(deriveExpected(["question", "docs"])).toEqual({ category: "docs" });
    expect(deriveExpected(["docs", "question"])).toEqual({ category: "docs" });
  });
});
