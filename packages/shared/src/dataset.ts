import { z } from "zod";
import { triageRequestSchema } from "./triage";

/**
 * Dataset item contract for the triage SUT.
 * input   — what gets sent to the SUT (same shape as /api/triage)
 * expected — arbitrary subset JSON asserted against the FULL SUT response
 *            (e.g. {"result": {"category": "docs"}}). The grader is generic:
 *            every key path in expected must match. null = unjudged sample.
 *
 * NOT triageResultSchema.partial(): that silently strips unknown keys, which
 * erased the "result" wrapper on real data (verdicts all failed with
 * "empty expected"). The worker is SUT-agnostic; so is this contract.
 */
export const datasetItemPayloadSchema = z.object({
  input: triageRequestSchema,
  expected: z.record(z.string(), z.unknown()).nullable().default(null),
});
export type DatasetItemPayload = z.infer<typeof datasetItemPayloadSchema>;

export const datasetCreateSchema = z.object({
  name: z
    .string()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9][a-z0-9-_]*$/, "lowercase letters, digits, dash, underscore"),
});
export type DatasetCreate = z.infer<typeof datasetCreateSchema>;

/** PATCH body for correcting an item's expected value (P5 flywheel entry). */
export const itemCorrectionSchema = z.object({
  expected: z.record(z.string(), z.unknown()).nullable(),
});
export type ItemCorrection = z.infer<typeof itemCorrectionSchema>;
