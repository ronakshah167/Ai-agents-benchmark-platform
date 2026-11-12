export const suite = {id:'support-ops-v1',name:'Support Operations',version:'1.0.0',description:'Tool use, policy adherence and final-state accuracy in simulated service workflows.'};

const stages = [
  {id:'lookups', name:'Account lookup', group:'Tool use', writes:false},
  {id:'refunds', name:'Refund policy', group:'Policy adherence', writes:true},
  {id:'routing', name:'Case routing', group:'Workflow execution', writes:true},
];
export const scenarios = stages.map(stage => ({...stage,tasks:Array.from({length:20},(_,i) => ({
  id:stage.id+'-'+(i+1), index:i, stage:stage.id, customer:'C'+(100+i), amount:35+i*5,
  verified:i%7!==4, restricted:i%4===3, secondary:i%6===5, stale:i%9===7, writes:stage.writes,
}))}));
export const models = [
  {id:'rules',name:'Scripted policy',provider:'Local baseline',version:'1'},
  {id:'external',name:'External model',provider:'Bring your own',version:'Configurable'},
];
export const agents = [
  {id:'relay',name:'Relay',initials:'RE',version:'1.3',harness:'Plan · execute · verify',model_id:'rules',color:'violet'},
  {id:'atlas',name:'Atlas',initials:'AT',version:'1.2',harness:'Plan · execute',model_id:'rules',color:'teal'},
  {id:'scout',name:'Scout',initials:'SC',version:'1.1',harness:'Sequential tools',model_id:'rules',color:'blue'},
  {id:'quill',name:'Quill',initials:'QU',version:'1.0',harness:'Single-step routing',model_id:'rules',color:'amber'},
  {id:'mosaic',name:'Mosaic',initials:'MO',version:'1.1',harness:'Cached lookup',model_id:'rules',color:'rose'},
];

export function taskSession(task) {
  const trace = [];
  const state = {action:null};
  const expected = !task.verified ? 'escalate' : task.stage==='lookups' ? 'report' :
    task.stage==='refunds' ? (task.restricted?'deny':'refund') : (task.secondary?'specialist':'standard');
  const timings = {lookup:320, policy:410, verify:480, commit:750};
  const prices = {lookup:.0012, policy:.0018, verify:.0022, commit:.0035};
  const observation = {customer:task.customer, verified:task.verified, stale:task.stale};
  function call(tool, action) {
    if(!Object.hasOwn(timings,tool)) return {error:'Unknown tool'};
    trace.push(tool);
    if(tool==='lookup') return observation;
    if(tool==='policy') return {restricted:task.restricted,secondary:task.secondary,workflow:task.stage};
    if(tool==='verify') return {verified:task.verified,stale:task.stale};
    if(!['refund','deny','escalate','specialist','standard'].includes(action)) return {error:'Unsupported action'};
    if(!task.writes) return {error:'Read-only workflow'};
    state.action=action;
    return {recorded:action};
  }
  function score(answer) {
    return {
      task_id:task.id, scenario_id:task.stage, passed:answer===expected && (task.writes?state.action===expected:state.action===null),
      policy_ok:state.action===null || (task.verified || state.action==='escalate') && (state.action!=='refund'||!task.restricted),
      cost_usd:Number(trace.reduce((s,k)=>s+prices[k],0).toFixed(4)),
      latency_ms:trace.reduce((s,k)=>s+timings[k],0), tool_calls:trace.length, trace,
    };
  }
  return {call,score};
}

function decide(id, task, runIndex) {
  const session=taskSession(task);
  const account=session.call('lookup');
  const levels={relay:4,atlas:3,scout:2,quill:0,mosaic:1};
  const level=levels[id];
  const policy=task.writes && level>=2 ? session.call('policy') : {};
  const verify=level>=3 && (id==='relay' || account.stale) ? session.call('verify') : account;
  const learns=(task.index+runIndex*3)%11 < (level+runIndex);
  const verified=level>=1 || learns ? verify.verified : true;
  let action='report';
  if(!verified) action='escalate';
  else if(task.stage==='refunds') action=(policy.restricted || (learns && task.restricted))?'deny':'refund';
  else if(task.stage==='routing') action=(level>=3 && policy.secondary || learns && task.secondary)?'specialist':'standard';
  if(task.writes && (level>=1 || learns || !task.secondary)) session.call('commit',action);
  if(level<4 && task.stale && (task.index+runIndex)%4!==0) action='unknown';
  return session.score(action);
}

export function aggregate(trials) {
  const n=trials.length;
  if(!n) return null;
  const times=trials.map(t=>t.latency_ms).sort((a,b)=>a-b);
  const mean=key=>trials.reduce((s,t)=>s+Number(t[key]),0)/n;
  return {n,success_pct:Math.round(mean('passed')*1000)/10,policy_pct:Math.round(mean('policy_ok')*1000)/10,
    cost_usd:Number(mean('cost_usd').toFixed(4)),p95_ms:times[Math.ceil(n*.95)-1],
    tool_calls:Number(mean('tool_calls').toFixed(1))};
}

export function runBaseline(agentId, release=4, onProgress=()=>{}) {
  const agent=agents.find(a=>a.id===agentId);
  if(!agent) throw Error('Unknown baseline');
  let completed=0;
  return scenarios.flatMap(s=>s.tasks.map(task=>{
    const trial=decide(agentId,task,release);
    onProgress(++completed);
    return trial;
  }));
}

export function snapshot() {
  const start=Date.UTC(2026,9,12);
  const runs=Array.from({length:5},(_,release)=>agents.flatMap(agent=>{
    const trials=runBaseline(agent.id,release);
    return [{id:agent.id+'-'+release,agent_id:agent.id,suite_id:suite.id,release,source:'baseline',run_date:new Date(start+release*7*86400000).toISOString().slice(0,10),
      ...aggregate(trials),breakdown:scenarios.map(s=>({scenario_id:s.id,...aggregate(trials.filter(t=>t.scenario_id===s.id))}))}];
  })).flat();
  return {suite, agents, models, scenarios:scenarios.map(({tasks,...s})=>s), runs};
}
