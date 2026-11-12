import {aggregate,scenarios,suite} from './engine.mjs';

const expected=new Map(scenarios.flatMap(s=>s.tasks.map(t=>[t.id,s.id])));
const isString=(value,max)=>typeof value==='string'&&value.trim().length>0&&value.length<=max;
const validId=(value,prefix)=>typeof value==='string'&&new RegExp('^'+prefix+'-[0-9a-f]{16}$').test(value);

export function readReports(reports){
  if(reports.length<1||reports.length>12)throw Error('Count');
  const agents=[], models=new Map(), runs=[];
  for(const report of reports){
    const {agent,model,run,trials}=report;
    if(report.format!=='agentbench-external-v1'||report.suite_id!==suite.id||report.suite_version!==suite.version||
       !validId(agent?.id,'agent')||!validId(model?.id,'model')||agent.model_id!==model.id||run?.agent_id!==agent.id||
       !/^\d{4}-\d{2}-\d{2}$/.test(run.run_date)||agents.some(a=>a.id===agent.id)||
       ![agent.name,agent.version,agent.harness,model.name,model.provider,model.version].every(v=>isString(v,150))||
       !Array.isArray(trials)||trials.length!==expected.size)throw Error('Report metadata');
    const repeats=report.repeats??[];
    if(!Array.isArray(repeats)||![0,2].includes(repeats.length))throw Error('Repeat count');
    const attempts=[trials,...repeats].map(batch=>{
      if(!Array.isArray(batch)||batch.length!==expected.size)throw Error('Trial coverage');
      const seen=new Set();
      return batch.map(trial=>{
        if(!trial||!expected.has(trial.task_id)||expected.get(trial.task_id)!==trial.scenario_id||seen.has(trial.task_id)||
           typeof trial.passed!=='boolean'||typeof trial.policy_ok!=='boolean'||!Number.isSafeInteger(trial.latency_ms)||trial.latency_ms<0||
           !Number.isInteger(trial.tool_calls)||trial.tool_calls<0||trial.tool_calls>64)throw Error('Trial');
        seen.add(trial.task_id);
        const field=(key)=>Object.hasOwn(trial,key)&&(trial[key]===null||isString(trial[key],150))?{[key]:trial[key]}:{};
        const trace=Array.isArray(trial.trace)&&trial.trace.length===trial.tool_calls&&trial.trace.every(value=>isString(value,32))?trial.trace:[];
        const violations=Array.isArray(trial.violations)?trial.violations.filter(value=>isString(value,32)).slice(0,8):[];
        return {task_id:trial.task_id,scenario_id:trial.scenario_id,passed:trial.passed,policy_ok:trial.policy_ok,latency_ms:trial.latency_ms,
          tool_calls:trial.tool_calls,trace,violations,...field('expected_answer'),...field('answer'),...field('expected_state'),...field('final_state')};
      });
    });
    const metric=rows=>({...aggregate(rows),cost_usd:null});
    models.set(model.id,{id:model.id,name:model.name,provider:model.provider,version:model.version});
    agents.push({id:agent.id,name:agent.name,version:agent.version,harness:agent.harness,model_id:model.id,initials:agent.name.slice(0,2).toUpperCase(),color:'violet'});
    runs.push({id:agent.id,agent_id:agent.id,suite_id:suite.id,release:0,source:'external',run_date:run.run_date,...metric(trials),attempts,
      breakdown:scenarios.map(s=>({scenario_id:s.id,...metric(trials.filter(t=>t.scenario_id===s.id))}))});
  }
  return {suite,agents,models:[...models.values()],runs,scenarios:scenarios.map(({tasks,...s})=>s)};
}
