-- Verified deterministic demo evidence. Public benchmark candidates stay pending.
insert into public.vendors(name,homepage_url) values
('AgentBench Observatory','https://ai-agents-benchmark-platform.vercel.app/') on conflict(name) do nothing;
insert into public.agents(slug,name,vendor_id,category,license_type,form_factor,status,price_tier,description)
select 'support-'||a.id,a.name,v.id,'customer_support','open_source','web_app','active','free',
  'Scripted support agent. Harness: '||a.harness
from public.ab_agents a cross join public.vendors v where v.name='AgentBench Observatory'
on conflict(slug) do nothing;
insert into public.agent_versions(agent_id,version_label,underlying_model,scaffold_config,notes)
select a.id,ab.version||'/release-'||(r.release+1),'Scripted policy',
  jsonb_build_object('harness',ab.harness,'tools',jsonb_build_array('lookup','verify','policy','commit'),'release',r.release),
  'Deterministic simulator configuration'
from public.ab_runs r join public.ab_agents ab on ab.id=r.agent_id
join public.agents a on a.slug='support-'||ab.id
where r.source='baseline' on conflict(agent_id,version_label) do nothing;
insert into public.benchmarks(slug,name,domain,description,repo_url,primary_metric,task_count,contamination_risk,status)
values ('support-operations','Support Operations','enterprise','Public scripted tasks for account lookup, refunds and routing. Timing and cost are simulated.',
'https://github.com/ronakshah167/Ai-agents-benchmark-platform','success_pct',60,'high','active') on conflict(slug) do nothing;
insert into public.sources(source_type,url,content_hash,raw,published) values
('platform_run','https://github.com/ronakshah167/Ai-agents-benchmark-platform/blob/70dd777af0c64c3b50a5d7124ebdbae97153954c/dist/engine.mjs',
'git:70dd777af0c64c3b50a5d7124ebdbae97153954c', '{"suite":"support-ops-v1","simulated":true}',true)
on conflict(url,content_hash) do nothing;
insert into public.evaluation_runs(agent_version_id,benchmark_id,run_type,harness,environment,n_trials,seed,
  total_cost_usd,started_at,finished_at,source_id,verified,status,dataset_version,dataset_split,constraints,method_version,submission_key,published,created_at)
select av.id,b.id,'platform_run','support-simulator-1.0.0','{"simulated":true}',1,r.release,
  r.cost_usd*r.n,r.run_date::timestamptz,r.run_date::timestamptz,s.id,true,'completed','1.0.0','public-fixture',
  '{"tasks":60,"tool_timing":"simulated","tool_cost":"simulated","attempt":"first"}','support-v1','support-demo:'||r.id,true,r.run_date::timestamptz
from public.ab_runs r join public.ab_agents ab on ab.id=r.agent_id
join public.agents a on a.slug='support-'||ab.id
join public.agent_versions av on av.agent_id=a.id and av.version_label=ab.version||'/release-'||(r.release+1)
cross join public.benchmarks b cross join public.sources s
where r.source='baseline' and b.slug='support-operations' and s.content_hash='git:70dd777af0c64c3b50a5d7124ebdbae97153954c'
on conflict(submission_key) do nothing;
with observations as (
 select er.id,r.n,v.metric,v.value,round(v.value*r.n/100)/r.n as p
 from public.ab_runs r join public.evaluation_runs er on er.submission_key='support-demo:'||r.id
 cross join lateral (values ('success_pct',r.success_pct),('policy_pct',r.policy_pct)) as v(metric,value)
), wilson as (
 select *, (p+3.84145882069412/(2*n))/(1+3.84145882069412/n) as midpoint,
  1.95996398454005*sqrt((p*(1-p)+3.84145882069412/(4*n))/n)/(1+3.84145882069412/n) as radius
 from observations
)
insert into public.benchmark_results(run_id,metric,raw_value,normalized_score,ci_low,ci_high,sample_size)
select id,metric,value,value,round(greatest(0,100*(midpoint-radius)),2),round(least(100,100*(midpoint+radius)),2),n from wilson
on conflict(run_id,metric) do nothing;
insert into public.peer_group_members(peer_group_id,agent_id)
select p.id,a.id from public.peer_groups p cross join public.agents a
where a.slug like 'support-%' and p.name in ('Customer support agents','Open-source agents') on conflict do nothing;
