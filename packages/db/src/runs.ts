import postgres from "postgres";
import { buildTaskMessage, type EvalTaskMessage, QUEUE_NAME } from "./task-message";

export type { EvalTaskMessage };
export { buildTaskMessage, QUEUE_NAME };

/** Session pooler DSN (port 5432) — PG_DSN on Vercel & Render,
 *  SUPABASE_DB_URL in CI; both names accepted. */
let sql: postgres.Sql | undefined;
export function getSql() {
  const dsn = process.env.PG_DSN ?? process.env.SUPABASE_DB_URL;
  if (!dsn) {
    throw new Error("PG_DSN (or SUPABASE_DB_URL) is not configured");
  }
  // max:2 — serverless functions are short-lived; idle_timeout reclaims.
  sql ??= postgres(dsn, { max: 2, idle_timeout: 20, connect_timeout: 10 });
  return sql;
}

export interface RunSummary {
  id: string;
  dataset: string;
  status: string;
  items: number;
  judged: number;
  passed: number;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface RunDetail extends RunSummary {
  results: Array<{
    itemId: string;
    title: string;
    verdict: string;
    scores: unknown;
    output: unknown;
  }>;
}

export async function listDatasets(): Promise<string[]> {
  const rows = await getSql()`select distinct name from datasets order by 1`;
  return rows.map((r) => String(r.name));
}

export async function listRuns(): Promise<RunSummary[]> {
  const rows = await getSql()`
    select r.id, d.name as dataset, r.status,
      coalesce((r.totals->>'items')::int, 0) as items,
      (select count(*) from eval_results er where er.run_id = r.id)::int as judged,
      (select count(*) from eval_results er where er.run_id = r.id and er.verdict = 'pass')::int as passed,
      r.started_at, r.finished_at
    from eval_runs r join datasets d on d.id = r.dataset_id
    order by r.started_at desc nulls last limit 20`;
  return rows.map(toSummary);
}

export async function getRun(id: string): Promise<RunSummary | null> {
  const rows = await getSql()`
    select r.id, d.name as dataset, r.status,
      coalesce((r.totals->>'items')::int, 0) as items,
      (select count(*) from eval_results er where er.run_id = r.id)::int as judged,
      (select count(*) from eval_results er where er.run_id = r.id and er.verdict = 'pass')::int as passed,
      r.started_at, r.finished_at
    from eval_runs r join datasets d on d.id = r.dataset_id where r.id = ${id}`;
  return rows[0] ? toSummary(rows[0]) : null;
}

export async function getRunDetail(id: string): Promise<RunDetail | null> {
  const summary = await getRun(id);
  if (!summary) return null;
  const results = await getSql()`
    select i.id as item_id, i.input->>'title' as title,
      er.verdict, er.scores, er.output
    from dataset_items i
    join eval_runs r on r.dataset_id = i.dataset_id and r.id = ${id}
    left join eval_results er on er.item_id = i.id and er.run_id = ${id}
    order by i.created_at`;
  return {
    ...summary,
    results: results.map((r) => ({
      itemId: String(r.item_id),
      title: String(r.title ?? "(untitled)"),
      verdict: r.verdict ? String(r.verdict) : "pending",
      scores: r.scores ?? null,
      output: r.output ?? null,
    })),
  };
}

/** Create a run row and fan the dataset out onto pgmq. Returns counts only —
 *  actual judging happens on Render at the next /drain (pull pattern). */
export async function createEvalRun(
  datasetName: string,
): Promise<{ runId: string; enqueued: number }> {
  const s = getSql();
  const [ds] = await s`
    select id from datasets where name = ${datasetName}
    order by version desc limit 1`;
  if (!ds) throw new Error(`dataset not found: ${datasetName}`);
  const [agent] = await s`
    select id from agents order by created_at desc limit 1`;
  if (!agent) throw new Error("no agents registered");
  // `queued` until the worker writes its first result; the worker flips it to
  // running/done (see workers/eval/app/adapters/pg.py). It used to be created
  // as `running` and then never updated, so every run looked stuck.
  const [run] = await s`
    insert into eval_runs (agent_id, dataset_id, status, started_at)
    values (${agent.id}, ${ds.id}, 'queued', now()) returning id`;
  if (!run) throw new Error("failed to create eval_run row");
  const items = await s`select id, input, expected from dataset_items where dataset_id = ${ds.id}`;
  const sutBaseUrl = sutBaseUrlFromEnv();
  const messages = items.map((it) =>
    buildTaskMessage({
      runId: String(run.id),
      itemId: String(it.id),
      input: it.input as Record<string, unknown>,
      expected: (it.expected as Record<string, unknown>) ?? null,
      sutBaseUrl,
    }),
  );
  if (messages.length > 0) {
    // One round-trip instead of N: a 500-item dataset used to cost 500
    // sequential sends inside a single serverless invocation. The payload is
    // sent as a JSON array and expanded server-side into jsonb[]; passing
    // objects individually through ::jsonb double-encoded them (see git
    // history) — keeping the array as one JSON document avoids that trap.
    const payload = JSON.stringify(messages);
    await s`SELECT pgmq.send_batch(${QUEUE_NAME}, ARRAY(SELECT jsonb_array_elements(${payload}::jsonb)), 0)`;
  }
  await s`update eval_runs set totals = ${{ items: items.length } as unknown as postgres.Parameter} where id = ${run.id}`;
  if (items.length === 0) {
    // No worker will ever pick this up, so close it here instead of leaving a
    // `queued` run that the UI polls forever.
    await s`update eval_runs set status = 'done', finished_at = now() where id = ${run.id}`;
  }
  return { runId: String(run.id), enqueued: messages.length };
}

/** The system under test: explicit env wins, else this deployment's own
 *  production domain (Vercel injects it), else local dev. */
function sutBaseUrlFromEnv(): string {
  if (process.env.SUT_BASE_URL) return process.env.SUT_BASE_URL;
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`;
  return "http://localhost:3000";
}

function toSummary(r: Record<string, unknown>): RunSummary {
  return {
    id: String(r.id),
    dataset: String(r.dataset),
    status: String(r.status),
    items: Number(r.items),
    judged: Number(r.judged),
    passed: Number(r.passed),
    startedAt: r.started_at ? String(r.started_at) : null,
    finishedAt: r.finished_at ? String(r.finished_at) : null,
  };
}
