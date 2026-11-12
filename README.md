# AgentBench Observatory

AgentBench compares **versioned agent harnesses and their underlying models** on the same tasks. The built-in Support Operations suite evaluates account lookup, refunds, and case routing across 60 simulated tasks.

- **Website** [AgentBench Observatory](https://ai-agents-benchmark-platform.vercel.app)
- **Design** [Figma](https://www.figma.com/design/9Pw7egO1MOKiIgqkJ5CktN)

## Run locally

Requires Node.js 22+ for the tools and Python 3 for the example web server. The dashboard has no package install or build step.

```bash
python3 -m http.server 8000 --directory dist
```

Open [http://localhost:8000](http://localhost:8000). Choose **Run benchmark** to score a baseline in the browser. Search and sort the leaderboard, filter by release and scenario, and select up to three agents for comparison. Trends and the improvement roadmap use the same task scope. **Run logs** exposes the decision, expected and observed final state, tool order, and policy violations per task, with a JSON evidence export. Comparison includes a paired breakdown of tasks passed by one agent, both, or neither. Theme and language are session-only until you opt into preference cookies.

## Evaluation protocol

| Metric | Calculation |
| --- | --- |
| Task success | Share of tasks whose answer and simulated final state match the expected outcome |
| Pass³ reliability | Share of identical tasks passed on all three attempts, when available |
| Policy adherence | Share of tasks without a prohibited write |
| p95 latency | Nearest-rank 95th percentile of the task latencies |
| Cost per task | Mean simulated tool fees for baselines, unavailable for imported model runs |
| Tools per task | Mean calls to supported simulator tools |
| Peer median | Median task success for the same scenario and release, with the selected agent excluded and at least three other agents present |

The five releases are deterministic scripted configurations used for the demo. The first attempt produces the headline metrics. Two additional fixed scheduling variants estimate repeat consistency for the baseline, with no claim of statistical independence. Baseline evidence is replayed from the versioned simulator, while headline rows come from the database. Baseline timing and cost use simulated per-tool values. Imported runs measure observed end-to-end wall time and form a separate cohort. Imported files are self-reported and session-local. The dashboard validates full suite coverage and recomputes aggregate metrics from the trials.

## Run a tool-calling model

Supply the full chat completions URL of a tool-capable OpenAI-compatible endpoint. The optional key is read from your shell environment. A compatible local endpoint can be used without a key. The model sees synthetic task data and can only call four in-memory tools. The runner aborts on provider errors so failed provider requests cannot silently bias a leaderboard.

```bash
BENCH_ENDPOINT=http://localhost:11434/v1/chat/completions \
BENCH_MODEL=your-tool-capable-model \
BENCH_AGENT="My agent" BENCH_VERSION=1.0 BENCH_STRATEGY=verify \
node scripts/run-model.mjs verify.json
```

Run again using `BENCH_STRATEGY=direct` and a different output filename. Select both files in **Import model runs** to compare the strategies using the same model. Set `BENCH_ATTEMPTS=3` to capture repeated attempts and enable Pass³. The default is one attempt. For an authenticated endpoint, set `BENCH_API_KEY` locally before running. `BENCH_PROVIDER` is optional display metadata. Never put provider credentials in frontend config.

## Supabase

The hosted dashboard reads the **bifrost hack** project. To point a separate deployment to another database:

1. In a project dedicated to the benchmark, run `supabase/schema.sql` once using the SQL Editor.
2. Run `supabase/seed.sql` to load the baseline dataset. Recreate it with `node scripts/seed.mjs > supabase/seed.sql` after changing the engine.
3. Add the project URL and **publishable key** to `dist/config.mjs`. Keep the Data API enabled. The client calls `agentbench_snapshot` and uses the built-in dataset if that request fails.
4. In the SQL Editor verify the public read and write boundary.

```sql
begin;
set local role anon;
select jsonb_array_length(public.agentbench_snapshot()->'runs') as runs,
       has_table_privilege(current_user,'public.ab_runs','insert') as can_write;
rollback;
```

Expected values are `25` and `false`. The browser reads only the seeded baseline cohort. External report imports stay in the browser. The schema enables row-level security on every table and uses an invoker RPC with explicit grants.

## Repository scouting

| Repository | Pattern used here |
| --- | --- |
| [SWE-bench](https://github.com/SWE-bench/SWE-bench) | Score a verifiable result on a fixed set of tasks |
| [OSWorld](https://github.com/xlang-ai/OSWorld) | Evaluate the final environment state |
| [τ-bench](https://github.com/sierra-research/tau2-bench) | Check domain rules and tool-mediated outcomes, and report pass-all-attempts reliability |
| [Inspect AI](https://github.com/UKGovernmentBEIS/inspect_ai) | Keep scoring distinct from execution and inspect individual task traces |

This repository ships its own small suite and does not embed the upstream datasets or claim their scores.

## Registry and production stack

The Next.js and Tailwind dashboard reads the reviewed registry. The original support evaluation stays available at `/demo/index.html`. See [architecture and implementation status](ARCHITECTURE.md) for the data flow and remaining work.

```bash
npm ci
npm run dev
npm run check
npm run build
python -m pip install -r backend/requirements.txt
python -m unittest discover -s backend/tests
python -m playwright install chromium
python -m backend.fixture_run
```

To reproduce on a separate Supabase project, run the original demo schema and seed, followed by the numbered migrations in `supabase/migrations` in order. Apply each migration transactionally. Set the alternate project's URL and publishable key in `dist/config.mjs`. On a clean disposable Postgres database, run `psql -f scripts/verify-migrations.sql` to check migrations and permissions.

For FastAPI and worker processes, copy the variable names from `backend/platform.env.example` to your host's secret configuration. `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` are enough for database reads. Set `BENCH_READ_API_KEY` to enable the optional rate-limited REST API. The worker and registry verifier require a server-only `SUPABASE_SERVICE_ROLE_KEY`.

```bash
uvicorn backend.api:app
python -m backend.worker enqueue
python -m backend.worker work
python -m backend.verify_registry
```

Run `enqueue` once daily from your scheduler. Repeated calls in a daily slot deduplicate. Run `verify_registry` after curating entries in `backend/registry.json`. It promotes only mapped candidates whose homepage and canonical repository can be reached and whose repository is active. Give reviewers access by inserting their existing Supabase Auth user ID into `public.benchmark_reviewers` from an administrator connection.

To run the two local fixtures in a container, build the Dockerfile in `backend/fixture.Dockerfile` from the repository root. Use a reviewed and pinned image digest for repeatable deployments. Run with `--network none --read-only --tmpfs /tmp:rw,nosuid,nodev,size=256m --memory 1g --cpus 2 --pids-limit 160 --cap-drop ALL`. Apply an external wall-clock deadline. This fixture image does not execute arbitrary patches or browse external sites.

### Cost planning

The deterministic demo uses zero model API calls. A source collection job consumes HTTP requests, Postgres writes and worker uptime. Browser fixtures consume local or worker CPU and memory. For provider-based runs, estimate cost as `tasks × attempts × average per-task provider cost`, then add the sandbox and trace storage. For example, 60 tasks × 3 attempts × an assumed $0.02 per task is $3.60 in model fees. This is an estimate, not a provider quote.

### Roadmap

Integrate official benchmark environments and source-specific parsers, add curator-approved discovery and score publication, deploy isolated workers with telemetry, and expand the public analytics and alert delivery after acquiring comparable measurements.
