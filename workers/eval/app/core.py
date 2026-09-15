"""The drain loop — the whole point of the worker, in ~40 pure lines.

Semantics (tested in tests/test_drain.py):
- transport failure  -> do NOT archive; pgmq re-delivers after visibility
  timeout. A dead SUT delays evaluation, never loses it.
- judged (pass or fail) -> store result row, then archive.
- judge blow-up on one metric -> recorded as an errored score, still archived
  (poison metrics must not wedge the queue).
"""

from __future__ import annotations

from .protocols import DrainReport, Judge, ResultStore, SutClient, SutTransportError, TaskQueue


def drain(
    queue: TaskQueue,
    store: ResultStore,
    sut: SutClient,
    judge: Judge,
    limit: int = 10,
    visibility_s: int = 120,
) -> DrainReport:
    report = DrainReport()
    for task in queue.read(batch=limit, visibility_s=visibility_s):
        report.tasks_seen += 1
        try:
            output = sut.invoke(task)
        except SutTransportError:
            report.sut_retries += 1
            continue

        scores = []
        for metric in task.metrics:
            try:
                if not judge.supports(str(metric.get("type", ""))):
                    raise ValueError(f"no judge for metric type {metric.get('type')!r}")
                scores.append(judge.grade(metric, task, output))
            except Exception as err:  # noqa: BLE001 - see module docstring
                scores.append({"metric": metric.get("type"), "error": str(err)})
        store.save(task, output, scores)
        queue.archive(task.msg_id)
        report.processed += 1
        report.judged += len(scores)
        report.details.append({"item_id": task.item_id, "scores": scores})
    return report
