"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Add one item: input (title/body) + expected ground truth (subset JSON). */
export default function AddItemForm({ datasetId }: { datasetId: string }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [expected, setExpected] = useState('{"result": {"category": "docs"}}');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function add() {
    setBusy(true);
    setError(null);
    let expectedParsed: unknown = null;
    try {
      expectedParsed = expected.trim() ? JSON.parse(expected) : null;
    } catch {
      setError("expected is not valid JSON");
      setBusy(false);
      return;
    }
    const res = await fetch(`/api/datasets/${datasetId}/items`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        input: {
          issueNumber: Math.floor(Math.random() * 90000) + 1,
          title,
          body,
        },
        expected: expectedParsed,
      }),
    });
    const body2 = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(body2.error ?? "failed");
      return;
    }
    setTitle("");
    setBody("");
    router.refresh();
  }

  return (
    <div style={{ border: "1px solid #ddd", padding: 12, margin: "12px 0" }}>
      <h3 style={{ marginTop: 0 }}>Add item</h3>
      <input
        placeholder="issue title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        style={{ width: "100%", padding: 6, marginBottom: 6 }}
      />
      <textarea
        placeholder="issue body (optional)"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={2}
        style={{ width: "100%", padding: 6, marginBottom: 6 }}
      />
      <textarea
        placeholder='expected (subset JSON, e.g. {"result": {"category": "docs"}})'
        value={expected}
        onChange={(e) => setExpected(e.target.value)}
        rows={3}
        style={{ width: "100%", padding: 6, fontFamily: "monospace", fontSize: 12 }}
      />
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6 }}>
        <button type="button" onClick={add} disabled={busy || !title}>
          {busy ? "adding…" : "＋ Add item"}
        </button>
        {error && <span style={{ color: "#b60200" }}>{error}</span>}
      </div>
    </div>
  );
}
