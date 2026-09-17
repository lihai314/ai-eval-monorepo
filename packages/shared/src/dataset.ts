import { z } from "zod";
import { triageRequestSchema, triageResultSchema } from "./triage";

/**
 * Dataset item contract for the triage SUT.
 * input   — what gets sent to the SUT (same shape as /api/triage)
 * expected — the partial ground truth the graders assert (subset matching:
 *            only fields you care about). null = unjudged production sample.
 */
export const datasetItemPayloadSchema = z.object({
  input: triageRequestSchema,
  expected: triageResultSchema.partial().nullable().default(null),
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
  expected: triageResultSchema.partial().nullable(),
});
export type ItemCorrection = z.infer<typeof itemCorrectionSchema>;
