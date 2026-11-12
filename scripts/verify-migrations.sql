-- Run on an isolated disposable Postgres database.
\set ON_ERROR_STOP on
create role anon;
create role authenticated;
create role service_role bypassrls;
create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable
as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth to authenticated,service_role;
\ir ../supabase/schema.sql
\ir ../supabase/seed.sql
begin;
\ir ../supabase/migrations/20261112000100_registry_foundation.sql
\ir ../supabase/migrations/20261112000200_registry_governance.sql
\ir ../supabase/migrations/20261112000300_registry_baseline.sql
\ir ../supabase/migrations/20261112000400_registry_operations.sql
commit;
do $$ begin
  if (select count(*) from public.agents where status='to_verify') <> 171 then
    raise exception 'Unexpected registry candidate count';
  end if;
end $$;
set role anon;
do $$ begin
  if (select count(*) from public.v_leaderboard) <> 10 or
     (select count(*) from public.agents where status='to_verify') <> 0 or
     jsonb_array_length(public.agentbench_snapshot()->'runs') <> 25 or
     has_column_privilege(current_user,'public.sources','raw','select') or
     has_function_privilege(current_user,'public.claim_benchmark_job(text[])','execute') then
    raise exception 'Public access or baseline regression';
  end if;
end $$;
reset role;
insert into public.benchmark_jobs(kind,dedup_key,payload) values('collect','fixture-check','{}');
set role service_role;
do $$ declare job public.benchmark_jobs; begin
  select * into strict job from public.claim_benchmark_job(array['collect']);
  if public.finish_benchmark_job(job.id,gen_random_uuid()) then
    raise exception 'Mismatched lease was accepted';
  end if;
  if not public.finish_benchmark_job(job.id,job.lease_token) then
    raise exception 'Valid lease failed';
  end if;
end $$;

reset role;
begin;
\ir ../supabase/migrations/20261112000500_publish_agent_benchmarks.sql
commit;
set role anon;
do $$ begin
  if (select count(*) from public.agents where status='active') <> 48 or
     (select count(*) from public.v_published_scores where benchmark_slug='terminal-bench') <> 74 then
    raise exception 'Published agent registry regression';
  end if;
end $$;
reset role;

begin;
\ir ../supabase/migrations/20261112000600_publish_osworld_agents.sql
commit;
set role anon;
do $$ begin
  if (select count(*) from public.agents where status='active') <> 57 or
     (select count(*) from public.v_published_scores where benchmark_slug='osworld-verified') <> 24 or
     (select count(distinct agent_slug) from public.v_published_scores) <> 30 then
    raise exception 'OSWorld public coverage regression';
  end if;
end $$;
reset role;
