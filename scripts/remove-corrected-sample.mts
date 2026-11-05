/**
 * One-shot, guarded removal of an accidentally ingested `corrected` sample.
 *
 * Context: creating issue #67 with the `chore` label triggered the P5
 * Correction Feedback workflow, which POSTed that issue into triage-zh-v1.
 * This script removes ONLY that one row. It refuses to touch any other item.
 *
 *   PG_DSN=... pnpm tsx scripts/remove-corrected-sample.mts --id=<uuid>            # PREVIEW
 *   PG_DSN=... pnpm tsx scripts/remove-corrected-sample.mts --id=<uuid> --apply   # DELETE
 *
 * Guards (all must match): exact UUID, provenance='corrected', and a title
 * marker unique to the issue that was accidentally ingested. No DSN or secret
 * is printed. Re-running after a successful delete is a no-op.
 */
import { getSql } from "@ai-eval/db";

const argv = process.argv.slice(2);
const apply = argv.includes("--apply");
const idArg = argv.find((a) => a.startsWith("--id="));
const itemId = idArg ? idArg.slice("--id=".length) : "";
const TITLE_MARKER = "Eval Gate 区分 SKIPPED";
const LIKE = `%${TITLE_MARKER}%`;

if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(itemId)) {
  console.error("--id must be a full UUID");
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

try {
  const rows = await sql`
    select id, provenance, input->>'title' as title
    from dataset_items
    where id = ${itemId}::uuid
      and provenance = 'corrected'
      and input->>'title' like ${LIKE}`;

  console.log(`mode=${apply ? "APPLY" : "PREVIEW"} id=${itemId} matched=${rows.length}`);
  for (const r of rows)
    console.log(`  ${r.id} provenance=${r.provenance} title=${String(r.title)}`);

  if (!apply) {
    console.log("PREVIEW only — no rows deleted. Re-run with --apply to commit.");
  } else {
    const res = await sql`
      delete from dataset_items
      where id = ${itemId}::uuid
        and provenance = 'corrected'
        and input->>'title' like ${LIKE}`;
    console.log(`deleted=${res.count} (guarded by id + provenance + title marker)`);
  }
} catch (err) {
  console.error(`removal failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
