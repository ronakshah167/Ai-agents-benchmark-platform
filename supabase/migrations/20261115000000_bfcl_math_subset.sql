-- BFCL v4 simple Python, selected arithmetic cases at gorilla 6ea57973.
-- Derived from the upstream prompts, required argument schemas, and accepted answers.
-- Apache-2.0, see NOTICE.bfcl and LICENSE.bfcl.
create function public.bifrost_run_bfcl_math()
returns jsonb
language plpgsql volatile security invoker set search_path = ''
as $function$
declare
  tasks constant jsonb := $data$
[{"id": "simple_python_0", "prompt": "Find the area of a triangle with a base of 10 units and height of 5 units.", "tool": "calculate_triangle_area", "required": ["base", "height"], "answer": [{"calculate_triangle_area": {"base": [10], "height": [5], "unit": ["units", ""]}}]}, {"id": "simple_python_1", "prompt": "Calculate the factorial of 5 using math functions.", "tool": "math.factorial", "required": ["number"], "answer": [{"math.factorial": {"number": [5]}}]}, {"id": "simple_python_2", "prompt": "Calculate the hypotenuse of a right triangle given the lengths of the other two sides as 4 and 5.", "tool": "math.hypot", "required": ["x", "y"], "answer": [{"math.hypot": {"x": [4], "y": [5], "z": ["", 0]}}]}, {"id": "simple_python_3", "prompt": "Find the roots of a quadratic equation with coefficients a=1, b=-3, c=2.", "tool": "algebra.quadratic_roots", "required": ["a", "b", "c"], "answer": [{"algebra.quadratic_roots": {"a": [1], "b": [-3], "c": [2]}}]}, {"id": "simple_python_4", "prompt": "Solve a quadratic equation where a=2, b=6, and c=5", "tool": "solve_quadratic_equation", "required": ["a", "b", "c"], "answer": [{"solve_quadratic_equation": {"a": [2], "b": [6], "c": [5]}}]}, {"id": "simple_python_5", "prompt": "Find all the roots of a quadratic equation given coefficients a = 3, b = -11, and c = -4.", "tool": "solve_quadratic", "required": ["a", "b", "c"], "answer": [{"solve_quadratic": {"a": [3], "b": [-11], "c": [-4], "root_type": ["all"]}}]}, {"id": "simple_python_6", "prompt": "What are the roots of the quadratic equation where a=2, b=5 and c=3 ?", "tool": "solve_quadratic", "required": ["a", "b", "c"], "answer": [{"solve_quadratic": {"a": [2], "b": [5], "c": [3]}}]}, {"id": "simple_python_7", "prompt": "What is the circumference of a circle with a radius of 4 inches?", "tool": "calculate_circumference", "required": ["radius"], "answer": [{"calculate_circumference": {"radius": [4], "unit": ["inches", "in"]}}]}, {"id": "simple_python_8", "prompt": "What's the area of a circle with a radius of 10?", "tool": "geometry.area_circle", "required": ["radius"], "answer": [{"geometry.area_circle": {"radius": [10], "units": ["meters", ""]}}]}, {"id": "simple_python_9", "prompt": "Calculate the area of a circle with a radius of 5 units.", "tool": "geometry.calculate_area_circle", "required": ["radius"], "answer": [{"geometry.calculate_area_circle": {"radius": [5], "unit": ["units", ""]}}]}, {"id": "simple_python_10", "prompt": "Calculate the area of a right-angled triangle given the lengths of its base and height as 6cm and 10cm.", "tool": "calculate_area", "required": ["base", "height"], "answer": [{"calculate_area": {"base": [6], "height": [10], "unit": ["cm", ""]}}]}, {"id": "simple_python_11", "prompt": "What is the area of a triangle with base of 10 units and height of 5 units?", "tool": "calculate_triangle_area", "required": ["base", "height"], "answer": [{"calculate_triangle_area": {"base": [10], "height": [5]}}]}, {"id": "simple_python_12", "prompt": "Calculate the circumference of a circle with radius 3", "tool": "geometry.circumference", "required": ["radius"], "answer": [{"geometry.circumference": {"radius": [3], "units": ["cm", ""]}}]}, {"id": "simple_python_17", "prompt": "Find the prime factors of 450", "tool": "get_prime_factors", "required": ["number", "formatted"], "answer": [{"get_prime_factors": {"number": [450], "formatted": [true, ""]}}]}, {"id": "simple_python_18", "prompt": "Find the prime factors of the number 123456.", "tool": "number_analysis.prime_factors", "required": ["number"], "answer": [{"number_analysis.prime_factors": {"number": [123456]}}]}, {"id": "simple_python_19", "prompt": "Calculate the greatest common divisor of two numbers: 40 and 50", "tool": "math.gcd", "required": ["num1", "num2"], "answer": [{"math.gcd": {"num1": [40], "num2": [50]}}]}, {"id": "simple_python_20", "prompt": "Find the highest common factor of 36 and 24.", "tool": "math.hcf", "required": ["number1", "number2"], "answer": [{"math.hcf": {"number1": [36], "number2": [24]}}]}, {"id": "simple_python_21", "prompt": "Find the Greatest Common Divisor (GCD) of two numbers, say 36 and 48.", "tool": "number_theory.gcd", "required": ["number1", "number2"], "answer": [{"number_theory.gcd": {"number1": [36], "number2": [48]}}]}, {"id": "simple_python_22", "prompt": "Calculate the greatest common divisor of two given numbers, for example 12 and 15.", "tool": "math.gcd", "required": ["num1", "num2"], "answer": [{"math.gcd": {"num1": [12], "num2": [15]}}]}]
$data$::jsonb;
  task jsonb;
  candidate jsonb;
  accepted jsonb;
  output jsonb := '[]';
  passed boolean;
  elapsed numeric;
  started timestamptz;
