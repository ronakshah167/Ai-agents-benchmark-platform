import {agents,runBaseline,suite} from './engine.mjs';

export function runAttempts(run) {
  if(!run)return [];
  if(run.source==='external')return run.attempts??[];
  if(run.source==='baseline'&&run.suite_id===suite.id&&agents.some(agent=>agent.id===run.agent_id)){
    return Array.from({length:3},(_,attempt)=>runBaseline(run.agent_id,run.release,undefined,attempt));
  }
  return [];
}

export function passAll(attempts, scenario='all') {
  if(attempts.length<2)return null;
  const taskSet=attempts[0].filter(task=>scenario==='all'||task.scenario_id===scenario);
  if(!taskSet.length)return null;
  const passedSets=attempts.map(rows=>new Set(rows.filter(row=>row.passed).map(row=>row.task_id)));
  const passed=taskSet.filter(task=>passedSets.every(set=>set.has(task.task_id))).length;
  return Math.round(1000*passed/taskSet.length)/10;
}

export function pairedOutcomes(left,right,scenario='all'){
  const byTask=new Map(right.map(task=>[task.task_id,task]));
  const outcomes={left:0,right:0,both:0,neither:0};
  for(const task of left){
    if(scenario!=='all'&&task.scenario_id!==scenario)continue;
    const other=byTask.get(task.task_id);
    if(!other)continue;
    const key=task.passed?(other.passed?'both':'left'):(other.passed?'right':'neither');
    outcomes[key]++;
  }
  return outcomes;
}
