# AgentBench Observatory

AgentBench compares **versioned agent harnesses and their underlying models** on the same tasks. The built-in Support Operations suite evaluates account lookup, refunds, and case routing across 60 simulated tasks.

- **Website** [AgentBench Observatory](https://agentbench-observatory.swoonycondor.chatgpt.site)
- **Design** [Figma](https://www.figma.com/design/9Pw7egO1MOKiIgqkJ5CktN)

## Run locally

Requires Node.js 22+ for the tools and Python 3 for the example web server. The dashboard has no package install or build step.

```bash
python3 -m http.server 8000 --directory dist
```

Open [http://localhost:8000](http://localhost:8000). Choose **Run benchmark** to score a baseline in the browser. Search and sort the leaderboard, filter by release and scenario, and select up to three agents for comparison. Trends and the improvement roadmap use the same task scope. Theme and language are session-only until you opt into preference cookies.

## Evaluation protocol

| Metric | Calculation |
| --- | --- |
| Task success | Share of tasks whose answer and simulated final state match the expected outcome |
| Policy adherence | Share of tasks without a prohibited write |
| p95 latency | Nearest-rank 95th percentile of the task latencies |
| Cost per task | Mean simulated tool fees for baselines, unavailable for imported model runs |
| Tools per task | Mean calls to supported simulator tools |
| Peer median | Median task success for the same scenario and release, with the selected agent excluded and at least three other agents present |

The five releases are deterministic scripted configurations used for the demo. Baseline timing and cost use simulated per-tool values. Imported runs measure observed end-to-end wall time and form a separate cohort. Imported files are self-reported and session-local. The dashboard validates full suite coverage and recomputes aggregate metrics from the trials.

## Run a tool-calling model

Supply the full chat completions URL of a tool-capable OpenAI-compatible endpoint. The optional key is read from your shell environment. A compatible local endpoint can be used without a key. The model sees synthetic task data and can only call four in-memory tools. The runner aborts on provider errors so failed provider requests cannot silently bias a leaderboard.

```bash
BENCH_ENDPOINT=http://localhost:11434/v1/chat/completions \
BENCH_MODEL=your-tool-capable-model \
BENCH_AGENT="My agent" BENCH_VERSION=1.0 BENCH_STRATEGY=verify \
node scripts/run-model.mjs verify.json
```

Run again using `BENCH_STRATEGY=direct` and a different output filename. Select both files in **Import model runs** to compare the strategies using the same model. For an authenticated endpoint, set `BENCH_API_KEY` locally before running. `BENCH_PROVIDER` is optional display metadata. Never put provider credentials in frontend config.

## Supabase

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
| [τ-bench](https://github.com/sierra-research/tau2-bench) | Check domain rules and tool-mediated outcomes |
| [Inspect AI](https://github.com/UKGovernmentBEIS/inspect_ai) | Keep the task suite, agent harness, and scoring distinct |

This repository ships its own small suite and does not embed the upstream datasets or claim their scores.
