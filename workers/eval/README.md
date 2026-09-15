# eval-worker (Python) — Render execution plane

Queue-triggered evaluation worker: reads `pgmq.eval_tasks`, calls the SUT over
HTTP, scores outputs, writes `eval_results`. See PLAN.md §0 for why this runs
as a **pull-pattern free web service** (GHA cron / BFF button `POST /drain`
it awake) instead of a paid always-on worker.

## Layout

```
app/protocols.py   TaskQueue / ResultStore / SutClient / Judge interfaces
app/core.py        drain() — the whole loop, pure, tested on fakes
app/adapters/      inmemory (demo+tests) · pg (pgmq+eval_results) · http_sut · deepeval_judge
app/main.py        FastAPI: /healthz, /drain (Bearer WORKER_TOKEN)
tests/             pytest on fakes — no LLM key, no DB, no queue needed
```

## Local

```bash
uv run --extra test pytest            # tests (memory adapters only)
DEEPEVAL_ENABLED=0 uv run --extra serve uvicorn app.main:app --port 8000
curl -X POST localhost:8000/drain -d '{"limit":10}' -H 'content-type: application/json'
```

## Deploy (Render, free web service)

- Root: `workers/eval` · Build: `pip install -e .[serve]` · Start: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- Env: the Blueprint declares `WORKER_TOKEN` as `key + sync: false`, so Render
  prompts for its value at creation — paste the bearer that equals the GHA
  secret `EVAL_WORKER_TOKEN`. Add `PG_DSN` (Supabase pooler) in the dashboard
  when the project exists; without it the worker runs in memory demo mode.
- Real LLM judging: `pip install -e '.[judge]'` + `DEEPEVAL_ENABLED=1` + `OPENAI_API_KEY`
- Trigger: `.github/workflows/drain-eval.yml` (schedule) and the BFF run button

## Semantics (tested)

| Event | Result |
| --- | --- |
| SUT transport failure | message NOT archived → pgmq re-delivers after visibility timeout |
| judged (pass or fail) | result row upserted, message archived |
| judge crash | error recorded in scores, archived anyway (no queue wedge) |