begin
  for task in select value from jsonb_array_elements(tasks)
  loop
    started := clock_timestamp();
    -- The baseline receives the public prompt and required argument names.
    -- Bind numbers in prompt order, with no access to expected.permitted.
    select coalesce(jsonb_object_agg(arg.value, to_jsonb((n.value)[1]::numeric)), '{}'::jsonb)
    into candidate
    from jsonb_array_elements_text(task->'required') with ordinality arg(value, slot)
    join regexp_matches(task->>'prompt', '[-+]?[0-9]+(?:\.[0-9]+)?', 'g')
      with ordinality n(value, slot) using (slot);
    elapsed := round(extract(epoch from (clock_timestamp()-started))*1000, 3);

    -- Compare the candidate structurally against upstream accepted values.
    accepted := task->'answer'->0->(task->>'tool');
    select accepted is not null and not exists(
      select from jsonb_each(accepted) as expected(key, permitted)
      where case when candidate ? expected.key
        then not (expected.permitted @> jsonb_build_array(candidate->expected.key))
        else not (expected.permitted @> '[""]'::jsonb) end
    ) and not exists(
      select from jsonb_object_keys(candidate) as actual(key) where not (accepted ? actual.key)
    ) into passed;
    output := output || jsonb_build_array(jsonb_build_object(
      'task', task->>'id', 'passed', passed, 'latency_ms', elapsed, 'prompt', task->>'prompt',
      'tool', task->>'tool', 'arguments', candidate, 'accepted_values', accepted
    ));
  end loop;
  return output;
end;
$function$;

revoke execute on function public.bifrost_run_bfcl_math() from public;
grant execute on function public.bifrost_run_bfcl_math() to anon, authenticated, service_role;

insert into public.agents(slug,name,category,license_type,form_factor,status,price_tier,description)
values ('bifrost-numeric-binder','Bifrost Numeric Binder','data_analytics','open_source','framework','active','free',
  'Deterministic baseline that binds numbers from a prompt to required tool arguments in order.')
