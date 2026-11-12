-- New registry is additive. The ab_* demo tables remain available.
alter table public.agents add column price_tier text;
alter table public.sources add column published boolean not null default false;
alter table public.evaluation_runs
  add column dataset_version text,
  add column dataset_split text,
  add column constraints jsonb,
  add column retrieved_at timestamptz not null default now(),
  add column method_version text,
  add column submission_key text unique,
  add column published boolean not null default false,
  add constraint complete_run_publication check (
    not published or (source_id is not null and dataset_version is not null and dataset_split is not null
      and constraints is not null and method_version is not null and status = 'completed' and harness is not null)
  ),
  add constraint verified_not_self_reported check (verified is not true or run_type <> 'self_reported');
alter table public.benchmark_results
  add column sample_size integer check (sample_size > 0),
  add constraint score_bounds check (normalized_score between 0 and 100),
  add constraint ci_bounds check (
    (ci_low is null and ci_high is null) or
    (ci_low is not null and ci_high is not null and ci_low between 0 and 100 and ci_high between ci_low and 100)
  );
alter table public.task_results add column attempt integer not null default 1 check (attempt > 0),
  add column trace jsonb,
  add column public_trace boolean not null default false,
  add unique(run_id,task_id,attempt);
create index idx_registry_agent_vendor on public.agents(vendor_id);
create index idx_registry_score_source on public.evaluation_runs(source_id);
create index idx_registry_task_results_task on public.task_results(task_id);
create index idx_registry_peer_member on public.peer_group_members(agent_id);
create index idx_registry_run_cohort on public.evaluation_runs(benchmark_id,dataset_version,dataset_split,method_version)
  where published;
create index idx_registry_sources_hash on public.sources(content_hash);

create table public.agent_aliases (
  alias text primary key check (alias = lower(alias)),
  agent_id uuid not null references public.agents(id) on delete cascade
);
create index idx_registry_alias_agent on public.agent_aliases(agent_id);
create table public.benchmark_watchlist (
  user_id uuid not null references auth.users(id) on delete cascade,
  agent_id uuid not null references public.agents(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(user_id,agent_id)
);
create index idx_registry_watch_agent on public.benchmark_watchlist(agent_id);
create table public.benchmark_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  run_id uuid not null references public.evaluation_runs(id) on delete cascade,
  kind text not null check(kind in ('regression','overtaken')),
  message text not null,
  created_at timestamptz not null default now(),
  unique(user_id,run_id,kind)
);
create index idx_registry_alert_run on public.benchmark_alerts(run_id);
create table public.benchmark_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check(kind in ('agent','result','dispute')),
  details jsonb not null check(jsonb_typeof(details)='object' and octet_length(details::text)<=16000),
  status text not null default 'pending' check(status in ('pending','accepted','rejected')),
  reviewer_note text,
  created_at timestamptz not null default now()
);
create index idx_registry_submission_owner on public.benchmark_submissions(user_id,created_at desc);
create index idx_registry_submission_pending on public.benchmark_submissions(created_at) where status='pending';
create table public.benchmark_reviewers (
  user_id uuid primary key references auth.users(id) on delete cascade
);
create table public.benchmark_jobs (
  id uuid primary key default gen_random_uuid(),
  kind text not null check(kind in ('collect','discover','evaluate','alerts')),
  dedup_key text not null unique,
  payload jsonb not null check(jsonb_typeof(payload)='object'),
  status text not null default 'queued' check(status in ('queued','running','completed','failed')),
  available_at timestamptz not null default now(),
  lease_until timestamptz,
  lease_token uuid,
  attempts integer not null default 0,
  max_attempts integer not null default 3 check(max_attempts between 1 and 10),
  last_error text
);
create index idx_registry_jobs_available on public.benchmark_jobs(available_at,id) where status='queued';
create index idx_registry_jobs_leases on public.benchmark_jobs(lease_until,id) where status='running';

alter table public.agent_aliases enable row level security;
alter table public.benchmark_watchlist enable row level security;
alter table public.benchmark_alerts enable row level security;
alter table public.benchmark_submissions enable row level security;
alter table public.benchmark_reviewers enable row level security;
alter table public.benchmark_jobs enable row level security;
revoke all on public.agent_aliases,public.benchmark_watchlist,public.benchmark_alerts,
  public.benchmark_submissions,public.benchmark_reviewers,public.benchmark_jobs from public,anon,authenticated;
grant select,insert,delete on public.benchmark_watchlist to authenticated;
grant select on public.benchmark_alerts,public.benchmark_submissions,public.benchmark_reviewers to authenticated;
grant insert(kind,details) on public.benchmark_submissions to authenticated;
grant update(status,reviewer_note) on public.benchmark_submissions to authenticated;
create policy registry_watch_owner on public.benchmark_watchlist for all to authenticated
  using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy registry_alert_owner on public.benchmark_alerts for select to authenticated using ((select auth.uid())=user_id);
