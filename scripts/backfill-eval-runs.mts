/**
 * One-shot, idempotent backfill: close `eval_runs` left in `running` before the
 * worker learned to finalise them (state machine lands in PR #66).
 *
 * Decision (2026-11-05): historical runs are backfilled to `done`.
 * Cutoff 2026-09-18 isolates the historical batch; newer runs are owned by the
 * worker and must never be touched by this script.
 *
 *   PG_DSN=... pnpm tsx scripts/backfill-eval-runs.mts            # PREVIEW (default)
 *   PG_DSN=... pnpm tsx scripts/backfill-eval-runs.mts --apply     # WRITE
 *   ... --cutoff=2026-09-18T00:00:00Z
 *
 * PREVIEW performs SELECTs only. APPLY runs in one transaction and only updates
 * rows still in `running`, so re-running is a no-op. No DSN, token or Secret is
 * printed. `totals` is deliberately left untouched to avoid rewriting history.
 *
 * BACK UP FIRST (outside this script, in the target database):
 *   create table eval_runs_backfill_20261105 as select * from eval_runs;
 *   -- rollback if needed:
 *   -- update eval_runs r set status='running', finished_at=null
 *   --   from eval_runs_backfill_20261105 b
 *   --   where r.id=b.id and b.status='running' and b.started_at < '2026-09-18'::timestamptz;
 */
import { getSql } from "@ai-eval/db";

const argv = process.argv.slice(2);
const apply = argv.includes("--apply");
const cutoffArg = argv.find((a) => a.startsWith("--cutoff="));
const cutoff = cutoffArg ? cutoffArg.slice("--cutoff=".length) : "2026-09-18T00:00:00Z";

if (!Number.isFinite(Date.parse(cutoff))) {
  console.error(`invalid --cutoff: ${cutoff}`);
  process.exit(2);
}

let sql: ReturnType<typeof getSql>;
try {
  sql = getSql();
} catch {
  console.error(
    "PG_DSN (or SUPABASE_DB_URL) is not configured — refusing to guess a target database.",
  );
  process.exit(2);
}

type Target = {
  id: string;
  started_at: Date | string | null;
  finished_at: Date | string | null;
  judged: number;
};

try {
  const rows = (await sql`
    select r.id, r.started_at,
      coalesce(
        (select max(er.created_at) from eval_results er where er.run_id = r.id),
        r.started_at
      ) as finished_at,
      (select count(*)::int from eval_results er where er.run_id = r.id) as judged
    from eval_runs r
    where r.status = 'running'
      and r.finished_at is null
      and r.started_at < ${cutoff}::timestamptz
    order by r.started_at
  `) as Target[];

  console.log(`mode=${apply ? "APPLY" : "PREVIEW"} cutoff=${cutoff} matched=${rows.length}`);
  for (const r of rows) {
    console.log(
      `  ${r.id} started=${String(r.started_at)} judged=${r.judged} -> finished_at=${String(r.finished_at)}`,
    );
  }

  if (!apply) {
    console.log("PREVIEW only — no rows written. Re-run with --apply to commit.");
  } else {
    console.log("APPLY: verify the backup table exists before this transaction commits.");
    const updated = await sql.begin(async (tx) => {
      let n = 0;
      for (const r of rows) {
        const res = await tx`
          update eval_runs
             set status = 'done', finished_at = ${r.finished_at}
           where id = ${r.id} and status = 'running'`;
        n += res.count;
      }
      return n;
    });
    console.log(`updated=${updated} (idempotent: rows no longer 'running' are skipped)`);
  }
} catch (err) {
  console.error(`backfill failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
