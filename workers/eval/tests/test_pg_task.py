import json

from app.adapters.pg import _task_from_row

MSG = {
    "run_id": "r-1",
    "item_id": "i-1",
    "input": {"issueNumber": 1},
    "expected": None,
    "sut": {"base_url": "https://x", "path": "/api/triage"},
    "metrics": [{"type": "exact_match"}],
}


def test_task_from_row_accepts_dict():
    t = _task_from_row(1, dict(MSG))
    assert t.run_id == "r-1"


def test_task_from_row_recovers_double_encoded_str():
    # A producer may deliver the message as a jsonb *string scalar*; psycopg
    # hands it over as str. The worker must decode, not crash the drain.
    t = _task_from_row(2, json.dumps(MSG))
    assert t.item_id == "i-1"
    assert t.sut["base_url"] == "https://x"
