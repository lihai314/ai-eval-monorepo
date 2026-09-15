-- supabase/seeds/seed.sql — local dev data, loaded by `supabase db reset`.
-- Intentionally tiny: just enough to make the demo loop run offline.

insert into agents (name, version, model_config)
values ('issue-pilot', 'v0-mock', '{"mode":"mock"}'::jsonb)
on conflict (name, version) do nothing;

insert into datasets (name, version, source)
values ('triage-smoke', 1, 'manual')
on conflict (name, version) do nothing;

insert into dataset_items (dataset_id, input, expected, provenance)
select
  d.id,
  '{"issueNumber": 7, "title": "README typo: recieve", "body": "spelling in docs section"}'::jsonb,
  '{"category": "docs", "severity": "low"}'::jsonb,
  'manual'
from datasets d
where d.name = 'triage-smoke' and d.version = 1
  and not exists (
    select 1 from dataset_items i where i.dataset_id = d.id and i.input->>'issueNumber' = '7'
  );

insert into eval_runs (agent_id, dataset_id, status, totals)
select
  (select id from agents where name = 'issue-pilot' and version = 'v0-mock'),
  (select id from datasets where name = 'triage-smoke' and version = 1),
  'done',
  '{"items": 1, "passed": 1, "score": 1.0}'::jsonb
where not exists (select 1 from eval_runs);
