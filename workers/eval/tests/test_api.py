from __future__ import annotations

import pytest
from fastapi.testclient import TestClient


@pytest.fixture()
def app_with_token(monkeypatch):
    monkeypatch.setenv("WORKER_TOKEN", "sekret")
    monkeypatch.delenv("PG_DSN", raising=False)
    from app.main import create_app

    return create_app()


def test_healthz_is_public(app_with_token):
    client = TestClient(app_with_token)
    res = client.get("/healthz")
    assert res.status_code == 200
    assert res.json()["mode"] == "memory"


def test_drain_requires_bearer(app_with_token):
    client = TestClient(app_with_token)
    assert client.post("/drain", json={}).status_code == 401
    ok = client.post("/drain", json={"limit": 5}, headers={"Authorization": "Bearer sekret"})
    assert ok.status_code == 200
    assert ok.json()["tasks_seen"] == 0  # fresh memory queue
