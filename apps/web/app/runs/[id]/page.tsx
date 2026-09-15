import { getRunDetail } from "@ai-eval/db";
import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/supabase/server";
import UserBar from "../../../components/UserBar";
import RunPoller from "./RunPoller";

export const dynamic = "force-dynamic";

export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await currentUser();
  if (!user) redirect("/login");
  let run: Awaited<ReturnType<typeof getRunDetail>> = null;
  try {
    run = await getRunDetail(id);
  } catch {
    run = null;
  }
  if (!run) {
    return (
      <main style={{ fontFamily: "ui-sans-serif, system-ui", margin: 32 }}>
        <p>run not found (or DB unavailable).</p>
        <Link href="/">← console</Link>
      </main>
    );
  }

  return (
    <main style={{ fontFamily: "ui-sans-serif, system-ui", maxWidth: 900, margin: "32px auto" }}>
      <p>
        <Link href="/">← console</Link>
      </p>
      <UserBar email={user} />
      <h1>
        run {run.id.slice(0, 8)}… <small>({run.dataset})</small>
      </h1>
      <p>
        progress {run.judged}/{run.items} · passed {run.passed} · status {run.status}
      </p>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr style={{ textAlign: "left" }}>
            <th>item</th>
            <th>verdict</th>
            <th>scores</th>
          </tr>
        </thead>
        <tbody>
          {run.results.map((r) => (
            <tr key={r.itemId} style={{ borderTop: "1px solid #eee" }}>
              <td>{r.title}</td>
              <td>
                <span
                  style={{
                    color:
                      r.verdict === "pass" ? "#1a7f37" : r.verdict === "fail" ? "#b60200" : "#777",
                  }}
                >
                  {r.verdict}
                </span>
              </td>
              <td>
                <code style={{ fontSize: 12 }}>{JSON.stringify(r.scores ?? "")}</code>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <RunPoller id={run.id} done={run.judged >= run.items && run.items > 0} />
    </main>
  );
}
