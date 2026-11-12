begin;

create table public.ab_models (
  id text primary key,
  name text not null,
  provider text not null,
  version text not null
);
create table public.ab_agents (
  id text primary key,
  name text not null,
  initials text not null,
  version text not null,
  harness text not null,
  model_id text not null references public.ab_models(id),
  color text not null check (color in ('violet','teal','blue','amber','rose'))
);
create index ab_agents_model_idx on public.ab_agents(model_id);
create table public.ab_suites (
  id text primary key,
  name text not null,
  version text not null,
  description text not null
);
create table public.ab_scenarios (
  suite_id text not null references public.ab_suites(id),
  id text not null,
  name text not null,
  "group" text not null,
  writes boolean not null,
  primary key(suite_id,id)
);
create table public.ab_runs (
  id text primary key,
  agent_id text not null references public.ab_agents(id),
  suite_id text not null references public.ab_suites(id),
  release integer not null check (release>=0),
  source text not null check (source in ('baseline','external')),
  run_date date not null,
  n integer not null check (n>0),
  success_pct numeric not null check (success_pct between 0 and 100),
  policy_pct numeric not null check (policy_pct between 0 and 100),
  cost_usd numeric check (cost_usd>=0),
  p95_ms integer not null check (p95_ms>=0),
  tool_calls numeric not null check (tool_calls>=0),
  unique (id,suite_id),
  unique (suite_id,source,release,agent_id)
);
create index ab_runs_agent_idx on public.ab_runs(agent_id);
create table public.ab_breakdowns (
  run_id text not null,
  suite_id text not null,
  scenario_id text not null,
  n integer not null check (n>0),
  success_pct numeric not null check (success_pct between 0 and 100),
  policy_pct numeric not null check (policy_pct between 0 and 100),
  cost_usd numeric check (cost_usd>=0),
  p95_ms integer not null check (p95_ms>=0),
  tool_calls numeric not null check (tool_calls>=0),
  primary key (run_id,scenario_id),
  foreign key (run_id,suite_id) references public.ab_runs(id,suite_id) on delete cascade,
  foreign key (suite_id,scenario_id) references public.ab_scenarios(suite_id,id)
);
create index ab_breakdowns_scenario_idx on public.ab_breakdowns(suite_id,scenario_id);

alter table public.ab_models enable row level security;
alter table public.ab_agents enable row level security;
alter table public.ab_suites enable row level security;
alter table public.ab_scenarios enable row level security;
alter table public.ab_runs enable row level security;
alter table public.ab_breakdowns enable row level security;
revoke all on public.ab_models,public.ab_agents,public.ab_suites,public.ab_scenarios,public.ab_runs,public.ab_breakdowns from public,anon,authenticated;
grant select on public.ab_models,public.ab_agents,public.ab_suites,public.ab_scenarios,public.ab_runs,public.ab_breakdowns to anon,authenticated;

create policy ab_public_models on public.ab_models for select to anon,authenticated using (exists (
  select 1 from public.ab_agents a where a.model_id=ab_models.id
));
create policy ab_public_agents on public.ab_agents for select to anon,authenticated using (exists (
  select 1 from public.ab_runs r where r.agent_id=ab_agents.id
));
create policy ab_public_suites on public.ab_suites for select to anon,authenticated using (id='support-ops-v1');
create policy ab_public_scenarios on public.ab_scenarios for select to anon,authenticated using (suite_id='support-ops-v1');
create policy ab_public_runs on public.ab_runs for select to anon,authenticated using (source='baseline' and suite_id='support-ops-v1');
create policy ab_public_breakdowns on public.ab_breakdowns for select to anon,authenticated using (exists (
  select 1 from public.ab_runs r where r.id=ab_breakdowns.run_id
));

create function public.agentbench_snapshot() returns jsonb
language sql stable security invoker set search_path=''
as $$
  select jsonb_build_object(
    'suite',(select to_jsonb(s) from public.ab_suites s where s.id='support-ops-v1'),
    'scenarios',(select coalesce(jsonb_agg(to_jsonb(s)-'suite_id' order by s.id),'[]'::jsonb) from public.ab_scenarios s where s.suite_id='support-ops-v1'),
    'models',(select coalesce(jsonb_agg(to_jsonb(m) order by m.id),'[]'::jsonb) from public.ab_models m),
    'agents',(select coalesce(jsonb_agg(to_jsonb(a) order by a.id),'[]'::jsonb) from public.ab_agents a),
    'runs',(select coalesce(jsonb_agg(to_jsonb(r) || jsonb_build_object('breakdown',(
      select coalesce(jsonb_agg(to_jsonb(b)-'run_id'-'suite_id' order by b.scenario_id),'[]'::jsonb)
      from public.ab_breakdowns b where b.run_id=r.id
    )) order by r.release,r.agent_id),'[]'::jsonb) from public.ab_runs r where r.suite_id='support-ops-v1' and r.source='baseline')
  );
$$;
revoke all on function public.agentbench_snapshot() from public,anon,authenticated;
grant execute on function public.agentbench_snapshot() to anon,authenticated;
commit;
