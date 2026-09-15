"""HTTP adapter for systems under test: SUT = any endpoint accepting the
item's input JSON and returning JSON (our triage agent's /api/triage is
SUT #1). Any non-2xx or transport fault is treated as transient retry."""

from __future__ import annotations

import httpx

from ..protocols import EvalTask, SutTransportError


class HttpSutClient:
    def __init__(self, timeout_s: float = 45.0) -> None:
        self._timeout = timeout_s

    def invoke(self, task: EvalTask) -> dict:
        base = str(task.sut.get("base_url", "")).rstrip("/")
        path = str(task.sut.get("path", "/"))
        if not base:
            raise SutTransportError("task.sut.base_url missing")
        try:
            res = httpx.post(
                f"{base}{path}",
                json=task.input,
                headers=task.sut.get("headers") or {},
                timeout=self._timeout,
            )
            res.raise_for_status()
            return res.json()
        except Exception as err:  # noqa: BLE001 - all transport faults retry
            raise SutTransportError(f"SUT call failed: {err}") from err
