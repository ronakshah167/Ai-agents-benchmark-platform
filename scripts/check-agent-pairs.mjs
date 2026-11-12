import assert from 'node:assert/strict';
import {compareAgents} from '../app/compare.mjs';

const common={benchmark_slug:'terminal-bench',metric:'success_pct',dataset_version:'4.1',
  dataset_split:'official',method_version:'publisher-v1',harness:'Harbor',n_trials:330,constraints:{stage:'test',full:true}};
const first={...common,agent_slug:'codex'};
const second={...common,agent_slug:'claude',constraints:{full:true,stage:'test'}};
const different={...second,dataset_version:'2.1'};
const wrongProtocol={...second,harness:'revision study'};
assert.deepEqual(compareAgents('codex','claude',[first,second,different,wrongProtocol]),{
  shared:[[first,second]],leftOnly:[],rightOnly:[different,wrongProtocol],
});
assert.deepEqual(compareAgents('codex','unscored',[first,second]),{shared:[],leftOnly:[first],rightOnly:[]});
assert.equal(compareAgents('codex','claude',[first,{...second,n_trials:1}]).shared.length,0);
console.log('Verified agent matching, missing scores and protocol isolation.');
