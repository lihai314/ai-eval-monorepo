import { getDatasetDetail } from "@ai-eval/db";
import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/supabase/server";
import UserBar from "../../../components/UserBar";
import AddItemForm from "./AddItemForm";
import ItemEditor from "./ItemEditor";

export const dynamic = "force-dynamic";

export default async function DatasetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await currentUser();
  if (!user) redirect("/login");
  let dataset: Awaited<ReturnType<typeof getDatasetDetail>> = null;
  try {
    dataset = await getDatasetDetail(id);
  } catch {
    dataset = null;
  }
  if (!dataset) {
    return (
      <main style={{ fontFamily: "ui-sans-serif, system-ui", margin: 32 }}>
        <p>dataset not found (or DB unavailable).</p>
        <Link href="/datasets">← datasets</Link>
      </main>
    );
  }

  return (
    <main style={{ fontFamily: "ui-sans-serif, system-ui", maxWidth: 960, margin: "32px auto" }}>
      <p>
        <Link href="/datasets">← datasets</Link> ·{" "}
        <Link href={`/?dataset=${dataset.name}`}>▶ run this dataset</Link>
      </p>
      <UserBar email={user} />
      <h1>
        {dataset.name} <small>v{dataset.version}</small>
      </h1>
      <p>
        {dataset.items.length} items · source {dataset.source} · grader asserts{" "}
        <code>expected</code> against the SUT output (subset match)
      </p>

      <AddItemForm datasetId={dataset.id} />

      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr style={{ textAlign: "left" }}>
            <th>input title</th>
            <th>expected</th>
            <th>provenance</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {dataset.items.map((item) => (
            <tr key={item.id} style={{ borderTop: "1px solid #eee", verticalAlign: "top" }}>
              <td style={{ padding: "8px 0" }}>
                {String(item.input.title ?? "(untitled)")}
                <br />
                <code style={{ fontSize: 11, color: "#777" }}>
                  {String(item.input.body ?? "").slice(0, 80)}
                </code>
              </td>
              <td>
                <code style={{ fontSize: 11 }}>
                  {item.expected ? JSON.stringify(item.expected) : "— null —"}
                </code>
              </td>
              <td>
                <span
                  style={{
                    color: item.provenance === "corrected" ? "#1a7f37" : "#777",
                    fontSize: 12,
                  }}
                >
                  {item.provenance}
                </span>
              </td>
              <td>
                <ItemEditor datasetId={dataset.id} itemId={item.id} expected={item.expected} />
              </td>
            </tr>
          ))}
          {dataset.items.length === 0 && (
            <tr>
              <td colSpan={4} style={{ color: "#777" }}>
                no items — add the first one above
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </main>
  );
}
