"use client";

import { useEffect } from "react";

/** Refreshes while the worker drains the queue — woken by the BFF right after
 *  enqueueing, with the 30-min cron as backstop. The poller is cheap. */
export default function RunPoller({ done }: { id: string; done: boolean }) {
  useEffect(() => {
    if (done) return;
    const t = setInterval(() => window.location.reload(), 10_000);
    return () => clearInterval(t);
  }, [done]);

  return (
    <p style={{ color: "#777" }}>
      {done
        ? "run complete."
        : "waiting for the worker to drain the queue (auto-refresh every 10s)…"}
    </p>
  );
}
