create schema if not exists benchmark_internal;
revoke all on schema benchmark_internal from public,anon,authenticated;
grant usage on schema benchmark_internal to service_role;
create materialized view benchmark_internal.leaderboard_cache as select * from public.v_leaderboard with no data;
create unique index idx_registry_cached_score on benchmark_internal.leaderboard_cache(run_id,metric);
grant select on benchmark_internal.leaderboard_cache to service_role;

create table public.collected_result_candidates (
  source_id uuid primary key references public.sources(id) on delete cascade,
  benchmark_slug text not null references public.benchmarks(slug),
  split text not null,
  metric text not null,
  successes integer not null check(successes>=0),
  sample_size integer not null check(sample_size>0),
  raw_value numeric not null check(raw_value between 0 and 100),
  normalized_score numeric not null check(normalized_score between 0 and 100),
  ci_low numeric not null,
  ci_high numeric not null,
  check(successes<=sample_size and ci_low between 0 and 100 and ci_high between ci_low and 100)
);
alter table public.collected_result_candidates enable row level security;
revoke all on public.collected_result_candidates from public,anon,authenticated;
grant all on public.collected_result_candidates to service_role;

-- Issue one alert per watched agent run, only for comparable verified observations.
create function public.emit_benchmark_regressions() returns bigint
language sql security invoker set search_path='' as $$
  with candidates as (
    select current.*,lag(run_id) over cohort as previous_id,lag(ci_low) over cohort as previous_low
    from public.v_published_scores current
    where current.verified and current.metric='success_pct'
    window cohort as (partition by agent_id,benchmark_slug,metric,dataset_version,dataset_split,
      method_version,harness,n_trials,constraints order by created_at,run_id)
  ), inserted as (
    insert into public.benchmark_alerts(user_id,run_id,kind,message)
    select w.user_id,c.run_id,'regression',c.agent||' has a lower success interval on '||c.benchmark
    from candidates c join public.benchmark_watchlist w on w.agent_id=c.agent_id
    where c.previous_id is not null and c.ci_high<c.previous_low
    on conflict(user_id,run_id,kind) do nothing returning id
  ) select count(*) from inserted;
$$;
revoke all on function public.emit_benchmark_regressions() from public,anon,authenticated;
grant execute on function public.emit_benchmark_regressions() to service_role;
