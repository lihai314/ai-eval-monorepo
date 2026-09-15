"""In-memory implementations — the fakes the test suite runs on, also usable
as a zero-infrastructure local demo (main.py falls back to these when PG_DSN
is absent)."""

from __future__ import annotations

import json
from collections import deque
from typing import Any

from ..protocols import EvalTask, Judge, ResultStore, SutClient, TaskQueue


class MemoryQueue:
    def __init__(self, tasks: list[EvalTask] | None = None) -> None:
        self._tasks: deque[EvalTask] = deque(tasks or [])
        self._deferred: deque[EvalTask] = deque()
        self.archived: list[int] = []

    def push(self, task: EvalTask) -> None:
        self._tasks.append(task)

    def read(self, batch: int, visibility_s: int) -> list[EvalTask]:
        taken = [self._tasks.popleft() for _ in range(min(batch, len(self._tasks)))]
        self._deferred.extend(taken)  # re-deliver unless archived
        return taken

    def archive(self, msg_id: int) -> None:
        self.archived.append(msg_id)
        self._deferred = deque(t for t in self._deferred if t.msg_id != msg_id)

    def flush_deferred(self) -> None:
        """Simulate visibility timeout: retryable tasks re-enter the queue."""
        self._tasks.extend(self._deferred)
        self._deferred.clear()

    def __len__(self) -> int:
        return len(self._tasks) + len(self._deferred)


class MemoryStore:
    def __init__(self) -> None:
        self.rows: list[dict[str, Any]] = []

    def save(self, task: EvalTask, output: dict[str, Any], scores: list[dict[str, Any]]) -> None:
        self.rows.append(
            {
                "run_id": task.run_id,
                "item_id": task.item_id,
                "output": output,
                "scores": scores,
                "verdict": "pass" if all(s.get("passed") for s in scores) else "fail",
            }
        )


class StubSut:
    """Echoes configured canned outputs keyed by item_id."""

    def __init__(self, outputs: dict[str, dict[str, Any]] | None = None) -> None:
        self.outputs = outputs or {}

    def invoke(self, task: EvalTask) -> dict[str, Any]:
        return self.outputs.get(task.item_id, task.input)


class ExactMatchJudge:
    """Deterministic programmatic metric — works with NO LLM key, which is
    what lets the whole loop run on free tiers before a judge key exists."""

    def supports(self, metric_type: str) -> bool:
        return metric_type == "exact_match"

    def grade(
        self, metric: dict[str, Any], task: EvalTask, output: dict[str, Any]
    ) -> dict[str, Any]:
        expected = task.expected or {}
        passed = _norm(output) == _norm(expected)
        return {
            "metric": "exact_match",
            "score": 1.0 if passed else 0.0,
            "passed": passed,
            "reason": None if passed else f"got {_norm(output)} want {_norm(expected)}",
        }


class CompositeJudge:
    def __init__(self, judges: list[Judge]) -> None:
        self.judges = judges

    def supports(self, metric_type: str) -> bool:
        return any(j.supports(metric_type) for j in self.judges)

    def grade(
        self, metric: dict[str, Any], task: EvalTask, output: dict[str, Any]
    ) -> dict[str, Any]:
        for j in self.judges:
            if j.supports(str(metric.get("type", ""))):
                return j.grade(metric, task, output)
        raise ValueError(f"no judge for metric {metric.get('type')!r}")


def _norm(obj: Any) -> str:
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), default=str)