create policy registry_reviewer_self on public.benchmark_reviewers for select to authenticated using ((select auth.uid())=user_id);
create policy registry_submission_read on public.benchmark_submissions for select to authenticated
  using ((select auth.uid())=user_id or exists(select 1 from public.benchmark_reviewers));
create policy registry_submission_create on public.benchmark_submissions for insert to authenticated
  with check ((select auth.uid())=user_id and status='pending' and reviewer_note is null);
create policy registry_submission_review on public.benchmark_submissions for update to authenticated
  using (exists(select 1 from public.benchmark_reviewers)) with check (exists(select 1 from public.benchmark_reviewers));

grant select on public.agents,public.benchmarks,public.vendors,public.peer_groups,public.peer_group_members,public.agent_aliases to anon,authenticated;
grant select(id,agent_id,version_label,release_date,underlying_model,notes) on public.agent_versions to anon,authenticated;
grant select(id,source_type,url,fetched_at,published) on public.sources to anon,authenticated;
grant select(id,agent_version_id,benchmark_id,run_type,harness,n_trials,seed,total_cost_usd,started_at,finished_at,
  source_id,verified,status,created_at,dataset_version,dataset_split,constraints,retrieved_at,method_version,published)
  on public.evaluation_runs to anon,authenticated;
grant select on public.benchmark_results to anon,authenticated;
grant all on public.vendors,public.agents,public.agent_versions,public.benchmarks,public.benchmark_tasks,
  public.sources,public.evaluation_runs,public.benchmark_results,public.task_results,public.agent_dimension_scores,
  public.peer_groups,public.peer_group_members,public.agent_aliases,public.benchmark_watchlist,
  public.benchmark_alerts,public.benchmark_submissions,public.benchmark_reviewers,public.benchmark_jobs to service_role;
create policy registry_agents_public on public.agents for select to anon,authenticated using (status in ('active','deprecated','acquired','discontinued'));
create policy registry_benchmarks_public on public.benchmarks for select to anon,authenticated using (status='active');
create policy registry_vendors_public on public.vendors for select to anon,authenticated using (exists(select 1 from public.agents a where a.vendor_id=vendors.id));
create policy registry_versions_public on public.agent_versions for select to anon,authenticated using (
  version_label <> 'latest' and exists(select 1 from public.agents a where a.id=agent_id));
create policy registry_sources_public on public.sources for select to anon,authenticated using (published);
create policy registry_runs_public on public.evaluation_runs for select to anon,authenticated using (
  published and exists(select 1 from public.sources s where s.id=source_id and s.published)
  and exists(select 1 from public.agent_versions v where v.id=agent_version_id)
  and exists(select 1 from public.benchmarks b where b.id=benchmark_id));
create policy registry_scores_public on public.benchmark_results for select to anon,authenticated using (
  exists(select 1 from public.evaluation_runs r where r.id=run_id and r.published));
grant select(id,run_id,task_id,passed,steps,latency_ms,cost_usd,failure_category,attempt,trace,public_trace)
  on public.task_results to anon,authenticated;
grant select(id,benchmark_id,external_id) on public.benchmark_tasks to anon,authenticated;
create policy registry_public_task on public.benchmark_tasks for select to anon,authenticated
  using (exists(select 1 from public.benchmarks b where b.id=benchmark_id));
create policy registry_public_trace on public.task_results for select to anon,authenticated
  using (public_trace and exists(select 1 from public.evaluation_runs r where r.id=run_id and r.published));
create view public.v_run_evidence with (security_invoker=true) as
select t.run_id,b.external_id as task,t.attempt,t.passed,t.steps,t.latency_ms,t.cost_usd,t.failure_category,t.trace
from public.task_results t join public.benchmark_tasks b on b.id=t.task_id where t.public_trace;
grant select on public.v_run_evidence to anon,authenticated,service_role;
create policy registry_peer_groups_public on public.peer_groups for select to anon,authenticated using (true);
create policy registry_peer_members_public on public.peer_group_members for select to anon,authenticated using (
  exists(select 1 from public.agents a where a.id=agent_id));
create policy registry_aliases_public on public.agent_aliases for select to anon,authenticated using (
  exists(select 1 from public.agents a where a.id=agent_id));

