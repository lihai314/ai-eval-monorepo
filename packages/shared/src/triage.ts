import { z } from "zod";

/** Issue metadata sent to the triage agent (by CI, UI, or the API caller). */
export const triageRequestSchema = z.object({
  issueNumber: z.number().int().positive(),
  title: z.string().min(1).max(500),
  body: z.string().max(65536).default(""),
});
export type TriageRequest = z.infer<typeof triageRequestSchema>;

export const TRIAGE_CATEGORIES = ["bug", "feature", "docs", "question", "chore"] as const;
export const TRIAGE_SEVERITIES = ["low", "medium", "high", "critical"] as const;

/** Structured verdict produced by the agent. Everything downstream (labels, eval,
 *  monitoring) depends on this contract, so treat changes here as breaking. */
export const triageResultSchema = z.object({
  category: z.enum(TRIAGE_CATEGORIES),
  severity: z.enum(TRIAGE_SEVERITIES),
  labels: z.array(z.string().min(1).max(50)).min(1).max(6),
  summary: z.string().min(1).max(280),
});
export type TriageResult = z.infer<typeof triageResultSchema>;

export const APP_NAME = "issue-pilot";
