import assert from 'node:assert/strict';
import {aggregate,runBaseline,scenarios,snapshot,taskSession} from '../dist/engine.mjs';
import {readReports} from '../dist/import.mjs';
import {pairedOutcomes,passAll,runAttempts} from '../dist/evidence.mjs';
const data=snapshot();
assert.equal(data.runs.length,25);
assert.equal(data.agents.length,5);
assert.equal(new Set(data.runs.map(r=>r.id)).size,25);
for(const run of data.runs){
  const trials=runBaseline(run.agent_id,run.release);
  assert.equal(trials.length,60);
  assert.equal(new Set(trials.map(t=>t.task_id)).size,60);
  assert.equal(run.breakdown.reduce((n,s)=>n+s.n,0),60);
  assert.equal(run.success_pct,aggregate(trials).success_pct);
  assert.ok(run.p95_ms>=320);
}
const task=scenarios.find(s=>s.id==='refunds').tasks.find(t=>t.restricted&&t.verified);
const sim=taskSession(task);
sim.call('commit','refund');
assert.equal(sim.score('refund').policy_ok,false);
assert.equal(sim.score('refund').passed,false);
sim.call('commit','deny');
assert.equal(sim.score('deny').passed,true);
assert.equal(sim.score('deny').policy_ok,false);
assert.deepEqual(sim.score('deny').violations,['ineligible_refund']);
assert.equal(sim.score('deny').final_state,'deny');
assert.equal(sim.score('deny').expected_state,'deny');
const agent='agent-aaaaaaaaaaaaaaaa',model='model-bbbbbbbbbbbbbbbb';
const report={format:'agentbench-external-v1',suite_id:data.suite.id,suite_version:data.suite.version,
  agent:{id:agent,model_id:model,name:'Mock agent',version:'1',harness:'Mock'},model:{id:model,name:'Mock model',provider:'Local',version:'1'},
  run:{agent_id:agent,run_date:'2026-11-12'},trials:runBaseline('atlas')};
assert.equal(readReports([report]).runs[0].cost_usd,null);
assert.equal(readReports([report]).runs[0].success_pct,95);
assert.throws(()=>readReports([report,report]));
assert.throws(()=>readReports([{...report,trials:[...report.trials.slice(1),report.trials.at(-1)]}]));
const primary=data.runs.find(r=>r.agent_id==='relay'&&r.release===4);
const secondary=data.runs.find(r=>r.agent_id==='atlas'&&r.release===4);
const relay=runAttempts(primary), atlas=runAttempts(secondary);
assert.deepEqual(relay[0],runBaseline('relay'));
assert.equal(passAll(relay),100);
assert.equal(passAll(atlas),90);
assert.equal(passAll([atlas[0]]),null);
assert.deepEqual(pairedOutcomes(relay[0],atlas[0],'refunds'),{left:1,right:0,both:19,neither:0});
const repeated=readReports([{...report,repeats:atlas.slice(1)}]).runs[0];
assert.equal(passAll(runAttempts(repeated)),90);
assert.throws(()=>readReports([{...report,repeats:[atlas[1]]}]));
assert.throws(()=>readReports([{...report,repeats:[atlas[1],[]]}]));
console.log('Verified 25 runs, state scoring, policy traces, paired outcomes and repeated imports.');
