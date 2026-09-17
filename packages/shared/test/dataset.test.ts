import { describe, expect, it } from "vitest";
import {
  datasetCreateSchema,
  datasetItemPayloadSchema,
  itemCorrectionSchema,
} from "../src/dataset";

describe("datasetCreateSchema", () => {
  it("accepts lowercase slug names", () => {
    expect(datasetCreateSchema.safeParse({ name: "triage-golden-v1" }).success).toBe(true);
  });
  it("rejects spaces and uppercase", () => {
    expect(datasetCreateSchema.safeParse({ name: "My Dataset" }).success).toBe(false);
  });
  it("rejects too-short names", () => {
    expect(datasetCreateSchema.safeParse({ name: "a" }).success).toBe(false);
  });
});

describe("datasetItemPayloadSchema", () => {
  it("PRESERVES wrapper keys like result (regression: zod stripping erased them)", () => {
    const parsed = datasetItemPayloadSchema.parse({
      input: { issueNumber: 1, title: "t" },
      expected: { result: { category: "docs" } },
    });
    expect(parsed.expected).toEqual({ result: { category: "docs" } });
  });

  it("defaults expected to null (unjudged production sample)", () => {
    const parsed = datasetItemPayloadSchema.parse({ input: { issueNumber: 2, title: "x" } });
    expect(parsed.expected).toBeNull();
  });

  it("rejects invalid triage input (missing title)", () => {
    expect(datasetItemPayloadSchema.safeParse({ input: { issueNumber: 3 } }).success).toBe(false);
  });
});

describe("itemCorrectionSchema", () => {
  it("accepts a subset correction and null", () => {
    expect(
      itemCorrectionSchema.safeParse({ expected: { result: { category: "bug" } } }).success,
    ).toBe(true);
    expect(itemCorrectionSchema.safeParse({ expected: null }).success).toBe(true);
  });
});
