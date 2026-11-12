-- Selected named computer-use systems from the OSWorld-Verified official workbook.
-- Full and no-Google-Drive splits, step limits and tool modes remain distinct.
create temporary table osw_agents(slug text,name text,vendor text,homepage_url text) on commit drop;
insert into osw_agents values
('jedi-gui','Jedi GUI','Salesforce and University of Hong Kong','https://osworld-grounding.github.io/'),
('gta1','GTA1','Salesforce research collaboration','https://arxiv.org/abs/2507.05791'),
('coact-1','CoACT-1','Salesforce research collaboration','https://arxiv.org/abs/2508.03923'),
('aworld-gui','AWorld GUI Agent','inclusionAI','https://github.com/inclusionAI/AWorld/tree/main/examples/osworld'),
('openapa','OpenAPA','Laiye','https://github.com/laiye-ai/open-apa'),
('pointer-agent','Pointer Agent','Pointer','https://pointer.ai/blog/sota'),
('intelligence-indeed','Intelligence-Indeed Agent','Intelligence Indeed','https://github.com/intelligence-indeed/intelligence-indeed'),
('ui-tars-research','UI-TARS (research configurations)','ByteDance Seed','https://arxiv.org/abs/2509.02544'),
('openai-computer-use-preview','OpenAI computer-use preview (OSWorld harness)','OpenAI','https://openai.com/index/computer-using-agent/');
insert into public.vendors(name) select distinct vendor from osw_agents on conflict(name) do nothing;
insert into public.agents(slug,name,vendor_id,category,form_factor,homepage_url,status)
select a.slug,a.name,v.id,'computer_use_browser','desktop',a.homepage_url,'active' from osw_agents a join public.vendors v on v.name=a.vendor
on conflict(slug) do nothing;
update public.benchmarks set status='active',paper_url='https://os-world.github.io/',repo_url='https://github.com/xlang-ai/OSWorld',
description='Official OSWorld-Verified computer-use results. Task split, step budget and action modes must match for a head-to-head delta.'
where slug='osworld-verified';
insert into public.sources(source_type,url,content_hash,raw,published) values
('leaderboard','https://os-world.github.io/static/data/osworld_verified_results.xlsx','cf6b4b67eed566ddcd5a8b7ad2d89013157978dad0eea76ea12d2377471efc09','{"snapshot":"OSWorld-Verified official results workbook"}',true)
on conflict(url,content_hash) do nothing;
create temporary table osw_observations(row_id text,agent_slug text,version_label text,model_label text,max_steps integer,a11y boolean,coding boolean,score numeric,tasks integer,configuration_date date) on commit drop;
insert into osw_observations values
('2','openai-computer-use-preview','computer-use-preview · 15 steps · 361 tasks','computer-use-preview',15,false,false,26,361,'2025-07-28'),
('3','openai-computer-use-preview','computer-use-preview · 50 steps · 361 tasks','computer-use-preview',50,false,false,31.3,361,'2025-07-28'),
('65','agent-s','agent s2 w/ gemini-2.5-pro · 15 steps · 369 tasks','agent s2 w/ gemini-2.5-pro',15,false,false,34.64,369,'2025-07-31'),
('66','agent-s','agent s2 w/ gemini-2.5-pro · 50 steps · 369 tasks','agent s2 w/ gemini-2.5-pro',50,false,false,45.76,369,'2025-07-28'),
('67','agent-s','agent s2.5 w/ o3 · 15 steps · 369 tasks','agent s2.5 w/ o3',15,false,false,39,369,'2025-07-31'),
('68','agent-s','agent s2.5 w/ o3 · 50 steps · 369 tasks','agent s2.5 w/ o3',50,false,false,54.2,369,'2025-07-31'),
('69','agent-s','agent s2.5 w/ o3 · 100 steps · 369 tasks','agent s2.5 w/ o3',100,false,false,56,369,'2025-07-31'),
('72','jedi-gui','Jedi-7B w/ gpt-4o · 50 steps · 361 tasks','Jedi-7B w/ gpt-4o',50,false,false,27,361,'2025-07-28'),
('73','jedi-gui','Jedi-7B w/ gpt-4o · 100 steps · 361 tasks','Jedi-7B w/ gpt-4o',100,false,false,29.3,361,'2025-07-28'),
('74','jedi-gui','Jedi-7B w/ o3 · 15 steps · 361 tasks','Jedi-7B w/ o3',15,false,false,42.4,361,'2025-07-28'),
('76','jedi-gui','Jedi-7B w/ o3 · 100 steps · 361 tasks','Jedi-7B w/ o3',100,false,false,51,361,'2025-07-28'),
('77','gta1','GTA1 w/ o3 · 50 steps · 361 tasks','GTA1 w/ o3',50,false,true,48.59,361,'2025-07-28'),
('78','gta1','GTA1 w/ o3 · 100 steps · 361 tasks','GTA1 w/ o3',100,false,true,53.1,361,'2025-07-28'),
('100','gta1','GTA1 w/ GPT-5 · 100 steps · 361 tasks','GTA1 w/ GPT-5',100,false,true,63.41,361,'2025-10-03'),
('79','coact-1','CoACT-1 · 15 steps · 361 tasks','CoACT-1',15,false,true,39.81,361,'2025-08-04'),
('80','coact-1','CoACT-1 · 50 steps · 361 tasks','CoACT-1',50,false,true,56.39,361,'2025-08-04'),
('81','coact-1','CoACT-1 · 100 steps · 361 tasks','CoACT-1',100,false,true,59.93,361,'2025-08-04'),
('82','coact-1','CoACT-1 · 150 steps · 361 tasks','CoACT-1',150,false,true,60.76,361,'2025-08-04'),
('97','aworld-gui','aworldGUIAgent-v1 · 50 steps · 361 tasks','aworldGUIAgent-v1',50,false,true,58.04,361,'2025-09-18'),
('138','openapa','OpenAPA w/ gemini-3.1-pro · 100 steps · 361 tasks','OpenAPA w/ gemini-3.1-pro',100,false,true,78.34,361,'2026-04-17'),
('142','pointer-agent','Pointer Agent w/ Opus 4.7 · 100 steps · 361 tasks','Pointer Agent w/ Opus 4.7',100,false,true,83.64,361,'2026-05-21'),
('148','intelligence-indeed','Intelligence-Indeed Agent · 100 steps · 361 tasks','Intelligence-Indeed Agent',100,false,true,90.19,361,'2026-07-25'),
('94','ui-tars-research','UI-TARS-250705 · 100 steps · 361 tasks','UI-TARS-250705',100,false,false,41.84,361,'2025-09-16'),
('118','ui-tars-research','UI-TARS-2-2509 · 100 steps · 361 tasks','UI-TARS-2-2509',100,false,false,53.1,361,'2025-10-14');
insert into public.agent_versions(agent_id,version_label,underlying_model,release_date,notes)
select distinct a.id,o.version_label,o.model_label,o.configuration_date,'OSWorld-Verified workbook configuration' from osw_observations o join public.agents a on a.slug=o.agent_slug
on conflict(agent_id,version_label) do nothing;
insert into public.evaluation_runs(agent_version_id,benchmark_id,run_type,harness,n_trials,source_id,verified,status,
dataset_version,dataset_split,constraints,method_version,submission_key,published)
select av.id,b.id,'third_party','OSWorld-Verified official workbook',1,s.id,true,'completed','verified-v1',
case when o.tasks=369 then 'full-369' else 'no-google-drive-361' end,
jsonb_build_object('max_steps',o.max_steps,'additional_accessibility_tree',o.a11y,'additional_coding_actions',o.coding,'multiple_rollout',false),
'publisher-reported-v1','osworld-verified:'||o.row_id,true
from osw_observations o join public.agents a on a.slug=o.agent_slug
join public.agent_versions av on av.agent_id=a.id and av.version_label=o.version_label
join public.benchmarks b on b.slug='osworld-verified'
join public.sources s on s.content_hash='cf6b4b67eed566ddcd5a8b7ad2d89013157978dad0eea76ea12d2377471efc09'
on conflict(submission_key) do nothing;
insert into public.benchmark_results(run_id,metric,raw_value,normalized_score,sample_size)
select er.id,'success_pct',o.score,o.score,o.tasks from osw_observations o
join public.evaluation_runs er on er.submission_key='osworld-verified:'||o.row_id
on conflict(run_id,metric) do nothing;
insert into public.peer_group_members(peer_group_id,agent_id)
select p.id,a.id from public.peer_groups p join public.agents a on
  (p.rule->>'category' is null or a.category=p.rule->>'category') and
  (p.rule->>'form_factor' is null or a.form_factor=p.rule->>'form_factor') and
  (p.rule->>'license_type' is null or a.license_type=p.rule->>'license_type')
where a.status='active' and a.category='computer_use_browser' on conflict do nothing;