on conflict(slug) do nothing;
insert into public.agent_versions(agent_id,version_label,scaffold_config,notes)
select id,'1.0', '{"model":null,"rule":"positional numeric argument binding","tool_calls":1}', 'No model API.'
from public.agents where slug='bifrost-numeric-binder' on conflict(agent_id,version_label) do nothing;
insert into public.benchmarks(slug,name,domain,description,repo_url,primary_metric,task_count,contamination_risk,status)
values ('bfcl-v4-math-subset','BFCL v4 Math Subset','tool_use',
  '19 public arithmetic cases from BFCL v4 Simple Python, scored by Bifrost with a structural argument checker. Separate protocol from the full BFCL.',
  'https://github.com/ShishirPatil/gorilla/tree/6ea57973c7a6097fd7c5915698c54c17c5b1b6c8/berkeley-function-call-leaderboard',
  'success_pct',19,'high','active') on conflict(slug) do nothing;
insert into public.sources(source_type,url,content_hash,raw,published)
values ('platform_run','https://ai-agents-benchmark-platform.vercel.app/#benchmarks/bfcl-v4-math-subset',
  'bifrost:bfcl-v4:math:6ea57973:binder-1.0','{"dataset":"BFCL v4 Simple Python","execution":"Supabase PostgreSQL"}',true)
on conflict(url,content_hash) do nothing;
insert into public.evaluation_runs(agent_version_id,benchmark_id,run_type,harness,environment,n_trials,
  total_cost_usd,started_at,finished_at,source_id,verified,status,dataset_version,dataset_split,constraints,method_version,submission_key,published)
select av.id,b.id,'platform_run','bifrost-bfcl-structural-v1','{"host":"Supabase PostgreSQL"}',1,0,
  statement_timestamp(),clock_timestamp(),s.id,true,'completed','v4@6ea57973','simple-python-math-19',
  '{"tasks":19,"tools_provided":1,"grader":"accepted-argument-values","cost_scope":"model-provider-only"}',
  'bfcl-math-v1','bifrost:bfcl-math:binder-1.0',true
from public.agent_versions av join public.agents a on a.id=av.agent_id
cross join public.benchmarks b cross join public.sources s
where a.slug='bifrost-numeric-binder' and av.version_label='1.0' and b.slug='bfcl-v4-math-subset'
  and s.content_hash='bifrost:bfcl-v4:math:6ea57973:binder-1.0'
on conflict(submission_key) do nothing;

create temporary table bfcl_observations on commit drop as
select value as observation from jsonb_array_elements(public.bifrost_run_bfcl_math());
insert into public.benchmark_tasks(benchmark_id,external_id)
select b.id,o.observation->>'task' from bfcl_observations o cross join public.benchmarks b
where b.slug='bfcl-v4-math-subset' on conflict(benchmark_id,external_id) do nothing;
insert into public.task_results(run_id,task_id,passed,score,steps,latency_ms,cost_usd,failure_category,public_trace,trace)
select r.id,t.id,(o.observation->>'passed')::boolean,((o.observation->>'passed')::boolean)::integer,
  1,round((o.observation->>'latency_ms')::numeric),0,
  case when not (o.observation->>'passed')::boolean then 'wrong_answer' end,true,o.observation
from public.evaluation_runs r join public.benchmark_tasks t on t.benchmark_id=r.benchmark_id
join bfcl_observations o on t.external_id=o.observation->>'task'
where r.submission_key='bifrost:bfcl-math:binder-1.0'
on conflict(run_id,task_id,attempt) do nothing;
insert into public.benchmark_results(run_id,metric,raw_value,normalized_score,sample_size)
select run_id,'success_pct',round(100*avg(passed::int),2),round(100*avg(passed::int),2),count(*)
from public.task_results where run_id=(select id from public.evaluation_runs where submission_key='bifrost:bfcl-math:binder-1.0')
group by run_id on conflict(run_id,metric) do nothing;
update public.evaluation_runs set finished_at=clock_timestamp()
where submission_key='bifrost:bfcl-math:binder-1.0';
