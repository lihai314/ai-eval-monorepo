/**
 * Migration drift check: repo files vs remote schema_migrations ledger.
 * Exits 1 on any difference (either direction) — the watchdog turns that
 * into an issue. Usage: SUPABASE_DB_URL=... pnpm tsx scripts/migration-diff.mts
 */
import { readdirSync } from "node:fs";
import { diffMigrations, getSql, migrationVersionsFromFiles } from "@ai-eval/db";

const dir = new URL("../supabase/migrations/", import.meta.url).pathname;
const repoVersions = migrationVersionsFromFiles(readdirSync(dir));

const sql = getSql();
const rows = await sql.unsafe(
  "select version from supabase_migrations.schema_migrations order by version",
);
const remoteVersions = rows.map((r: { version: string }) => String(r.version));

const diff = diffMigrations(repoVersions, remoteVersions);
console.log(`repo:   ${repoVersions.join(", ") || "(none)"}`);
console.log(`remote: ${remoteVersions.join(", ") || "(none)"}`);
if (diff.clean) {
  console.log("migrations: CLEAN");
} else {
  console.error(
    `MIGRATION DRIFT — only in repo: [${diff.onlyInRepo.join(", ")}] ` +
      `only in remote: [${diff.onlyInRemote.join(", ")}]`,
  );
  process.exit(1);
}
