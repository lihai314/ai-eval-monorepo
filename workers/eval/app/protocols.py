"""Interfaces of the evaluation execution plane.

Everything the worker talks to (queue, result store, system-under-test, judge)
is a protocol here, so drain() is pure and testable on fakes, and the
production wiring in main.py is the only place implementations are chosen.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Protocol


class SutTransportError(Exception):
    """SUT unreachable/failed transiently -> message stays in the queue
    (not archived) so pgmq's visibility timeout re-delivers it."""


@dataclass(slots=True)
class EvalTask:
    """One unit of work: grade SUT(output(input)) against expected, per metric."""

    msg_id: int
    run_id: str
    item_id: str
    input: dict[str, Any]
    expected: dict[str, Any] | None
    sut: dict[str, Any]  # {"base_url","path","headers"?}
    metrics: list[dict[str, Any]]  # [{"type":"exact_match"} | {"type":"geval",...}]


class TaskQueue(Protocol):
    def read(self, batch: int, visibility_s: int) -> list[EvalTask]: ...
    def archive(self, msg_id: int) -> None: ...


class ResultStore(Protocol):
    def save(self, task: EvalTask, output: dict[str, Any], scores: list[dict[str, Any]]) -> None: ...


class SutClient(Protocol):
    def invoke(self, task: EvalTask) -> dict[str, Any]: ...


class Judge(Protocol):
    def supports(self, metric_type: str) -> bool: ...
    def grade(
        self, metric: dict[str, Any], task: EvalTask, output: dict[str, Any]
    ) -> dict[str, Any]: ...


@dataclass(slots=True)
class DrainReport:
    processed: int = 0
    judged: int = 0
    sut_retries: int = 0
    tasks_seen: int = 0
    details: list[dict[str, Any]] = field(default_factory=list)

    def as_dict(self) -> dict[str, Any]:
        return {
            "processed": self.processed,
            "judged": self.judged,
            "sut_retries": self.sut_retries,
            "tasks_seen": self.tasks_seen,
        }
