create function public.bifrost_valid_external_report(report jsonb)
returns boolean language plpgsql immutable security invoker set search_path = ''
as $$
declare
  batch jsonb;
  item jsonb;
  field jsonb;
  task_id text;
  seen text[];
  repeats jsonb := coalesce(report->'repeats', '[]'::jsonb);
begin
  if report->>'format' is distinct from 'agentbench-external-v1'
    or report->>'suite_id' is distinct from 'support-ops-v1'
    or report->>'suite_version' is distinct from '1.0.0'
    or coalesce(report#>>'{agent,id}', '') !~ '^agent-[0-9a-f]{16}$'
    or coalesce(report#>>'{model,id}', '') !~ '^model-[0-9a-f]{16}$'
    or report#>>'{agent,id}' is distinct from report#>>'{run,agent_id}'
    or report#>>'{model,id}' is distinct from report#>>'{agent,model_id}'
    or coalesce(report#>>'{run,run_date}', '') !~ '^\d{4}-\d{2}-\d{2}$'
    or jsonb_typeof(repeats) <> 'array'
  then return false; end if;
  if jsonb_array_length(repeats) not in (0, 2) then return false; end if;

  foreach field in array array[report#>'{agent,name}', report#>'{agent,version}', report#>'{agent,harness}',
       report#>'{model,name}', report#>'{model,provider}', report#>'{model,version}']
  loop
    if jsonb_typeof(field) is distinct from 'string'
      or length(btrim(field#>>'{}')) not between 1 and 150 then return false; end if;
  end loop;

  for batch in select value from jsonb_array_elements(jsonb_build_array(report->'trials') || repeats)
  loop
    if jsonb_typeof(batch) <> 'array' then return false; end if;
    if jsonb_array_length(batch) <> 60 then return false; end if;
    seen := array[]::text[];
    for item in select value from jsonb_array_elements(batch)
    loop
      task_id := item->>'task_id';
      if coalesce(task_id, '') !~ '^(lookups|refunds|routing)-([1-9]|1[0-9]|20)$'
        or split_part(task_id, '-', 1) is distinct from item->>'scenario_id'
        or task_id = any(seen)
        or jsonb_typeof(item->'passed') is distinct from 'boolean'
        or jsonb_typeof(item->'policy_ok') is distinct from 'boolean'
        or jsonb_typeof(item->'latency_ms') is distinct from 'number'
        or jsonb_typeof(item->'tool_calls') is distinct from 'number'
        or coalesce(item->>'latency_ms', '') !~ '^[0-9]{1,16}$'
        or (item->>'latency_ms')::numeric > 9007199254740991
        or coalesce(item->>'tool_calls', '') !~ '^[0-9]{1,2}$'
        or (item->>'tool_calls')::numeric > 64
      then return false; end if;
      seen := array_append(seen, task_id);
    end loop;
  end loop;
  return true;
exception when data_exception then
  return false;
end;
$$;

revoke execute on function public.bifrost_valid_external_report(jsonb) from public, anon;
grant execute on function public.bifrost_valid_external_report(jsonb) to authenticated, service_role;

alter table public.benchmark_submissions drop constraint benchmark_submissions_details_check;
alter table public.benchmark_submissions add constraint benchmark_submissions_details_check check (
  jsonb_typeof(details) = 'object' and case
    when details ? 'external_report' then
      kind = 'result'
      and octet_length(details::text) <= 262144
      and public.bifrost_valid_external_report(details->'external_report')
    else octet_length(details::text) <= 16000
  end
);
