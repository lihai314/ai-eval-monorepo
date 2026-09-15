from __future__ import annotations

from typing import Any

from app.adapters.inmemory import (
    CompositeJudge,
    ExactMatchJudge,
    MemoryQueue,
    MemoryStore,
    StubSut,
)
from app.core import drain
from app.protocols import EvalTask, SutTransportError


def task(msg_id: int, item_id: str, expected: dict[str, Any]) -> EvalTask:
    return EvalTask(
        msg_id=msg_id,
        run_id="run-1",
        item_id=item_id,
        input={"issueNumber": 1, "title": item_id, "body": ""},
        expected=expected,
        sut={"base_url": "http://sut.local", "path": "/api/triage"},
        metrics=[{"type": "exact_match"}],
    )


def test_drain_judges_and_archives():
    q = MemoryQueue(
        [
            task(1, "a", {"category": "bug"}),
            task(2, "b", {"category": "docs"}),
        ]
    )
    store = MemoryStore()
    sut = StubSut({"a": {"category": "bug"}, "b": {"category": "chore"}})
    judge = CompositeJudge([ExactMatchJudge()])

    report = drain(q, store, sut, judge)

    assert report.processed == 2
    assert report.judged == 2
    assert q.archived == [1, 2]
    verdicts = {r["item_id"]: r["verdict"] for r in store.rows}
    assert verdicts == {"a": "pass", "b": "fail"}  # judged fail still archives


class DeadSut:
    def invoke(self, task: EvalTask) -> dict:
        raise SutTransportError("sut down")


def test_transport_error_does_not_archive():
    q = MemoryQueue([task(1, "a", {"category": "bug"})])
    store = MemoryStore()
    judge = CompositeJudge([ExactMatchJudge()])

    report = drain(q, store, DeadSut(), judge)

    assert report.sut_retries == 1
    assert q.archived == []  # redeliver after visibility timeout
    assert store.rows == []
    # simulate visibility timeout expiry
    q.flush_deferred()
    assert len(q) == 1


class FlakyJudge:
    def supports(self, metric_type: str) -> bool:
        return True

    def grade(self, metric, task, output):  # noqa: ANN001
        raise RuntimeError("judge exploded")


def test_judge_blowup_is_recorded_and_archived():
    q = MemoryQueue([task(1, "a", {"category": "bug"})])
    store = MemoryStore()
    sut = StubSut({"a": {"category": "bug"}})

    report = drain(q, store, sut, FlakyJudge())

    assert report.processed == 1
    assert q.archived == [1]  # poison metric must not wedge the queue
    assert "error" in store.rows[0]["scores"][0]
