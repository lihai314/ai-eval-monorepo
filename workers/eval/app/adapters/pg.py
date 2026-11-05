"""Supabase-backed adapters: pgmq queue + eval_results table.

Connection is plain Postgres (psycopg3, transaction pooler port 6543 or direct
5432) — no supabase-py needed, and the same code runs against a local
`supabase start` stack.
"""

from __future__ import annotations

import json
from typing import Any

import psycopg  # psycopg3, [binary] extra
from psycopg.rows import dict_row

from ..protocols import EvalTask, SutTransportError, verdict_for  # noqa: F401  (re-export guard)


class PgmqQueue:
    def __init__(self, dsn: str, queue_name: str = "eval_tasks") -> None:
        self._dsn = dsn
        self._queue = queue_name

    def _conn(self) -> psycopg.Connection:
        return psycopg.connect(self._dsn, row_factory=dict_row, autocommit=True)

    def read(self, batch: int, visibility_s: int) -> list[EvalTask]:
        with self._conn() as conn, conn.cursor() as cur:
            cur.execute(
                "SELECT msg_id, message FROM pgmq.read(%s, %s, %s)",
                (self._queue, visibility_s, batch),
            )
            return [_task_from_row(r["msg_id"], r["message"]) for r in cur.fetchall()]

    def archive(self, msg_id: int) -> None:
        with self._conn() as conn, conn.cursor() as cur:
            cur.execute("SELECT pgmq.archive(%s, %s)", (self._queue, msg_id))

    def send(self, task: dict[str, Any], delay_s: int = 0) -> int:
        with self._conn() as conn, conn.cursor() as cur:
            # pgmq.send returns a scalar bigint, NOT a named msg_id column
            # (verified live; `SELECT msg_id FROM pgmq.send(...)` raises
            # UndefinedColumn).
            cur.execute(
                "SELECT pgmq.send(%s, %s::jsonb, %s)",
                (self._queue, _jsonb(task), delay_s),
            )
            row = cur.fetchone()
            assert row is not None
            return int(row[0])


class SupabaseResultStore:
    def __init__(self, dsn: str) -> None:
        self._dsn = dsn

    def save(self, task: EvalTask, output: dict[str, Any], scores: list[dict[str, Any]]) -> None:
        verdict = verdict_for(scores)
        with psycopg.connect(self._dsn, autocommit=True) as conn, conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO eval_results (run_id, item_id, output, scores, verdict)
                VALUES (%s, %s, %s::jsonb, %s::jsonb, %s)
                ON CONFLICT (run_id, item_id) DO UPDATE
                SET output = EXCLUDED.output, scores = EXCLUDED.scores,
                    verdict = EXCLUDED.verdict
                """,
                (task.run_id, task.item_id, _jsonb(output), _jsonb(scores), verdict),
            )
            # Close the run out: totals for the dashboard, `done` once every
            # item has a row. Without this the row stayed `running` forever and
            # finished_at was never written (nothing else updates eval_runs).
            cur.execute(_RUN_TOTALS, (task.run_id,) * 5)


_RUN_TOTALS = """
WITH target AS (SELECT dataset_id FROM eval_runs WHERE id = %s),
stats AS (
  SELECT
    (SELECT count(*)::int FROM dataset_items i WHERE i.dataset_id = target.dataset_id) AS items,
    (SELECT count(*)::int FROM eval_results WHERE run_id = %s) AS judged,
    (SELECT count(*)::int FROM eval_results WHERE run_id = %s AND verdict = 'pass') AS passed,
    (SELECT count(*)::int FROM eval_results WHERE run_id = %s AND verdict = 'skipped') AS skipped,
    (SELECT count(*)::int FROM eval_results WHERE run_id = %s AND verdict = 'fail') AS failed
  FROM target
)
UPDATE eval_runs r
   SET totals = jsonb_build_object(
         'items', stats.items, 'judged', stats.judged,
         'passed', stats.passed, 'skipped', stats.skipped, 'failed', stats.failed),
       status = CASE WHEN stats.judged >= stats.items THEN 'done' ELSE 'running' END,
       finished_at = CASE WHEN stats.judged >= stats.items
                          THEN coalesce(r.finished_at, now()) ELSE NULL END
  FROM stats
 WHERE r.id = %s
"""


def _task_from_row(msg_id: int, message: dict[str, Any] | str) -> EvalTask:
    # Defense in depth: a producer that double-encodes (e.g. JSON.stringify
    # into a ::jsonb cast) delivers a jsonb *string scalar*; psycopg hands it
    # over as str. Decode once and move on rather than crash the drain.
    if isinstance(message, str):
        message = json.loads(message)
    return EvalTask(
        msg_id=msg_id,
        run_id=str(message["run_id"]),
        item_id=str(message["item_id"]),
        input=message.get("input") or {},
        expected=message.get("expected"),
        sut=message.get("sut") or {},
        metrics=message.get("metrics") or [],
    )


def _jsonb(obj: Any) -> str:
    return json.dumps(obj, default=str)
