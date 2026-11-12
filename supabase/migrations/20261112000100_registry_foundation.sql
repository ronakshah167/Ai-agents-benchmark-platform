-- =====================================================================
-- AI AGENT BENCHMARKING PLATFORM : Supabase / Postgres schema + seed
-- Run in Supabase SQL Editor. Seed data is from model knowledge (cutoff
-- ~mid-2026): every seeded row has status='to_verify'. Let the collector
-- job confirm URLs, existence, and active status before publishing.
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------- CORE ENTITIES ----------
create table if not exists vendors (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  homepage_url text,
  country text,
  created_at timestamptz default now()
);

create table if not exists agents (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  vendor_id uuid references vendors(id),
  category text not null check (category in (
    'coding','computer_use_browser','research','general_purpose',
    'customer_support','enterprise_workflow','sales_marketing','security',
    'data_analytics','science','legal_finance_health','framework_platform')),
  license_type text check (license_type in ('proprietary','open_source','open_core')),
  form_factor text,              -- cli | ide | web_app | browser | saas | sdk | api | desktop
  underlying_models text[],      -- filled by collector
  homepage_url text,
  docs_url text,
  repo_url text,
  pricing_model text,
  first_release_date date,
  description text,
  status text default 'to_verify' check (status in ('to_verify','active','deprecated','acquired','discontinued')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_agents_category on agents(category);

-- An agent = model + scaffold + tools + config. Benchmark the VERSION, not the name.
create table if not exists agent_versions (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references agents(id) on delete cascade,
  version_label text not null,
  release_date date,
  underlying_model text,
  scaffold_config jsonb default '{}',   -- tools, MCP servers, max steps, memory, prompts hash
  notes text,
  unique(agent_id, version_label)
);

-- ---------- BENCHMARKS ----------
create table if not exists benchmarks (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  domain text not null,                 -- coding | computer_use | web | tool_use | research | enterprise | security | ml_engineering | general
  description text,
  paper_url text,
  repo_url text,
  primary_metric text,
  higher_is_better boolean default true,
  metric_min numeric default 0,         -- for normalization
  metric_max numeric default 100,
  task_count int,
  contamination_risk text check (contamination_risk in ('low','medium','high','unknown')) default 'unknown',
  status text default 'to_verify',
  created_at timestamptz default now()
);

create table if not exists benchmark_tasks (
  id uuid primary key default gen_random_uuid(),
  benchmark_id uuid not null references benchmarks(id) on delete cascade,
  external_id text not null,
  difficulty text,
  tags text[],
  unique(benchmark_id, external_id)
);

-- ---------- DATA COLLECTION ----------
create table if not exists sources (
  id uuid primary key default gen_random_uuid(),
  source_type text not null check (source_type in
    ('vendor_blog','paper','leaderboard','github','docs','pricing_page','news','community','platform_run')),
  url text not null,
  fetched_at timestamptz default now(),
  content_hash text,
  raw jsonb,
  unique(url, content_hash)
);

-- ---------- EVALUATION RUNS & RESULTS ----------
create table if not exists evaluation_runs (
  id uuid primary key default gen_random_uuid(),
  agent_version_id uuid not null references agent_versions(id),
  benchmark_id uuid not null references benchmarks(id),
  run_type text not null check (run_type in ('self_reported','third_party','platform_run')),
  harness text,                         -- e.g. official harness name/version
  environment jsonb default '{}',       -- docker image, hardware, tools allowed, step/time limits
  n_trials int default 1,
  seed int,
  total_cost_usd numeric,
  started_at timestamptz,
  finished_at timestamptz,
  source_id uuid references sources(id),
  verified boolean default false,       -- true only for platform_run or independently reproduced
  status text default 'completed',
  created_at timestamptz default now()
);
create index if not exists idx_runs_bench on evaluation_runs(benchmark_id);
create index if not exists idx_runs_agent on evaluation_runs(agent_version_id);

-- Aggregate scores, raw + standardized (0-100) + confidence interval
create table if not exists benchmark_results (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references evaluation_runs(id) on delete cascade,
  metric text not null,                 -- pass_rate | success_rate | pass^k | score ...
  raw_value numeric not null,
  normalized_score numeric,             -- 0-100 across benchmarks
  ci_low numeric,
  ci_high numeric,
  unique(run_id, metric)
);

-- Per-task detail (only for platform_run)
create table if not exists task_results (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references evaluation_runs(id) on delete cascade,
  task_id uuid not null references benchmark_tasks(id),
  passed boolean,
  score numeric,
  steps int,
  tokens_in bigint,
  tokens_out bigint,
  latency_ms bigint,
  cost_usd numeric,
  failure_category text,                -- wrong_answer | tool_error | timeout | loop | safety_violation | env_error
  trace_url text
);

-- Cross-cutting dimensions beyond accuracy (cost, latency, reliability, safety, autonomy)
create table if not exists agent_dimension_scores (
  id uuid primary key default gen_random_uuid(),
  agent_version_id uuid not null references agent_versions(id) on delete cascade,
  dimension text not null check (dimension in
    ('capability','reliability','cost_efficiency','latency','safety','autonomy','tool_use','robustness')),
  score numeric not null,               -- 0-100
  computed_at timestamptz default now(),
  method_version text,
  unique(agent_version_id, dimension, method_version)
);

-- ---------- PEER / COMPETITOR GROUPS ----------
create table if not exists peer_groups (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,            -- e.g. 'CLI coding agents', 'Browser agents'
  rule jsonb                            -- {"category":"coding","form_factor":"cli"}
);
create table if not exists peer_group_members (
  peer_group_id uuid references peer_groups(id) on delete cascade,
  agent_id uuid references agents(id) on delete cascade,
  primary key (peer_group_id, agent_id)
);

-- ---------- SECURITY (public read, writes via service role only) ----------
alter table vendors enable row level security;
alter table agents enable row level security;
alter table agent_versions enable row level security;
alter table benchmarks enable row level security;
alter table benchmark_tasks enable row level security;
alter table evaluation_runs enable row level security;
alter table benchmark_results enable row level security;
alter table task_results enable row level security;
alter table agent_dimension_scores enable row level security;
alter table peer_groups enable row level security;
alter table peer_group_members enable row level security;
alter table sources enable row level security;

-- Default-deny until the follow-up migration exposes curated data.
revoke all on public.vendors,public.agents,
  public.agent_versions,public.benchmarks,public.benchmark_tasks,public.evaluation_runs,
  public.benchmark_results,public.task_results,public.agent_dimension_scores,public.peer_groups,
  public.peer_group_members,public.sources from public,anon,authenticated;

-- =====================================================================
-- SEED: AGENTS
-- =====================================================================
create temp table seed_agents (
  slug text, name text, vendor text, category text, license_type text, form_factor text
) on commit drop;

insert into seed_agents values
-- ===== CODING =====
('claude-code','Claude Code','Anthropic','coding','proprietary','cli'),
('openai-codex','OpenAI Codex (cloud + CLI)','OpenAI','coding','open_core','cli'),
('github-copilot-agent','GitHub Copilot Coding Agent','GitHub / Microsoft','coding','proprietary','ide'),
('cursor-agent','Cursor Agent','Anysphere','coding','proprietary','ide'),
('devin','Devin','Cognition','coding','proprietary','web_app'),
('windsurf-cascade','Windsurf Cascade','Cognition (ex-Codeium)','coding','proprietary','ide'),
('replit-agent','Replit Agent','Replit','coding','proprietary','web_app'),
('lovable','Lovable','Lovable','coding','proprietary','web_app'),
('bolt-new','Bolt.new','StackBlitz','coding','open_core','web_app'),
('v0','v0','Vercel','coding','proprietary','web_app'),
('amazon-q-developer','Amazon Q Developer','Amazon','coding','proprietary','ide'),
('kiro','Kiro','Amazon','coding','proprietary','ide'),
('gemini-cli','Gemini CLI','Google','coding','open_source','cli'),
('jules','Jules','Google','coding','proprietary','web_app'),
('aider','Aider','Aider (Paul Gauthier)','coding','open_source','cli'),
('cline','Cline','Cline','coding','open_source','ide'),
('roo-code','Roo Code','Roo Code','coding','open_source','ide'),
('kilo-code','Kilo Code','Kilo Code','coding','open_source','ide'),
('openhands','OpenHands','All Hands AI','coding','open_source','web_app'),
('swe-agent','SWE-agent','Princeton / Stanford','coding','open_source','cli'),
('goose','Goose','Block','coding','open_source','cli'),
('factory-droids','Factory Droids','Factory','coding','proprietary','cli'),
('augment-agent','Augment Agent','Augment Code','coding','proprietary','ide'),
('amp','Amp','Sourcegraph','coding','proprietary','cli'),
('warp-agent','Warp Agents','Warp','coding','proprietary','cli'),
('junie','Junie','JetBrains','coding','proprietary','ide'),
('opencode','OpenCode','SST','coding','open_source','cli'),
('continue','Continue','Continue','coding','open_source','ide'),
('qwen-code','Qwen Code','Alibaba','coding','open_source','cli'),
('trae','Trae','ByteDance','coding','proprietary','ide'),
('zed-agent','Zed Agent','Zed Industries','coding','open_source','ide'),
('tabnine-agents','Tabnine Agents','Tabnine','coding','proprietary','ide'),
('qodo','Qodo (Gen / Merge)','Qodo','coding','open_core','ide'),
('coderabbit','CodeRabbit','CodeRabbit','coding','proprietary','saas'),
('sweep','Sweep','Sweep AI','coding','open_core','saas'),
('base44','Base44','Wix','coding','proprietary','web_app'),
('emergent','Emergent','Emergent Labs','coding','proprietary','web_app'),
('open-interpreter','Open Interpreter','Open Interpreter','coding','open_source','cli'),
('mentat','Mentat','AbanteAI','coding','open_source','cli'),
('codegen','Codegen','Codegen','coding','proprietary','saas'),
-- ===== COMPUTER USE / BROWSER =====
('chatgpt-agent','ChatGPT Agent (ex-Operator)','OpenAI','computer_use_browser','proprietary','web_app'),
('claude-computer-use','Claude Computer Use','Anthropic','computer_use_browser','proprietary','api'),
('claude-in-chrome','Claude in Chrome','Anthropic','computer_use_browser','proprietary','browser'),
('gemini-agent-mariner','Gemini Agent / Project Mariner','Google','computer_use_browser','proprietary','browser'),
('perplexity-comet','Perplexity Comet','Perplexity','computer_use_browser','proprietary','browser'),
('browser-use','Browser Use','Browser Use','computer_use_browser','open_source','sdk'),
('stagehand','Stagehand','Browserbase','computer_use_browser','open_source','sdk'),
('skyvern','Skyvern','Skyvern','computer_use_browser','open_core','sdk'),
('multion','MultiOn','MultiOn','computer_use_browser','proprietary','api'),
('amazon-nova-act','Amazon Nova Act','Amazon','computer_use_browser','proprietary','sdk'),
('runner-h','Runner H','H Company','computer_use_browser','proprietary','web_app'),
('ui-tars','UI-TARS','ByteDance','computer_use_browser','open_source','desktop'),
('agent-s','Agent S','Simular','computer_use_browser','open_source','desktop'),
('opera-neon','Opera Neon','Opera','computer_use_browser','proprietary','browser'),
('dia-browser','Dia','The Browser Company / Atlassian','computer_use_browser','proprietary','browser'),
('genspark-browser','Genspark AI Browser','Genspark','computer_use_browser','proprietary','browser'),
('hyperbrowser','HyperAgent','Hyperbrowser','computer_use_browser','open_source','sdk'),
('anchor-browser','Anchor Browser','Anchor','computer_use_browser','proprietary','api'),
('autoglm','AutoGLM','Zhipu AI','computer_use_browser','open_source','desktop'),
-- ===== RESEARCH =====
('openai-deep-research','OpenAI Deep Research','OpenAI','research','proprietary','web_app'),
('gemini-deep-research','Gemini Deep Research','Google','research','proprietary','web_app'),
('perplexity-deep-research','Perplexity Deep Research','Perplexity','research','proprietary','web_app'),
('claude-research','Claude Research','Anthropic','research','proprietary','web_app'),
('grok-deepsearch','Grok DeepSearch','xAI','research','proprietary','web_app'),
('kimi-researcher','Kimi Researcher','Moonshot AI','research','proprietary','web_app'),
('you-ari','You.com ARI','You.com','research','proprietary','web_app'),
('gpt-researcher','GPT Researcher','Assaf Elovic','research','open_source','sdk'),
('elicit','Elicit','Elicit','research','proprietary','web_app'),
('consensus','Consensus','Consensus','research','proprietary','web_app'),
('undermind','Undermind','Undermind','research','proprietary','web_app'),
('exa-websets','Exa Websets / Research','Exa','research','proprietary','api'),
('notebooklm','NotebookLM','Google','research','proprietary','web_app'),
('storm','STORM','Stanford','research','open_source','sdk'),
-- ===== GENERAL PURPOSE =====
('manus','Manus','Butterfly Effect (Manus AI)','general_purpose','proprietary','web_app'),
('genspark-super-agent','Genspark Super Agent','Genspark','general_purpose','proprietary','web_app'),
('autogpt','AutoGPT','Significant Gravitas','general_purpose','open_source','sdk'),
('babyagi','BabyAGI','Yohei Nakajima','general_purpose','open_source','sdk'),
('openmanus','OpenManus','MetaGPT community','general_purpose','open_source','sdk'),
('flowith','Flowith (Neo)','Flowith','general_purpose','proprietary','web_app'),
('minimax-agent','MiniMax Agent','MiniMax','general_purpose','proprietary','web_app'),
('kimi-ok-computer','Kimi OK Computer','Moonshot AI','general_purpose','proprietary','web_app'),
('lindy','Lindy','Lindy','general_purpose','proprietary','saas'),
('relevance-ai','Relevance AI','Relevance AI','general_purpose','proprietary','saas'),
('gumloop','Gumloop','Gumloop','general_purpose','proprietary','saas'),
('dust','Dust','Dust','general_purpose','proprietary','saas'),
('claude-cowork','Claude Cowork','Anthropic','general_purpose','proprietary','desktop'),
('agent-zero','Agent Zero','Agent Zero','general_purpose','open_source','sdk'),
('openclaw','OpenClaw','OpenClaw community','general_purpose','open_source','desktop'),
-- ===== CUSTOMER SUPPORT =====
('sierra','Sierra Agent OS','Sierra','customer_support','proprietary','saas'),
('decagon','Decagon','Decagon','customer_support','proprietary','saas'),
('intercom-fin','Fin','Intercom','customer_support','proprietary','saas'),
('zendesk-ai-agents','Zendesk AI Agents','Zendesk','customer_support','proprietary','saas'),
('agentforce','Salesforce Agentforce','Salesforce','customer_support','proprietary','saas'),
('ada','Ada','Ada','customer_support','proprietary','saas'),
('forethought','Forethought','Forethought','customer_support','proprietary','saas'),
('cresta','Cresta','Cresta','customer_support','proprietary','saas'),
('parloa','Parloa','Parloa','customer_support','proprietary','saas'),
('crescendo','Crescendo','Crescendo','customer_support','proprietary','saas'),
('kore-ai','Kore.ai','Kore.ai','customer_support','proprietary','saas'),
('yellow-ai','Yellow.ai','Yellow.ai','customer_support','proprietary','saas'),
('observe-ai','Observe.AI','Observe.AI','customer_support','proprietary','saas'),
('retell-ai','Retell AI (voice)','Retell AI','customer_support','proprietary','api'),
('vapi','Vapi (voice)','Vapi','customer_support','proprietary','api'),
-- ===== ENTERPRISE WORKFLOW =====
('copilot-studio','Microsoft Copilot Studio Agents','Microsoft','enterprise_workflow','proprietary','saas'),
('m365-copilot-agents','Microsoft 365 Copilot Agents','Microsoft','enterprise_workflow','proprietary','saas'),
('gemini-enterprise','Gemini Enterprise (Agentspace)','Google','enterprise_workflow','proprietary','saas'),
('servicenow-ai-agents','ServiceNow AI Agents','ServiceNow','enterprise_workflow','proprietary','saas'),
('workday-agents','Workday Agents','Workday','enterprise_workflow','proprietary','saas'),
('sap-joule','SAP Joule Agents','SAP','enterprise_workflow','proprietary','saas'),
('oracle-ai-agents','Oracle AI Agents','Oracle','enterprise_workflow','proprietary','saas'),
('uipath-agentic','UiPath Agentic Automation','UiPath','enterprise_workflow','proprietary','saas'),
('automation-anywhere','Automation Anywhere Agentic','Automation Anywhere','enterprise_workflow','proprietary','saas'),
('writer-ai-hq','Writer AI HQ','Writer','enterprise_workflow','proprietary','saas'),
('glean-agents','Glean Agents','Glean','enterprise_workflow','proprietary','saas'),
('moveworks','Moveworks','Moveworks / ServiceNow','enterprise_workflow','proprietary','saas'),
('beam-ai','Beam AI','Beam AI','enterprise_workflow','proprietary','saas'),
('aws-bedrock-agentcore','Amazon Bedrock AgentCore Agents','Amazon','enterprise_workflow','proprietary','api'),
('openai-agentkit','OpenAI AgentKit Agents','OpenAI','enterprise_workflow','proprietary','sdk'),
-- ===== SALES / MARKETING =====
('11x-alice','11x Alice','11x','sales_marketing','proprietary','saas'),
('artisan-ava','Artisan Ava','Artisan','sales_marketing','proprietary','saas'),
('clay-claygent','Clay Claygent','Clay','sales_marketing','proprietary','saas'),
('qualified-piper','Qualified Piper','Qualified','sales_marketing','proprietary','saas'),
('regie-ai','Regie.ai','Regie.ai','sales_marketing','proprietary','saas'),
('hubspot-breeze','HubSpot Breeze Agents','HubSpot','sales_marketing','proprietary','saas'),
-- ===== SECURITY =====
('xbow','XBOW','XBOW','security','proprietary','saas'),
('big-sleep','Big Sleep','Google DeepMind / Project Zero','security','proprietary','saas'),
('codemender','CodeMender','Google DeepMind','security','proprietary','saas'),
('aardvark','Aardvark','OpenAI','security','proprietary','saas'),
('dropzone-ai','Dropzone AI','Dropzone AI','security','proprietary','saas'),
('prophet-security','Prophet Security','Prophet Security','security','proprietary','saas'),
('torq-hyperautomation','Torq Socrates','Torq','security','proprietary','saas'),
('7ai','7AI','7AI','security','proprietary','saas'),
('pentestgpt','PentestGPT','Academic / OSS','security','open_source','cli'),
-- ===== DATA / ANALYTICS =====
('julius-ai','Julius AI','Julius','data_analytics','proprietary','web_app'),
('hex-magic','Hex Magic / Threads','Hex','data_analytics','proprietary','saas'),
('snowflake-cortex-agents','Snowflake Cortex Agents','Snowflake','data_analytics','proprietary','saas'),
('databricks-agent-bricks','Databricks Agent Bricks','Databricks','data_analytics','proprietary','saas'),
('databricks-genie','Databricks Genie','Databricks','data_analytics','proprietary','saas'),
('chatgpt-data-analysis','ChatGPT Data Analysis','OpenAI','data_analytics','proprietary','web_app'),
-- ===== SCIENCE =====
('google-ai-co-scientist','Google AI Co-Scientist','Google','science','proprietary','web_app'),
('futurehouse-platform','FutureHouse Agents (Crow/Falcon/Owl/Phoenix)','FutureHouse','science','proprietary','api'),
('sakana-ai-scientist','The AI Scientist','Sakana AI','science','open_source','sdk'),
('alphaevolve','AlphaEvolve','Google DeepMind','science','proprietary','api'),
('biomni','Biomni','Stanford','science','open_source','sdk'),
-- ===== LEGAL / FINANCE / HEALTH =====
('harvey','Harvey','Harvey','legal_finance_health','proprietary','saas'),
('legora','Legora','Legora','legal_finance_health','proprietary','saas'),
('hebbia','Hebbia Matrix','Hebbia','legal_finance_health','proprietary','saas'),
('rogo','Rogo','Rogo','legal_finance_health','proprietary','saas'),
('basis-ai','Basis (accounting)','Basis','legal_finance_health','proprietary','saas'),
('hippocratic-ai','Hippocratic AI Agents','Hippocratic AI','legal_finance_health','proprietary','saas'),
('abridge','Abridge','Abridge','legal_finance_health','proprietary','saas'),
-- ===== FRAMEWORKS / PLATFORMS (compare as scaffold families) =====
('langgraph','LangGraph','LangChain','framework_platform','open_source','sdk'),
('crewai','CrewAI','CrewAI','framework_platform','open_core','sdk'),
('autogen','AutoGen','Microsoft','framework_platform','open_source','sdk'),
('microsoft-agent-framework','Microsoft Agent Framework','Microsoft','framework_platform','open_source','sdk'),
('openai-agents-sdk','OpenAI Agents SDK','OpenAI','framework_platform','open_source','sdk'),
('claude-agent-sdk','Claude Agent SDK','Anthropic','framework_platform','open_source','sdk'),
('google-adk','Google Agent Development Kit','Google','framework_platform','open_source','sdk'),
('llamaindex-agents','LlamaIndex Agents','LlamaIndex','framework_platform','open_source','sdk'),
('semantic-kernel','Semantic Kernel','Microsoft','framework_platform','open_source','sdk'),
('smolagents','smolagents','Hugging Face','framework_platform','open_source','sdk'),
('pydantic-ai','Pydantic AI','Pydantic','framework_platform','open_source','sdk'),
('mastra','Mastra','Mastra','framework_platform','open_source','sdk'),
('agno','Agno','Agno','framework_platform','open_source','sdk'),
('dify','Dify','LangGenius','framework_platform','open_core','saas'),
('n8n','n8n AI Agents','n8n','framework_platform','open_core','saas'),
('letta','Letta','Letta','framework_platform','open_source','sdk'),
('metagpt','MetaGPT','DeepWisdom','framework_platform','open_source','sdk'),
('camel-ai','CAMEL','CAMEL-AI','framework_platform','open_source','sdk'),
('haystack-agents','Haystack Agents','deepset','framework_platform','open_source','sdk'),
('dspy','DSPy','Stanford','framework_platform','open_source','sdk');

insert into vendors(name)
select distinct vendor from seed_agents
on conflict (name) do nothing;

insert into agents(slug, name, vendor_id, category, license_type, form_factor, status)
select s.slug, s.name, v.id, s.category, s.license_type, s.form_factor, 'to_verify'
from seed_agents s join vendors v on v.name = s.vendor
on conflict (slug) do nothing;

-- default version row so results can attach immediately
insert into agent_versions(agent_id, version_label)
select id, 'latest' from agents
on conflict (agent_id, version_label) do nothing;

-- =====================================================================
-- SEED: BENCHMARKS (agent-level, not model-only)
-- metric_min/max used to normalize to 0-100
-- =====================================================================
insert into benchmarks(slug,name,domain,description,primary_metric,task_count,contamination_risk) values
('swe-bench-verified','SWE-bench Verified','coding','Resolve real GitHub issues in Python repos (human-validated subset)','% resolved',500,'high'),
('swe-bench-pro','SWE-bench Pro','coding','Harder, longer-horizon multi-language software issues','% resolved',null,'medium'),
('swe-bench-multimodal','SWE-bench Multimodal','coding','Issues with visual elements in JS repos','% resolved',null,'medium'),
('multi-swe-bench','Multi-SWE-bench','coding','Issue resolving across multiple languages','% resolved',null,'medium'),
('swe-lancer','SWE-Lancer','coding','Real freelance tasks with dollar payouts','$ earned',null,'medium'),
('terminal-bench','Terminal-Bench','coding','Hard terminal/CLI tasks in sandboxed environments','% resolved',null,'medium'),
('aider-polyglot','Aider Polyglot','coding','Multi-language code editing exercises','% pass',225,'high'),
('livecodebench','LiveCodeBench','coding','Continuously refreshed contest problems','% pass',null,'low'),
('osworld','OSWorld','computer_use','Open-ended tasks in real desktop OS environments','% success',369,'medium'),
('osworld-verified','OSWorld-Verified','computer_use','Cleaned/verified version of OSWorld','% success',null,'medium'),
('windowsagentarena','WindowsAgentArena','computer_use','Tasks on Windows OS','% success',154,'medium'),
('androidworld','AndroidWorld','computer_use','Mobile tasks on Android emulator','% success',116,'medium'),
('webarena','WebArena','web','Realistic self-hosted web environments','% success',812,'high'),
('visualwebarena','VisualWebArena','web','Visually grounded web tasks','% success',910,'medium'),
('webvoyager','WebVoyager','web','Live-website browsing tasks','% success',643,'high'),
('mind2web','Mind2Web / Online-Mind2Web','web','Generalist web agent tasks across many sites','% success',null,'medium'),
('browsecomp','BrowseComp','research','Hard-to-find information via browsing','% accuracy',1266,'low'),
('browsecomp-plus','BrowseComp-Plus','research','Fixed-corpus version for reproducible deep research','% accuracy',830,'low'),
('deepresearch-bench','DeepResearch Bench','research','Report-quality evaluation for deep research agents','score',100,'low'),
('gaia','GAIA','general','General assistant tasks needing tools and browsing','% accuracy',466,'high'),
('assistantbench','AssistantBench','web','Time-consuming realistic web tasks','% accuracy',214,'medium'),
('hle','Humanity''s Last Exam (with tools)','general','Expert-level questions; agent mode with tools','% accuracy',2500,'low'),
('gdpval','GDPval','enterprise','Real-world professional deliverables across occupations','% win/tie vs experts',null,'low'),
('tau-bench','tau-bench (τ-bench)','enterprise','Tool-agent-user dialogue in retail/airline policies','pass^k',null,'medium'),
('tau2-bench','τ²-bench','enterprise','Dual-control telecom/retail/airline agent-user tasks','pass^k',null,'medium'),
('theagentcompany','TheAgentCompany','enterprise','Simulated software-company workplace tasks','% completed',175,'medium'),
('workarena','WorkArena / WorkArena++','enterprise','ServiceNow enterprise workflow tasks','% success',null,'medium'),
('appworld','AppWorld','tool_use','Multi-app API tasks in a simulated world','% success',null,'medium'),
('bfcl','Berkeley Function Calling Leaderboard','tool_use','Function/tool call accuracy incl. multi-turn','% accuracy',null,'medium'),
('toolbench','ToolBench / StableToolBench','tool_use','Large-scale real API tool use','% pass',null,'high'),
('mcp-universe','MCP-Universe / MCPMark','tool_use','Agents using real MCP servers','% success',null,'low'),
('agentbench','AgentBench','general','Multi-environment LLM-as-agent benchmark','score',null,'high'),
('mle-bench','MLE-bench','ml_engineering','Kaggle-style ML engineering competitions','% medals',75,'medium'),
('paperbench','PaperBench','ml_engineering','Replicate ML research papers','% replication score',20,'low'),
('re-bench','RE-Bench','ml_engineering','Frontier ML research engineering tasks','score',7,'low'),
('core-bench','CORE-Bench','science','Computational reproducibility of papers','% accuracy',270,'low'),
('scienceagentbench','ScienceAgentBench','science','Data-driven scientific discovery tasks','% success',102,'medium'),
('cybench','Cybench','security','Professional CTF tasks','% solved',40,'low'),
('cve-bench','CVE-Bench','security','Exploit real web CVEs','% exploited',40,'low'),
('vending-bench','Vending-Bench','general','Long-horizon business simulation (running a vending business)','net worth $',null,'low'),
('metr-time-horizon','METR Time Horizon (HCAST/RE-Bench suite)','general','Task length (human time) agents complete at 50% reliability','minutes',null,'low'),
('st-webagentbench','ST-WebAgentBench','web','Safety and trustworthiness of web agents','completion under policy',null,'medium'),
('agentharm','AgentHarm','safety','Harmfulness of agents on malicious multi-step tasks','refusal rate',null,'medium'),
('agentdojo','AgentDojo','safety','Prompt-injection robustness of tool-using agents','utility under attack',null,'medium')
on conflict (slug) do nothing;

-- =====================================================================
-- SEED: PEER GROUPS
-- =====================================================================
insert into peer_groups(name, rule) values
('CLI coding agents','{"category":"coding","form_factor":"cli"}'),
('IDE coding agents','{"category":"coding","form_factor":"ide"}'),
('Autonomous cloud coding agents','{"category":"coding","form_factor":"web_app"}'),
('Browser / computer-use agents','{"category":"computer_use_browser"}'),
('Deep research agents','{"category":"research"}'),
('General-purpose autonomous agents','{"category":"general_purpose"}'),
('Customer support agents','{"category":"customer_support"}'),
('Enterprise workflow agents','{"category":"enterprise_workflow"}'),
('Security agents','{"category":"security"}'),
('Open-source agents','{"license_type":"open_source"}'),
('Agent frameworks','{"category":"framework_platform"}')
on conflict (name) do nothing;

insert into peer_group_members(peer_group_id, agent_id)
select pg.id, a.id from peer_groups pg join agents a on
  (pg.rule->>'category' is null or a.category = pg.rule->>'category')
  and (pg.rule->>'form_factor' is null or a.form_factor = pg.rule->>'form_factor')
  and (pg.rule->>'license_type' is null or a.license_type = pg.rule->>'license_type')
on conflict do nothing;

