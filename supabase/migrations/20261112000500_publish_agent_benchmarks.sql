-- Publish benchmark observations and source-backed registry entries.
-- Terminal-Bench revisions and publisher studies stay in separate cohorts.
-- Configuration dates provided by the board are release dates, not execution timestamps.

with verified(slug,repo_url) as (values
('agent-s','https://github.com/simular-ai/Agent-S'),
('agent-zero','https://github.com/agent0ai/agent-zero'),
('agno','https://github.com/agno-agi/agno'),
('aider','https://github.com/Aider-AI/aider'),
('autogen','https://github.com/microsoft/autogen'),
('browser-use','https://github.com/browser-use/browser-use'),
('claude-code','https://github.com/anthropics/claude-code'),
('cline','https://github.com/cline/cline'),
('continue','https://github.com/continuedev/continue'),
('crewai','https://github.com/crewAIInc/crewAI'),
('dify','https://github.com/langgenius/dify'),
('dspy','https://github.com/stanfordnlp/dspy'),
('gemini-cli','https://github.com/google-gemini/gemini-cli'),
('google-adk','https://github.com/google/adk-python'),
('goose','https://github.com/aaif-goose/goose'),
('gpt-researcher','https://github.com/assafelovic/gpt-researcher'),
('haystack-agents','https://github.com/deepset-ai/haystack'),
('kilo-code','https://github.com/Kilo-Org/kilocode'),
('langgraph','https://github.com/langchain-ai/langgraph'),
('letta','https://github.com/letta-ai/letta'),
('mastra','https://github.com/mastra-ai/mastra'),
('n8n','https://github.com/n8n-io/n8n'),
('openai-agents-sdk','https://github.com/openai/openai-agents-python'),
('openai-codex','https://github.com/openai/codex'),
('opencode','https://github.com/anomalyco/opencode'),
('openhands','https://github.com/OpenHands/OpenHands'),
('pydantic-ai','https://github.com/pydantic/pydantic-ai'),
('qwen-code','https://github.com/QwenLM/qwen-code'),
('skyvern','https://github.com/Skyvern-AI/skyvern'),
('smolagents','https://github.com/huggingface/smolagents'),
('stagehand','https://github.com/browserbase/stagehand'),
('storm','https://github.com/stanford-oval/storm'),
('swe-agent','https://github.com/SWE-agent/SWE-agent')
)
update public.agents a set status='active',repo_url=v.repo_url
from verified v where a.slug=v.slug and a.status='to_verify';

create temporary table registry_growth_agents(slug text,name text,vendor text,category text,license_type text,form_factor text,homepage_url text,repo_url text) on commit drop;
insert into registry_growth_agents values
('mini-swe-agent','mini-SWE-agent','SWE-agent','coding','open_source','cli','https://mini-swe-agent.com/','https://github.com/SWE-agent/mini-swe-agent'),
('terminus-2','Terminus 2','Terminal-Bench','coding',null,'cli','https://www.tbench.ai/news/terminal-bench-2-1',null),
('grok-build','Grok Build','xAI','coding',null,'cli','https://x.ai/build',null),
('muse-code','Muse Code','Meta','coding',null,null,'https://dev.meta.ai/docs/muse-code',null),
('nexau-ahe','NexAU-AHE','china-qijizhifeng','coding',null,null,null,null),
('lemonharness','LemonHarness','LR AILab of Lenovo CTO Org','coding',null,null,null,null),
('capy','Capy','Capy','coding',null,null,null,null),
('polaris','Polaris','PolarisOps','coding',null,null,null,null),
('tongagents','TongAgents','BIGAI','coding',null,null,null,null),
('wozcode','WOZCODE','WOZCODE','coding',null,null,null,null);
insert into public.vendors(name) select distinct vendor from registry_growth_agents on conflict(name) do nothing;
insert into public.agents(slug,name,vendor_id,category,license_type,form_factor,homepage_url,repo_url,status)
select a.slug,a.name,v.id,a.category,a.license_type,a.form_factor,a.homepage_url,a.repo_url,'active'
from registry_growth_agents a join public.vendors v on v.name=a.vendor
on conflict(slug) do update set status='active',homepage_url=coalesce(excluded.homepage_url,agents.homepage_url),repo_url=coalesce(excluded.repo_url,agents.repo_url)
where agents.status='to_verify';

