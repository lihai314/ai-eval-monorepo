import { listDatasets, listRuns } from "@ai-eval/db";
import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/supabase/server";
import UserBar from "../components/UserBar";
import NewRunForm from "./runs/NewRunForm";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await currentUser();
  if (!user) redirect("/login");
  let runs: Awaited<ReturnType<typeof listRuns>> = [];
  let datasets: string[] = [];
  let dbError: string | null = null;
  try {
    [runs, datasets] = await Promise.all([listRuns(), listDatasets()]);
  } catch (err) {
    dbError = err instanceof Error ? err.message : String(err);
  }

  return (
    <main style={{ fontFamily: "ui-sans-serif, system-ui", maxWidth: 860, margin: "32px auto" }}>
      <h1>issue-pilot · eval console</h1>
      <UserBar email={user} />
      <p>
        Agent evaluation platform: a run fans dataset items onto <code>pgmq.eval_tasks</code>; the
        Render worker drains on the 30-min heartbeat and scores against the production SUT.
      </p>

      {dbError ? (
        <p style={{ color: "#b60200" }}>
          DB unavailable: {dbError} — set <code>PG_DSN</code> on this deployment.
        </p>
      ) : (
        <>
          <NewRunForm datasets={datasets} />
          <h2>Recent runs</h2>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr style={{ textAlign: "left" }}>
                <th>run</th>
                <th>dataset</th>
                <th>progress</th>
                <th>passed</th>
                <th>started</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} style={{ borderTop: "1px solid #eee" }}>
                  <td>
                    <Link href={`/runs/${r.id}`}>{r.id.slice(0, 8)}…</Link>
                  </td>
                  <td>{r.dataset}</td>
                  <td>
                    {r.judged}/{r.items}
                  </td>
                  <td>{r.passed}</td>
                  <td>{r.startedAt ? new Date(r.startedAt).toLocaleString() : "—"}</td>
                </tr>
              ))}
              {runs.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ color: "#777" }}>
                    no runs yet — start one above
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </>
      )}
    </main>
  );
}
