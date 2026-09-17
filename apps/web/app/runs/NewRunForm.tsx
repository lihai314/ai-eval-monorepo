"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function NewRunForm({
  datasets,
  initial,
}: {
  datasets: string[];
  initial?: string;
}) {
  const router = useRouter();
  const [dataset, setDataset] = useState(initial ?? datasets[0] ?? "e2e-smoke");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/eval-runs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ datasetName: dataset }),
    });
    const body = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(body.error ?? "failed to start run");
      return;
    }
    router.push(`/runs/${body.runId}`);
  }

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", margin: "12px 0" }}>
      <label>
        dataset{" "}
        <select value={dataset} onChange={(e) => setDataset(e.target.value)}>
          {datasets.map((d) => (
            <option key={d}>{d}</option>
          ))}
        </select>
      </label>
      <button type="button" onClick={start} disabled={busy}>
        {busy ? "enqueuing…" : "▶ Run eval"}
      </button>
      {error && <span style={{ color: "#b60200" }}>{error}</span>}
    </div>
  );
}