update public.agents set name='Codex CLI',homepage_url='https://openai.com/codex/' where slug='openai-codex' and status='active';
update public.agents set homepage_url='https://claude.com/product/claude-code' where slug='claude-code' and status='active';
update public.benchmarks set status='active',description='Published command-line task evaluations. Choose the exact Terminal-Bench revision and evaluation study for comparisons.',paper_url='https://www.tbench.ai/'
where slug='terminal-bench';

create temporary table registry_growth_sources(source_key text primary key,url text,content_hash text) on commit drop;
insert into registry_growth_sources values
('terminal41','https://www.tbench.ai/','1f0704cb05048eb2e3019078bb7012928b7cd9645cb0b04edba8033c3096fb5f'),
('terminal21','https://www.tbench.ai/news/terminal-bench-2-1','bfe38e10dcb594d772cd526e7070c34b23331ba9949cc2ec67171fdc901ccdb2'),
('harbor20','https://hub.harborframework.com/datasets/terminal-bench/terminal-bench-2/latest?leaderboard=2-0&tab=leaderboard','7755322f51d8a4a5bc4e653040f073985636386407121490a7187b2488740dad');
insert into public.sources(source_type,url,content_hash,raw,published)
select 'leaderboard',url,content_hash,jsonb_build_object('snapshot',source_key,'type','published aggregate'),true
from registry_growth_sources on conflict(url,content_hash) do nothing;

