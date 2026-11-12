import {snapshot} from '../dist/engine.mjs';
const data=snapshot();
const literal=v=>typeof v==='string'?"'"+v.replaceAll("'","''")+"'":String(v);
const insert=(name,keys,ids,rows)=>{
  const values=rows.map(row=>'('+keys.map(k=>literal(row[k])).join(',')+')').join(',\n');
  const updates=keys.filter(k=>!ids.includes(k)).map(k=>'"'+k+'"=excluded."'+k+'"').join(',');
  return 'insert into public.'+name+' ('+keys.map(k=>'"'+k+'"').join(',')+') values\n'+values+'\non conflict ('+ids.join(',')+') do update set '+updates+';';
};
const metrics=['n','success_pct','policy_pct','cost_usd','p95_ms','tool_calls'];
console.log('begin;');
console.log(insert('ab_models',['id','name','provider','version'],['id'],data.models));
console.log(insert('ab_agents',['id','name','initials','version','harness','model_id','color'],['id'],data.agents));
console.log(insert('ab_suites',['id','name','version','description'],['id'],[data.suite]));
console.log(insert('ab_scenarios',['suite_id','id','name','group','writes'],['suite_id','id'],data.scenarios.map(s=>({...s,suite_id:data.suite.id}))));
console.log(insert('ab_runs',['id','agent_id','suite_id','release','source','run_date',...metrics],['id'],data.runs));
console.log(insert('ab_breakdowns',['run_id','suite_id','scenario_id',...metrics],['run_id','scenario_id'],data.runs.flatMap(r=>r.breakdown.map(b=>({...b,run_id:r.id,suite_id:r.suite_id})))));
console.log('commit;');
