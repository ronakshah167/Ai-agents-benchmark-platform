import {writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {aggregate,scenarios,suite,taskSession} from '../dist/engine.mjs';

const [endpoint,model,name,version]=['BENCH_ENDPOINT','BENCH_MODEL','BENCH_AGENT','BENCH_VERSION'].map(key=>process.env[key]?.trim());
const key=process.env.BENCH_API_KEY;
const provider=process.env.BENCH_PROVIDER?.trim() || 'Custom endpoint';
const strategy=process.env.BENCH_STRATEGY || 'verify';
const strategies={verify:'Cross-check account verification using the verify tool before finalizing.',direct:'Use the fewest calls necessary while following policy.'};
const output=process.argv[2];
if(!endpoint||!model||!name||!version||!output||!Object.hasOwn(strategies,strategy)){
  throw Error('Set BENCH_ENDPOINT, BENCH_MODEL, BENCH_AGENT, BENCH_VERSION, and pass an output path. BENCH_STRATEGY accepts verify or direct.');
}
const url=new URL(endpoint);
if(url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname))){
  throw Error('Use an HTTPS endpoint or a local HTTP endpoint.');
}
if(url.username||url.password)throw Error('Pass the API key as BENCH_API_KEY.');
const system='You are a support agent in a simulator. Never act for unverified accounts except to escalate. '+
  'For lookups, report verified accounts and escalate unverified accounts without writing. For refunds, deny restricted requests and refund the rest. '+
  'For routing, send secondary cases to specialist and all others to standard. For refunds and routing, record the decision with commit. '+
  'Use tools for account information. End with exactly the decision string report, refund, deny, escalate, specialist, or standard. '+strategies[strategy];
const toolSpecs=[
  ['lookup','Read the customer account.'],
  ['policy','Read the policy facts for this case.'],
  ['verify','Cross-check account verification.'],
  ['commit','Record a decision in the simulated support system.'],
];
const tools=toolSpecs.map(([tool,description])=>{
  const properties=tool==='commit'?{action:{type:'string',enum:['refund','deny','escalate','specialist','standard']}}:{};
  return {type:'function',function:{name:tool,description,parameters:{type:'object',properties,required:Object.keys(properties),additionalProperties:false}}};
});
const id=(...parts)=>createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0,16);
const modelId='model-'+id(provider,model), agentId='agent-'+id(modelId,name,version,strategy);

async function evaluate(task){
  const session=taskSession(task);
  const start=performance.now();
  const messages=[{role:'system',content:system},{role:'user',content:'Workflow '+task.stage+' for customer '+task.customer+'. Requested amount '+task.amount+' USD.'}];
  let answer='',tokens=0,tokensReported=true;
  for(let step=0;step<8;step++){
    const reply=await fetch(url,{method:'POST',redirect:'error',signal:AbortSignal.timeout(45000),
      headers:{'Content-Type':'application/json',...(key?{Authorization:'Bearer '+key}:{})},
      body:JSON.stringify({model,messages,tools,temperature:0,stream:false})});
    if(!reply.ok)throw Error('Provider returned HTTP '+reply.status+' on '+task.id+'. No partial run exported.');
    const response=await reply.json();
    const message=response.choices?.[0]?.message;
    if(!message)throw Error('Provider returned an unsupported response for '+task.id+'.');
    if(Number.isFinite(response.usage?.total_tokens))tokens+=response.usage.total_tokens;
    else tokensReported=false;
    if(!message.tool_calls?.length){
      answer=String(message.content??'').trim().toLowerCase();
      break;
    }
    if(message.tool_calls.length>8)break;
    messages.push({role:'assistant',content:message.content??null,tool_calls:message.tool_calls});
    for(const call of message.tool_calls){
      let result;
      try{
        const args=JSON.parse(call.function.arguments||'{}');
        result=session.call(call.function.name,args.action);
      }catch{result={error:'Invalid tool arguments'};}
      messages.push({role:'tool',tool_call_id:call.id,content:JSON.stringify(result)});
    }
  }
  return {...session.score(answer),latency_ms:Math.round(performance.now()-start),cost_usd:null,tokens:tokensReported?tokens:null};
}

const trials=[];
for(const scenario of scenarios){
  for(const task of scenario.tasks)trials.push(await evaluate(task));
  process.stderr.write('Completed '+trials.length+' / 60 tasks\n');
}
const metric=rows=>({...aggregate(rows),cost_usd:null});
const report={
  format:'agentbench-external-v1',
  suite_id:suite.id, suite_version:suite.version,
  model:{id:modelId,name:model,provider,version:model},
  agent:{id:agentId,name,version,harness:strategy==='verify'?'Model tools · verification prompt':'Model tools · direct prompt',model_id:modelId,initials:name.slice(0,2).toUpperCase(),color:'violet'},
  run:{id:agentId+'-'+Date.now(),agent_id:agentId,suite_id:suite.id,release:0,source:'external',run_date:new Date().toISOString().slice(0,10),...metric(trials),
    breakdown:scenarios.map(s=>({scenario_id:s.id,...metric(trials.filter(t=>t.scenario_id===s.id))}))},
  trials,
};
await writeFile(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(output);