create temporary table registry_growth_runs(run_key text primary key,agent_slug text,version_label text,model text,
dataset_version text,source_key text,score numeric,ci_low numeric,ci_high numeric,trials integer,cost numeric,configuration_date date,verified boolean) on commit drop;
insert into registry_growth_runs values
('terminal41:24f711aa-b0cc-4f09-8627-b5f70a27b73b','claude-code','Opus 5.5 · max · 4.1 · 24f711aa','Opus 5.5','4.1','terminal41',65.76,62.65,68.87,330,4718.65,'2026-09-22',true),
('terminal41:cf669033-4634-484b-ba50-b6b09963231e','claude-code','Sonnet 5.5 · max · 4.1 · cf669033','Sonnet 5.5','4.1','terminal41',63.94,60.94,66.94,330,7333.64,'2026-09-28',true),
('terminal41:bc484c38-72d1-4b66-b85f-f7353d0d374c','openai-codex','GPT-6.1 Sol · max · 4.1 · bc484c38','GPT-6.1 Sol','4.1','terminal41',60.91,57.94,63.88,330,634.24,'2026-09-29',true),
('terminal41:ccf54544-f2e7-4959-bea6-b006044bb06c','openai-codex','GPT-6 Astra · max · 4.1 · ccf54544','GPT-6 Astra','4.1','terminal41',60.3,57.48,63.12,330,3267.18,'2026-09-03',true),
('terminal41:13dc04dd-b37b-4644-b365-c529edb5477f','openai-codex','GPT-6 Astra · high · 4.1 · 13dc04dd','GPT-6 Astra','4.1','terminal41',60,57.21,62.79,330,2269.42,'2026-09-03',true),
('terminal41:c861c9b2-3a22-41c9-ac74-80dc0ae968cf','openai-codex','GPT-6 Astra · xhigh · 4.1 · c861c9b2','GPT-6 Astra','4.1','terminal41',59.7,57.01,62.39,330,2350.51,'2026-09-03',true),
('terminal41:e12583a8-3d9b-454d-8821-9415b5db0d59','claude-code','Fable 5.1 · xhigh · 4.1 · e12583a8','Fable 5.1','4.1','terminal41',57.58,54.27,60.89,330,4872.04,'2026-09-01',true),
('terminal41:7b059ed7-88dd-456a-9eda-50ee194458bd','claude-code','Fable 5.1 · max · 4.1 · 7b059ed7','Fable 5.1','4.1','terminal41',57.27,53.44,61.1,330,6243.5,'2026-09-01',true),
('terminal41:4ce600ad-74ed-4aad-ae55-efe92aea2019','openai-codex','GPT-6 Astra · medium · 4.1 · 4ce600ad','GPT-6 Astra','4.1','terminal41',55.15,52.49,57.81,330,1914.8,'2026-09-03',true),
('terminal41:e82ce7b8-afb2-4e72-8289-65d86a20c6e1','claude-code','Fable 5.1 · high · 4.1 · e82ce7b8','Fable 5.1','4.1','terminal41',54.85,51.44,58.26,330,3985.38,'2026-09-01',true),
('terminal41:96805882-7ab1-481e-83a5-ca5dc3ef100a','claude-code','Fable 5.1 · medium · 4.1 · 96805882','Fable 5.1','4.1','terminal41',53.94,50.55,57.33,330,2832.9,'2026-09-01',true),
('terminal41:1c041db9-d380-4147-99c3-a34c6f92debe','claude-code','Opus 5 · xhigh · 4.1 · 1c041db9','Opus 5','4.1','terminal41',53.33,50.24,56.42,330,6086.22,'2026-07-24',true),
('terminal41:78a3e222-165d-4659-8716-a40d13054782','claude-code','Opus 5 · max · 4.1 · 78a3e222','Opus 5','4.1','terminal41',52.12,48.73,55.51,330,5969.11,'2026-07-24',true),
('terminal41:0acedb0b-6705-4752-8145-c613628d02b1','openai-codex','GPT-6 Astra · low · 4.1 · 0acedb0b','GPT-6 Astra','4.1','terminal41',50.91,48.12,53.7,330,1557.3,'2026-09-03',true),
('terminal41:700e8017-1e3d-48f4-8af8-882c007a3a16','openai-codex','GPT-6 Sol · max · 4.1 · 700e8017','GPT-6 Sol','4.1','terminal41',50.3,47.07,53.53,330,1451.32,'2026-09-22',true),
('terminal41:23f2ffb6-81fc-4913-a418-87e414212aa1','claude-code','Opus 5 · high · 4.1 · 23f2ffb6','Opus 5','4.1','terminal41',49.7,46.01,53.39,330,4662.27,'2026-07-24',true),
('terminal41:b590a607-4e81-4ffb-9c0e-be047f08573c','claude-code','Opus 5 · medium · 4.1 · b590a607','Opus 5','4.1','terminal41',45.15,41.3,49.0,330,3191.59,'2026-07-24',true),
('terminal41:fdf6c2a1-4647-4354-9496-0edb32e24e29','claude-code','Fable 5 · max · 4.1 · fdf6c2a1','Fable 5','4.1','terminal41',44.85,41.02,48.68,330,7265.01,'2026-06-09',true),
('terminal41:2fc45531-6276-404f-8239-cf0d96473666','claude-code','Fable 5.1 · low · 4.1 · 2fc45531','Fable 5.1','4.1','terminal41',43.33,39.72,46.94,330,2358.72,'2026-09-01',true),
('terminal41:85e1c69d-5eb1-4db5-b47c-0460fc9b316a','claude-code','GLM-5.3 · max · 4.1 · 85e1c69d','GLM-5.3','4.1','terminal41',41.21,37.93,44.49,330,2727.63,'2026-08-14',true),
('terminal41:9abda9c8-a980-4850-99d8-3acec5001beb','grok-build','Grok 4.7 · xhigh · 4.1 · 9abda9c8','Grok 4.7','4.1','terminal41',38.79,35.2,42.38,330,3683.287146,'2026-09-21',true),
('terminal41:486aaf37-9109-4456-ad3a-eb22f31a7a4f','openai-codex','GPT-5.6 Sol · max · 4.1 · 486aaf37','GPT-5.6 Sol','4.1','terminal41',38.48,34.65,42.31,330,2541.7,'2026-06-26',true),
('terminal41:a03924be-99f2-4fc6-bda3-a4c449d12e36','claude-code','GLM-5.3-Flash · none · 4.1 · a03924be','GLM-5.3-Flash','4.1','terminal41',35.45,31.89,39.01,330,118.73752448,'2026-08-26',true),
('terminal41:d21c7f46-99de-4d65-97f0-66025597fd35','claude-code','Opus 5 · low · 4.1 · d21c7f46','Opus 5','4.1','terminal41',34.85,30.93,38.77,330,2393.88,'2026-07-24',true),
('terminal41:2d781330-2b24-445d-92c7-8519db736c6f','claude-code','Qwen3.8-Max-0902 · max · 4.1 · 2d781330','Qwen3.8-Max-0902','4.1','terminal41',26.97,23.1,30.84,330,4635.67,'2026-09-02',true),
('terminal41:931e0784-a0cf-48f9-9399-cac3c472fe42','claude-code','Opus 4.8 · max · 4.1 · 931e0784','Opus 4.8','4.1','terminal41',23.64,20.05,27.23,330,6481.26,'2026-05-28',true),
('terminal41:46bd5665-24ec-4b9b-917f-2b362174f4f7','openai-codex','GPT-5.6 Terra · max · 4.1 · 46bd5665','GPT-5.6 Terra','4.1','terminal41',21.52,18.27,24.77,330,1733.52,'2026-06-26',true),
('terminal41:d4bf5c29-4240-45da-bc34-0c402c230532','grok-build','Grok 4.6 · high · 4.1 · d4bf5c29','Grok 4.6','4.1','terminal41',19.7,16.61,22.79,330,3591.58,'2026-08-12',true),
('terminal41:619db320-c510-4efb-aa37-8bea87b5298d','mini-swe-agent','Gemini 3.8 Flash · high · 4.1 · 619db320','Gemini 3.8 Flash','4.1','terminal41',18.18,14.82,21.54,330,1828.77,'2026-09-02',true),
('terminal41:79fc5260-30ee-40db-b48d-2b6f7c8b3c33','openai-codex','GPT-5.6 Luna · max · 4.1 · 79fc5260','GPT-5.6 Luna','4.1','terminal41',17.58,14.67,20.49,330,346.67,'2026-06-26',true),
('terminal41:d717d657-6675-44a3-bda8-13e0bae434d2','openai-codex','GPT-6 Luna · max · 4.1 · d717d657','GPT-6 Luna','4.1','terminal41',15.15,12.49,17.81,330,72.14,'2026-09-22',true),
('terminal41:ac65d0af-9fd7-411a-8781-168f88c3e372','muse-code','Muse Spark 1.3 · xhigh · 4.1 · ac65d0af','Muse Spark 1.3','4.1','terminal41',14.85,11.85,17.85,330,0,'2026-09-02',true),
('terminal41:9826f231-f924-444b-92e5-b02a7cc43945','mini-swe-agent','Gemini 3.7 Flash · high · 4.1 · 9826f231','Gemini 3.7 Flash','4.1','terminal41',12.42,9.9,14.94,330,1261.87,'2026-08-13',true),
('terminal41:d6eec12d-3fee-4999-9a36-486529d40e33','grok-build','Grok 4.5 · high · 4.1 · d6eec12d','Grok 4.5','4.1','terminal41',12.42,9.8,15.04,330,2094.11,'2026-07-16',true),
('terminal41:b86efe05-1761-44fe-a744-6e8836b14b97','claude-code','Sonnet 5 · max · 4.1 · b86efe05','Sonnet 5','4.1','terminal41',12.12,9.12,15.12,330,9603.86,'2026-06-30',true),
('terminal21:2.0:openai-codex:GPT-5.3-Codex','openai-codex','GPT-5.3-Codex · 2.0 revision study','GPT-5.3-Codex','2.0','terminal21',73.3,null,null,null,null,null,true),
('terminal21:2.1:openai-codex:GPT-5.3-Codex','openai-codex','GPT-5.3-Codex · 2.1 revision study','GPT-5.3-Codex','2.1','terminal21',79.1,null,null,null,null,null,true),
('terminal21:2.0:openai-codex:GPT-5.4','openai-codex','GPT-5.4 · 2.0 revision study','GPT-5.4','2.0','terminal21',76.0,null,null,null,null,null,true),
('terminal21:2.1:openai-codex:GPT-5.4','openai-codex','GPT-5.4 · 2.1 revision study','GPT-5.4','2.1','terminal21',77.3,null,null,null,null,null,true),
('terminal21:2.0:terminus-2:Gemini 3.1 Pro','terminus-2','Gemini 3.1 Pro · 2.0 revision study','Gemini 3.1 Pro','2.0','terminal21',63.0,null,null,null,null,null,true),
('terminal21:2.1:terminus-2:Gemini 3.1 Pro','terminus-2','Gemini 3.1 Pro · 2.1 revision study','Gemini 3.1 Pro','2.1','terminal21',70.7,null,null,null,null,null,true),
('terminal21:2.0:claude-code:Opus 4.6','claude-code','Opus 4.6 · 2.0 revision study','Opus 4.6','2.0','terminal21',58.0,null,null,null,null,null,true),
('terminal21:2.1:claude-code:Opus 4.6','claude-code','Opus 4.6 · 2.1 revision study','Opus 4.6','2.1','terminal21',70.1,null,null,null,null,null,true),
('terminal21:2.0:terminus-2:GPT-5.3-Codex','terminus-2','GPT-5.3-Codex · 2.0 revision study','GPT-5.3-Codex','2.0','terminal21',64.7,null,null,null,null,null,true),
('terminal21:2.1:terminus-2:GPT-5.3-Codex','terminus-2','GPT-5.3-Codex · 2.1 revision study','GPT-5.3-Codex','2.1','terminal21',68.5,null,null,null,null,null,true),
('terminal21:2.0:gemini-cli:Gemini 3.1 Pro','gemini-cli','Gemini 3.1 Pro · 2.0 revision study','Gemini 3.1 Pro','2.0','terminal21',61.3,null,null,null,null,null,true),
('terminal21:2.1:gemini-cli:Gemini 3.1 Pro','gemini-cli','Gemini 3.1 Pro · 2.1 revision study','Gemini 3.1 Pro','2.1','terminal21',67.1,null,null,null,null,null,true),
('terminal21:2.0:openai-codex:GPT-5.4 mini','openai-codex','GPT-5.4 mini · 2.0 revision study','GPT-5.4 mini','2.0','terminal21',57.8,null,null,null,null,null,true),
('terminal21:2.1:openai-codex:GPT-5.4 mini','openai-codex','GPT-5.4 mini · 2.1 revision study','GPT-5.4 mini','2.1','terminal21',66.1,null,null,null,null,null,true),
('terminal21:2.0:terminus-2:Opus 4.6','terminus-2','Opus 4.6 · 2.0 revision study','Opus 4.6','2.0','terminal21',62.9,null,null,null,null,null,true),
('terminal21:2.1:terminus-2:Opus 4.6','terminus-2','Opus 4.6 · 2.1 revision study','Opus 4.6','2.1','terminal21',63.8,null,null,null,null,null,true),
('terminal21:2.0:claude-code:Sonnet 4.6','claude-code','Sonnet 4.6 · 2.0 revision study','Sonnet 4.6','2.0','terminal21',51.9,null,null,null,null,null,true),
('terminal21:2.1:claude-code:Sonnet 4.6','claude-code','Sonnet 4.6 · 2.1 revision study','Sonnet 4.6','2.1','terminal21',58.5,null,null,null,null,null,true),
('terminal21:2.0:gemini-cli:Gemini 3 Flash','gemini-cli','Gemini 3 Flash · 2.0 revision study','Gemini 3 Flash','2.0','terminal21',47.4,null,null,null,null,null,true),
('terminal21:2.1:gemini-cli:Gemini 3 Flash','gemini-cli','Gemini 3 Flash · 2.1 revision study','Gemini 3 Flash','2.1','terminal21',56.9,null,null,null,null,null,true),
('terminal21:2.0:terminus-2:GPT-5.4','terminus-2','GPT-5.4 · 2.0 revision study','GPT-5.4','2.0','terminal21',55.1,null,null,null,null,null,true),
('terminal21:2.1:terminus-2:GPT-5.4','terminus-2','GPT-5.4 · 2.1 revision study','GPT-5.4','2.1','terminal21',54.8,null,null,null,null,null,true),
('terminal21:2.0:terminus-2:Gemini 3 Flash','terminus-2','Gemini 3 Flash · 2.0 revision study','Gemini 3 Flash','2.0','terminal21',51.7,null,null,null,null,null,true),
('terminal21:2.1:terminus-2:Gemini 3 Flash','terminus-2','Gemini 3 Flash · 2.1 revision study','Gemini 3 Flash','2.1','terminal21',54.2,null,null,null,null,null,true),
('terminal21:2.0:terminus-2:Sonnet 4.6','terminus-2','Sonnet 4.6 · 2.0 revision study','Sonnet 4.6','2.0','terminal21',48.0,null,null,null,null,null,true),
('terminal21:2.1:terminus-2:Sonnet 4.6','terminus-2','Sonnet 4.6 · 2.1 revision study','Sonnet 4.6','2.1','terminal21',51.5,null,null,null,null,null,true),
('terminal21:2.0:terminus-2:GPT-5.4 mini','terminus-2','GPT-5.4 mini · 2.0 revision study','GPT-5.4 mini','2.0','terminal21',37.8,null,null,null,null,null,true),
('terminal21:2.1:terminus-2:GPT-5.4 mini','terminus-2','GPT-5.4 mini · 2.1 revision study','GPT-5.4 mini','2.1','terminal21',36.9,null,null,null,null,null,true),
('harbor20:nexau-ahe:GPT-5.5','nexau-ahe','GPT-5.5 · 2.0 leaderboard','GPT-5.5','2.0','harbor20',84.7,null,null,null,null,'2026-04-23',false),
('harbor20:lemonharness:Multiple','lemonharness','Multiple · 2.0 leaderboard','Multiple','2.0','harbor20',84.5,null,null,null,null,'2026-05-14',false),
('harbor20:capy:GPT-5.5','capy','GPT-5.5 · 2.0 leaderboard','GPT-5.5','2.0','harbor20',83.1,null,null,null,null,'2026-04-23',false),
('harbor20:openai-codex:GPT-5.5','openai-codex','GPT-5.5 · 2.0 leaderboard','GPT-5.5','2.0','harbor20',82.2,null,null,null,null,'2026-04-23',false),
('harbor20:polaris:Multiple','polaris','Multiple · 2.0 leaderboard','Multiple','2.0','harbor20',82.2,null,null,null,null,'2026-05-14',false),
('harbor20:tongagents:Gemini 3.1 Pro','tongagents','Gemini 3.1 Pro · 2.0 leaderboard','Gemini 3.1 Pro','2.0','harbor20',80.2,null,null,null,null,'2026-02-19',false),
('harbor20:wozcode:Claude Opus 4.7','wozcode','Claude Opus 4.7 · 2.0 leaderboard','Claude Opus 4.7','2.0','harbor20',80.2,null,null,null,null,'2026-04-16',false),
('harbor20:terminus-2:GPT-5.1','terminus-2','GPT-5.1 · 2.0 leaderboard','GPT-5.1','2.0','harbor20',47.6,null,null,null,null,'2025-11-12',false),
('harbor20:gemini-cli:Gemini 3 Flash','gemini-cli','Gemini 3 Flash · 2.0 leaderboard','Gemini 3 Flash','2.0','harbor20',47.4,null,null,null,null,'2025-12-17',false),
('harbor20:openhands:GPT-5','openhands','GPT-5 · 2.0 leaderboard','GPT-5','2.0','harbor20',43.8,null,null,null,null,'2025-08-07',false),
('harbor20:goose:Claude Sonnet 4.5','goose','Claude Sonnet 4.5 · 2.0 leaderboard','Claude Sonnet 4.5','2.0','harbor20',43.1,null,null,null,null,'2025-09-29',false);
insert into public.agent_versions(agent_id,version_label,underlying_model,release_date,notes)
select distinct a.id,r.version_label,r.model,r.configuration_date,'Published evaluation configuration'
from registry_growth_runs r join public.agents a on a.slug=r.agent_slug
on conflict(agent_id,version_label) do nothing;
insert into public.evaluation_runs(agent_version_id,benchmark_id,run_type,harness,n_trials,total_cost_usd,
source_id,verified,status,dataset_version,dataset_split,constraints,method_version,submission_key,published)
select av.id,b.id,'third_party',
case r.source_key when 'terminal41' then 'Terminal-Bench official leaderboard' when 'terminal21' then 'Terminal-Bench revision study' else 'Harbor published leaderboard' end,
r.trials,r.cost,s.id,r.verified,'completed',r.dataset_version,'official',
jsonb_strip_nulls(jsonb_build_object('publisher_protocol',r.source_key,'recorded_trials',r.trials,'trial_count_reported',r.trials is not null)),
'publisher-reported-v1',r.run_key,true
from registry_growth_runs r join public.agents a on a.slug=r.agent_slug and a.status='active'
join public.agent_versions av on av.agent_id=a.id and av.version_label=r.version_label
join registry_growth_sources rs on rs.source_key=r.source_key
join public.sources s on s.url=rs.url and s.content_hash=rs.content_hash
join public.benchmarks b on b.slug='terminal-bench'
on conflict(submission_key) do nothing;
insert into public.benchmark_results(run_id,metric,raw_value,normalized_score,ci_low,ci_high,sample_size)
select er.id,'success_pct',r.score,r.score,r.ci_low,r.ci_high,r.trials
from registry_growth_runs r join public.evaluation_runs er on er.submission_key=r.run_key
on conflict(run_id,metric) do nothing;

insert into public.peer_group_members(peer_group_id,agent_id)
select p.id,a.id from public.peer_groups p join public.agents a on
  (p.rule->>'category' is null or a.category=p.rule->>'category') and
  (p.rule->>'form_factor' is null or a.form_factor=p.rule->>'form_factor') and
  (p.rule->>'license_type' is null or a.license_type=p.rule->>'license_type')
where a.status='active' on conflict do nothing;
