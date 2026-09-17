import type { TriageResult } from "@ai-eval/shared";
import { describe, expect, it } from "vitest";
import {
  alreadyTrialed,
  formatTriageComment,
  issueToTriageRequest,
  selectLabels,
  TRIAGE_MARKER,
} from "../src";

const VOCAB = [
  "bug",
  "feature",
  "docs",
  "question",
  "chore",
  "severity:low",
  "severity:medium",
  "severity:high",
  "severity:critical",
];

const verdict = (over: Partial<TriageResult> = {}): TriageResult => ({
  category: "bug",
  severity: "high",
  labels: ["auth", "crash"],
  summary: "Crash on startup.",
  ...over,
});

describe("issueToTriageRequest", () => {
  it("normalizes null body and keeps title", () => {
    const req = issueToTriageRequest({ number: 5, title: "x", body: null });
    expect(req).toEqual({ issueNumber: 5, title: "x", body: "" });
  });

  it("truncates bodies beyond 8000 chars", () => {
    const req = issueToTriageRequest({ number: 1, title: "t", body: "a".repeat(10000) });
    expect(req.body.length).toBe(8000);
  });
});

describe("selectLabels", () => {
  it("maps category and severity onto the vocabulary", () => {
    expect(selectLabels(verdict(), VOCAB)).toEqual(["bug", "severity:high"]);
  });

  it("drops labels that do not exist in the repo", () => {
    const withReal = selectLabels(verdict({ labels: ["bug", "docs"] }), VOCAB);
    expect(withReal).toContain("docs");
    expect(withReal).not.toContain("auth");
  });

  it("never exceeds the cap and never duplicates", () => {
    const many = verdict({
      labels: ["docs", "question", "chore", "bug", "feature", "severity:low", "severity:critical"],
    });
    const out = selectLabels(many, VOCAB);
    expect(out.length).toBeLessThanOrEqual(6);
    expect(new Set(out).size).toBe(out.length);
  });
});

describe("alreadyTrialed", () => {
  it("detects the marker comment", () => {
    expect(alreadyTrialed([{ body: "whatever" }, { body: `hi ${TRIAGE_MARKER}` }])).toBe(true);
  });

  it("tolerates null bodies", () => {
    expect(alreadyTrialed([{ body: null }, {}])).toBe(false);
  });
});

describe("formatTriageComment", () => {
  it("中文回帖：包含判决字段、提议标签与幂等标记", () => {
    const body = formatTriageComment(verdict(), { model: "mock", latencyMs: 3 });
    expect(body).toContain("自动分诊");
    expect(body).toContain("`bug`");
    expect(body).toContain("`high`");
    expect(body).toContain("提议标签");
    expect(body).toContain("Crash on startup.");
    expect(body).toContain(TRIAGE_MARKER);
  });
});
