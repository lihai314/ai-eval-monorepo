import { getDatasetsSummary } from "@ai-eval/db";
import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/supabase/server";
import UserBar from "../../components/UserBar";
import NewDatasetForm from "./NewDatasetForm";

export const dynamic = "force-dynamic";

export default async function DatasetsPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  let datasets: Awaited<ReturnType<typeof getDatasetsSummary>> = [];
  let dbError: string | null = null;
  try {
    datasets = await getDatasetsSummary();
  } catch (err) {
    dbError = err instanceof Error ? err.message : String(err);
  }

  return (
    <main style={{ fontFamily: "ui-sans-serif, system-ui", maxWidth: 860, margin: "32px auto" }}>
      <p>
        <Link href="/">← console</Link>
      </p>
      <UserBar email={user} />
      <h1>Datasets</h1>
      <p>
        A dataset is a set of <em>inputs</em> plus <em>expected</em> ground truth. Runs fan these
        onto the worker; the grader compares the SUT&apos;s output against <code>expected</code>{" "}
        (subset match — assert only the fields you care about).
      </p>
      {dbError ? (
        <p style={{ color: "#b60200" }}>DB unavailable: {dbError}</p>
      ) : (
        <>
          <NewDatasetForm />
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr style={{ textAlign: "left" }}>
                <th>name</th>
                <th>version</th>
                <th>items</th>
                <th>source</th>
                <th>created</th>
              </tr>
            </thead>
            <tbody>
              {datasets.map((d) => (
                <tr key={d.id} style={{ borderTop: "1px solid #eee" }}>
                  <td>
                    <Link href={`/datasets/${d.id}`}>{d.name}</Link>
                  </td>
                  <td>v{d.version}</td>
                  <td>{d.items}</td>
                  <td>{d.source}</td>
                  <td>{new Date(d.createdAt).toLocaleString()}</td>
                </tr>
              ))}
              {datasets.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ color: "#777" }}>
                    no datasets yet — create one above
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
