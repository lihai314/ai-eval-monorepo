/** Correction feedback loop: human label changes on GitHub issues flow back
 *  into the dataset as corrected samples (provenance='corrected').
 *  This is the P5 flywheel's write side. */

import type postgres from "postgres";
import { getSql } from "./runs";

const DATASET = "triage-zh-v1";
const CATEGORIES = ["bug", "feature", "docs", "question", "chore"] as const;
const SEVERITIES = ["low", "medium", "high", "critical"] as const;

export interface CorrectionPayload {
  issueNumber: number;
  title: string;
  body: string;
  category: string;
  severity?: string;
}

/** Extract the first category/severity from a list of GitHub labels.
 *  Returns null for labels not in the vocabulary. */
export function deriveExpected(
  labels: readonly string[],
): { category: string; severity?: string } | null {
  const category = CATEGORIES.find((c) => labels.includes(c));
  if (!category) return null;
  const sev = SEVERITIES.find((s) => labels.includes(`severity:${s}`));
  return { category, ...(sev ? { severity: sev } : {}) };
}

/** Upsert a correction into the designated dataset.
 *  Matches by input->>'issueNumber' within the dataset (not by UUID — the
 *  caller identifies items by GitHub issue number, which is the natural key). */
export async function upsertCorrection(payload: CorrectionPayload): Promise<"created" | "updated"> {
  const s = getSql();
  const [ds] =
    await s`select id from datasets where name = ${DATASET} order by version desc limit 1`;
  if (!ds) throw new Error(`correction dataset '${DATASET}' not found`);

  const expected: Record<string, unknown> = { result: { category: payload.category } };
  if (payload.severity)
    expected.result = {
      ...(expected.result as Record<string, unknown>),
      severity: payload.severity,
    };

  const input: Record<string, unknown> = {
    issueNumber: payload.issueNumber,
    title: payload.title,
    body: payload.body,
  };

  const [existing] = await s`
    select id from dataset_items
    where dataset_id = ${ds.id} and input->>'issueNumber' = ${String(payload.issueNumber)}
    limit 1`;

  if (existing) {
    await s`
      update dataset_items
      set expected = ${expected as unknown as postgres.Parameter}, provenance = 'corrected'
      where id = ${existing.id}`;
    return "updated";
  }

  await s`
    insert into dataset_items (dataset_id, input, expected, provenance)
    values (${ds.id}, ${input as unknown as postgres.Parameter}, ${expected as unknown as postgres.Parameter}, 'corrected')`;
  return "created";
}

export { DATASET as CORRECTION_DATASET };
