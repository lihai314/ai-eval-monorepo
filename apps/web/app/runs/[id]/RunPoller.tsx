"use client";

import { useEffect } from "react";

/** Refreshes while the Render heartbeat drains the queue (30-min cadence —
 *  the poller is cheap and the page is honest about waiting). */
export default function RunPoller({ done }: { id: string; done: boolean }) {
  useEffect(() => {
    if (done) return;
    const t = setInterval(() => window.location.reload(), 10_000);
    return () => clearInterval(t);
  }, [done]);

  return (
    <p style={{ color: "#777" }}>
      {done ? "run complete." : "waiting for the next worker drain (auto-refresh every 10s)…"}
    </p>
  );
}
