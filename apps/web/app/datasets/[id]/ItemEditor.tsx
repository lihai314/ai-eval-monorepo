"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Inline editor for an item's expected ground truth. Saving marks the item
 *  provenance=corrected — the P5 flywheel's raw material. */
export default function ItemEditor({
  datasetId,
  itemId,
  expected,
}: {
  datasetId: string;
  itemId: string;
  expected: Record<string, unknown> | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(expected ? JSON.stringify(expected, null, 2) : "");
  const [error, setError] = useState<string | null>(null);

  async function save() {
    let parsed: unknown = null;
    try {
      parsed = value.trim() ? JSON.parse(value) : null;
    } catch {
      setError("invalid JSON");
      return;
    }
    const res = await fetch(`/api/datasets/${datasetId}/items/${itemId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ expected: parsed }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}) as { error?: string });
      setError(body.error ?? "failed");
      return;
    }
    setOpen(false);
    setError(null);
    router.refresh();
  }

  async function remove() {
    const res = await fetch(`/api/datasets/${datasetId}/items/${itemId}`, { method: "DELETE" });
    if (!res.ok) {
      setError("delete failed");
      return;
    }
    router.refresh();
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} style={{ fontSize: 12 }}>
        ✎ correct
      </button>
    );
  }
  return (
    <div>
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={5}
        style={{ width: "100%", fontFamily: "monospace", fontSize: 12, padding: 6 }}
      />
      <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
        <button type="button" onClick={save}>
          save
        </button>
        <button type="button" onClick={() => setOpen(false)}>
          cancel
        </button>
        <button type="button" onClick={remove} style={{ color: "#b60200" }}>
          delete
        </button>
      </div>
      {error && <p style={{ color: "#b60200", fontSize: 12 }}>{error}</p>}
    </div>
  );
}
