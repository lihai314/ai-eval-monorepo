"""In-memory implementations — the fakes the test suite runs on, also usable
as a zero-infrastructure local demo (main.py falls back to these when PG_DSN
is absent)."""

from __future__ import annotations

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
    what lets the whole loop run on free tiers before a judge key exists.

    Subset semantics: `expected` may assert only some keys (e.g.
    {"result": {"category": "docs"}}) against a richer SUT response (which
    carries model/latencyMs/wrapper fields). Every key path in expected must
    match; extra keys in output are ignored."""

    def supports(self, metric_type: str) -> bool:
        return metric_type == "exact_match"

    def grade(
        self, metric: dict[str, Any], task: EvalTask, output: dict[str, Any]
    ) -> dict[str, Any]:
        expected = task.expected or {}
        if not expected:
            return {
                "metric": "exact_match",
                "score": 0.0,
                "passed": False,
                "reason": "empty expected — nothing to assert",
            }
        ok, missing = _subset(expected, output)
        return {
            "metric": "exact_match",
            "score": 1.0 if ok else 0.0,
            "passed": ok,
            "reason": None if ok else f"mismatch: {missing}",
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


def _subset(expected: Any, actual: Any, path: str = "") -> tuple[bool, list[str]]:
    """Recursive partial match; returns (ok, mismatched paths)."""
    if isinstance(expected, dict):
        if not isinstance(actual, dict):
            return False, [path or "<root>"]
        problems: list[str] = []
        for key, want in expected.items():
            sub = f"{path}.{key}" if path else str(key)
            if key not in actual:
                problems.append(f"{sub} (missing)")
                continue
            ok, deeper = _subset(want, actual[key], sub)
            if not ok:
                problems.extend(deeper)
        return not problems, problems
    if _canon(expected) != _canon(actual):
        return False, [f"{path}: got {_canon(actual)!r} want {_canon(expected)!r}"]
    return True, []


def _canon(obj: Any) -> Any:
    """Normalize scalars: numbers-as-strings compare equal, strings trimmed."""
    if isinstance(obj, bool):
        return obj
    if isinstance(obj, (int, float)):
        return float(obj)
    if isinstance(obj, str):
        s = obj.strip()
        try:
            return float(s)
        except ValueError:
            return s
    return obj
