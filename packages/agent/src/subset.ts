/** Generic subset grader (TS mirror of workers/eval ExactMatchJudge):
 *  every key path in `expected` must match `actual`; extra keys ignored.
 *  Scalar normalization: numeric strings compare equal to numbers. */

function canon(obj: unknown): unknown {
  if (typeof obj === "boolean") return obj;
  if (typeof obj === "number") return obj;
  if (typeof obj === "string") {
    const s = obj.trim();
    const n = Number(s);
    return Number.isNaN(n) ? s : n;
  }
  return obj;
}

export function subsetMatch(
  expected: unknown,
  actual: unknown,
  path = "",
): { ok: boolean; problems: string[] } {
  if (expected !== null && typeof expected === "object" && !Array.isArray(expected)) {
    if (actual === null || typeof actual !== "object" || Array.isArray(actual)) {
      return { ok: false, problems: [path || "<root>"] };
    }
    const problems: string[] = [];
    for (const [key, want] of Object.entries(expected as Record<string, unknown>)) {
      const sub = path ? `${path}.${key}` : key;
      if (!(key in (actual as Record<string, unknown>))) {
        problems.push(`${sub} (missing)`);
        continue;
      }
      const deeper = subsetMatch(want, (actual as Record<string, unknown>)[key], sub);
      if (!deeper.ok) problems.push(...deeper.problems);
    }
    return { ok: problems.length === 0, problems };
  }
  if (canon(expected) !== canon(actual)) {
    return {
      ok: false,
      problems: [`${path}: got ${JSON.stringify(actual)} want ${JSON.stringify(expected)}`],
    };
  }
  return { ok: true, problems: [] };
}
