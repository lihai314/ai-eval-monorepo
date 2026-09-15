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
    assert res.json()["dsn_hint"] is None


def test_dsn_hint_masks_password():
    from app.main import _dsn_hint

    hint = _dsn_hint("postgresql://postgres.abc123:S3cr3t@aws-0-x.pooler.supabase.com:5432/postgres")
    assert "S3cr3t" not in hint
    assert hint.startswith("postgresql://postgres.abc123:***@aws-0-")


def test_drain_requires_bearer(app_with_token):
    client = TestClient(app_with_token)
    assert client.post("/drain", json={}).status_code == 401
    ok = client.post("/drain", json={"limit": 5}, headers={"Authorization": "Bearer sekret"})
    assert ok.status_code == 200
    assert ok.json()["tasks_seen"] == 0  # fresh memory queue
