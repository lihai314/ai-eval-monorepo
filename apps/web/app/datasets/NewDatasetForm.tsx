"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function NewDatasetForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function create() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/datasets", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const body = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(body.error ?? "failed");
      return;
    }
    router.push(`/datasets/${body.id}`);
  }

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", margin: "12px 0" }}>
      <input
        placeholder="dataset name (e.g. triage-golden-v1)"
        value={name}
        onChange={(e) => setName(e.target.value)}
        style={{ flex: 1, padding: 6 }}
      />
      <button type="button" onClick={create} disabled={busy || name.length < 2}>
        {busy ? "creating…" : "＋ New dataset"}
      </button>
      {error && <span style={{ color: "#b60200" }}>{error}</span>}
    </div>
  );
}