create view public.v_published_scores with (security_invoker=true) as
select
  a.id as agent_id,a.slug as agent_slug,a.name as agent,a.category,a.form_factor,a.license_type,a.price_tier,
  av.version_label, b.slug as benchmark_slug,b.name as benchmark,br.metric,br.raw_value,br.normalized_score,
  br.ci_low,br.ci_high,br.sample_size,er.id as run_id,er.run_type,coalesce(er.verified,false) as verified,
  er.dataset_version,er.dataset_split,er.method_version,er.harness,er.n_trials,er.constraints,er.total_cost_usd,
  er.created_at,er.retrieved_at,s.url as source_url
from public.benchmark_results br
join public.evaluation_runs er on er.id=br.run_id
join public.agent_versions av on av.id=er.agent_version_id
join public.agents a on a.id=av.agent_id
join public.benchmarks b on b.id=er.benchmark_id
join public.sources s on s.id=er.source_id
where er.published and s.published and a.status='active' and b.status='active';
create view public.v_leaderboard with (security_invoker=true) as
select distinct on (agent_id,benchmark_slug,metric,dataset_version,dataset_split,method_version,harness,n_trials,constraints) *
from public.v_published_scores
order by agent_id,benchmark_slug,metric,dataset_version,dataset_split,method_version,harness,n_trials,constraints,
  verified desc,normalized_score desc nulls last,created_at desc,run_id;
create view public.v_peer_percentile with (security_invoker=true) as
select p.name as peer_group,l.agent_id,l.agent,l.category,l.benchmark_slug,l.benchmark,l.metric,
  l.dataset_version,l.dataset_split,l.method_version,l.harness,l.n_trials,l.constraints,l.normalized_score,l.run_id,
  round((percent_rank() over (partition by p.id,l.benchmark_slug,l.metric,l.dataset_version,l.dataset_split,
  l.method_version,l.harness,l.n_trials,l.constraints order by l.normalized_score)*100)::numeric,1) as peer_percentile,
  count(*) over (partition by p.id,l.benchmark_slug,l.metric,l.dataset_version,l.dataset_split,
  l.method_version,l.harness,l.n_trials,l.constraints) as cohort_size
from public.v_leaderboard l
join public.peer_group_members m on m.agent_id=l.agent_id
join public.peer_groups p on p.id=m.peer_group_id
where l.verified and l.normalized_score is not null;
create view public.v_benchmark_conflicts with (security_invoker=true) as
select er.agent_version_id,er.benchmark_id,br.metric,er.dataset_version,er.dataset_split,er.method_version,
  er.harness,er.n_trials,er.constraints,min(br.raw_value) as low,max(br.raw_value) as high,count(distinct er.source_id) as sources
from public.benchmark_results br join public.evaluation_runs er on er.id=br.run_id
where er.published
group by er.agent_version_id,er.benchmark_id,br.metric,er.dataset_version,er.dataset_split,er.method_version,er.harness,er.n_trials,er.constraints
having count(distinct er.source_id)>1 and min(br.raw_value)<>max(br.raw_value);
grant select on public.v_published_scores,public.v_leaderboard,public.v_peer_percentile,public.v_benchmark_conflicts to anon,authenticated,service_role;

create function public.claim_benchmark_job(job_kinds text[]) returns setof public.benchmark_jobs
language plpgsql security invoker set search_path='' as $$
begin
  update public.benchmark_jobs set status='failed',lease_token=null,lease_until=null,last_error='Lease expired after final attempt'
    where status='running' and lease_until<=now() and attempts>=max_attempts and kind=any(job_kinds);
  return query
  with candidate as (
    select id from public.benchmark_jobs
    where kind=any(job_kinds) and attempts<max_attempts
      and ((status='queued' and available_at<=now()) or (status='running' and lease_until<=now()))
    order by available_at,id for update skip locked limit 1
  )
  update public.benchmark_jobs j set status='running',attempts=j.attempts+1,
    lease_until=now()+interval '5 minutes',lease_token=gen_random_uuid()
  from candidate c where j.id=c.id returning j.*;
end; $$;
revoke all on function public.claim_benchmark_job(text[]) from public,anon,authenticated;
grant execute on function public.claim_benchmark_job(text[]) to service_role;

create function public.finish_benchmark_job(job_id uuid, token uuid, failure text default null) returns boolean
language sql security invoker set search_path='' as $$
  with done as (
    update public.benchmark_jobs set
      status=case when failure is null then 'completed' when attempts<max_attempts then 'queued' else 'failed' end,
      available_at=now()+interval '30 seconds'*attempts,lease_until=null,lease_token=null,last_error=left(failure,500)
    where id=job_id and status='running' and lease_token=token and lease_until>now() returning id
  ) select exists(select 1 from done);
$$;
revoke all on function public.finish_benchmark_job(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.finish_benchmark_job(uuid,uuid,text) to service_role;
