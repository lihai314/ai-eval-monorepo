-- 0001_eval_core.sql — eval-hub schema (see PLAN v2.1 §3)
-- Applied automatically by db-migrate.yml on merge to main (or supabase db push).
-- Function names verified live against project snxliarypkeuzvecjnfy:
-- pgmq installs into its OWN `pgmq` schema (pgmq.create/read/archive/send/list_queues).

create extension if not exists pgmq;

do $$ begin
  if not exists (select 1 from pgmq.list_queues() where queue_name = 'eval_tasks') then
    perform pgmq.create('eval_tasks');
  end if;
end $$;

-- agents: a versioned definition of "how to call the SUT"
create table if not exists agents (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  version       text not null,
  prompt_hash   text,
  model_config  jsonb not null default '{}',
  created_at    timestamptz not null default now(),
  unique (name, version)
);

create table if not exists datasets (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  version    int  not null default 1,
  source     text not null default 'manual',  -- manual | production | corrected
  created_at timestamptz not null default now(),
  unique (name, version)
);

create table if not exists dataset_items (
  id          uuid primary key default gen_random_uuid(),
  dataset_id  uuid not null references datasets(id) on delete cascade,
  input       jsonb not null,   -- e.g. TriageRequest
  expected    jsonb,            -- ground truth; null = production sample, unjudged
  provenance  text not null default 'manual',  -- manual | production | corrected
  created_at  timestamptz not null default now(),
  unique (dataset_id, id)
);

create table if not exists eval_runs (
  id          uuid primary key default gen_random_uuid(),
  agent_id    uuid not null references agents(id),
  dataset_id  uuid not null references datasets(id),
  status      text not null default 'queued',   -- queued|running|done|failed
  totals      jsonb not null default '{}',
  started_at  timestamptz,
  finished_at timestamptz
);

-- scored by the worker; (run_id, item_id) upsert makes re-drains idempotent
create table if not exists eval_results (
  id        bigint generated always as identity primary key,
  run_id    uuid not null references eval_runs(id) on delete cascade,
  item_id   uuid not null references dataset_items(id),
  output    jsonb,
  scores    jsonb not null default '[]',
  verdict   text not null default 'fail',   -- pass | fail
  error     text,
  trace_id  text,                            -- OTel link (P6)
  created_at timestamptz not null default now(),
  unique (run_id, item_id)
);

-- RLS: dashboard/service-role usage for now; user-scoped policies land with Auth (P2)
alter table agents enable row level security;
alter table datasets enable row level security;
alter table dataset_items enable row level security;
alter table eval_runs enable row level security;
alter table eval_results enable row level security;
