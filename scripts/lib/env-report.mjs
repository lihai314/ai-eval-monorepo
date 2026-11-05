/**
 * Redaction helpers shared by the Vercel / Render env reconcile scripts.
 *
 * Rule: reports and errors may contain key names, targets, types, existence and
 * HTTP status only. Values, value prefixes and raw API response bodies must
 * never reach stdout, stderr, job summaries or exception messages.
 */

/** One env var -> metadata-only line. Never reads `value`. */
export function describeEnv(entry) {
  const key = String(entry?.key ?? "(unknown)");
  const target = Array.isArray(entry?.target)
    ? entry.target.join(",")
    : String(entry?.target ?? "");
  const type = String(entry?.type ?? "unknown");
  return `  ${key} target=${JSON.stringify(target)} type=${type}`;
}

/** Render returns [{cursor, envVar:{...}}]; Vercel returns [{...}]. */
export function describeEnvVars(payload) {
  const rows = Array.isArray(payload) ? payload : (payload?.envVars ?? []);
  return rows.map((row) => describeEnv(row?.envVar ?? row));
}

/** Error text that carries status but no upstream response body. */
export function safeHttpError(prefix, status) {
  return `${prefix}: HTTP ${status} (response body suppressed)`;
}

/** Missing value sources are reported by key name, never by value. */
export function missingSource(prefix, key) {
  return `${prefix} ${key}: source missing or empty — SKIPPED (not written)`;
}
