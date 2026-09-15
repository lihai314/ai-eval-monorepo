"""FastAPI entrypoint for the eval worker, deployed on Render as a *free web
service* (pull pattern): GitHub Actions cron and the BFF's "Run eval" button
POST /drain. Free instances sleep after 15 min idle; the ~1 min cold start is
irrelevant for minute-scale eval jobs (see PLAN v2.1 red lines).

Wiring: PG_DSN present -> pgmq + eval_results; absent -> in-memory demo mode.
"""

from __future__ import annotations

import os
from typing import Any

from fastapi import Depends, FastAPI, Header, HTTPException

from .core import drain
from .protocols import Judge

from .adapters.http_sut import HttpSutClient
from .adapters.inmemory import (
    CompositeJudge,
    ExactMatchJudge,
    MemoryQueue,
    MemoryStore,
)

APP_VERSION = "0.1.0"


def _build_judge() -> Judge:
    judges: list[Judge] = [ExactMatchJudge()]
    if os.environ.get("DEEPEVAL_ENABLED") == "1":
        from .adapters.deepeval_judge import DeepEvalJudge  # noqa: PLC0415

        judges.append(DeepEvalJudge())
    return CompositeJudge(judges)


def create_app() -> FastAPI:
    app = FastAPI(title="issue-pilot eval worker", version=APP_VERSION)

    dsn = os.environ.get("PG_DSN", "")
    if dsn:
        from .adapters.pg import PgmqQueue, SupabaseResultStore  # noqa: PLC0415

        queue, store = PgmqQueue(dsn), SupabaseResultStore(dsn)
        mode = "pgmq"
    else:
        queue, store = MemoryQueue(), MemoryStore()
        mode = "memory"

    @app.get("/healthz")
    def healthz() -> dict[str, Any]:
        return {"status": "ok", "service": "eval-worker", "version": APP_VERSION, "mode": mode}

    def require_drain_token(authorization: str = Header(default="")) -> None:
        expected = os.environ.get("WORKER_TOKEN", "")
        if expected and authorization != f"Bearer {expected}":
            raise HTTPException(status_code=401, detail="missing or bad bearer token")

    @app.post("/drain", dependencies=[Depends(require_drain_token)])
    def drain_endpoint(body: dict[str, Any] | None = None) -> dict[str, Any]:
        body = body or {}
        report = drain(
            queue,  # type: ignore[arg-type]
            store,  # type: ignore[arg-type]
            HttpSutClient(),
            _build_judge(),
            limit=int(body.get("limit", 10)),
            visibility_s=int(body.get("visibility_s", 120)),
        )
        result: dict[str, Any] = report.as_dict()
        if mode == "memory":
            result["demo_rows"] = store.rows  # type: ignore[attr-defined]
        return result

    return app


app = create_app()
