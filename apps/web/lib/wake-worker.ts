/** Best-effort wake-up of the pull-pattern eval worker after enqueueing.
 *
 *  Render's free instance sleeps after 15 min idle and needs ~1 min to start,
 *  so callers must not block the HTTP response on this (route handlers use
 *  next/server `after`). The 30-min cron remains the backstop: a missed wake-up
 *  delays evaluation, it never loses it.
 */
const DRAIN_TIMEOUT_MS = 90_000;

export async function wakeWorker(limit = 25): Promise<void> {
  const base = process.env.WORKER_URL?.replace(/\/$/, "");
  if (!base) return;
  const token = process.env.EVAL_WORKER_TOKEN ?? process.env.WORKER_TOKEN ?? "";
  try {
    await fetch(`${base}/drain`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ limit, visibility_s: 300 }),
      signal: AbortSignal.timeout(DRAIN_TIMEOUT_MS),
    });
  } catch {
    // Deliberately silent: the queue is durable and the cron will retry.
  }
}
