import {writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {aggregate,scenarios,suite,taskSession} from '../dist/engine.mjs';

async function main() {
  const [endpoint,model,name,version]=['BENCH_ENDPOINT','BENCH_MODEL','BENCH_AGENT','BENCH_VERSION'].map(key=>process.env[key]?.trim());
  const key=process.env.BENCH_API_KEY;
  const protocol=process.env.BENCH_PROTOCOL ?? 'chat';
  if(!['chat','agent'].includes(protocol))throw Error('BENCH_PROTOCOL must be chat or agent.');
  const provider=process.env.BENCH_PROVIDER?.trim() || 'Custom endpoint';
  const strategy=process.env.BENCH_STRATEGY || 'verify';
  const strategies={verify:'Cross-check account verification using the verify tool before finalizing.',direct:'Use the fewest calls necessary while following policy.'};
  const output=process.argv[2];
  const attemptCount=Number(process.env.BENCH_ATTEMPTS ?? 1);
  if(![1,3].includes(attemptCount))throw Error('BENCH_ATTEMPTS must be 1 or 3.');
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
  const modelId='model-'+id(provider,model), agentId='agent-'+id(modelId,name,version,strategy,protocol);

  async function evaluate(task){
    const session=taskSession(task);
    const start=performance.now();
    const messages=[{role:'system',content:system},{role:'user',content:'Workflow '+task.stage+' for customer '+task.customer+'. Requested amount '+task.amount+' USD.'}];
    let answer='',tokens=0,tokensReported=true;
    for(let step=0;step<8;step++){
      let reply;
      try {
        reply=await fetch(url,{method:'POST',redirect:'error',signal:AbortSignal.timeout(45000),
          headers:{'Content-Type':'application/json',...(key?{Authorization:'Bearer '+key}:{})},
          body:JSON.stringify(protocol==='agent'
            ? {task_id:task.id,messages,tools,step:step+1,max_steps:8}
            : {model,messages,tools,temperature:0,stream:false})});
      } catch(error) {
        const problem=error.name==='TimeoutError'?'timed out':'could not be reached';
        throw Error('Benchmark endpoint '+problem+' on '+task.id+'. Check BENCH_ENDPOINT and the agent service.');
      }
      if(!reply.ok)throw Error('Benchmark endpoint returned HTTP '+reply.status+' on '+task.id+'.');
      let response;
      try { response=await reply.json(); }
      catch { throw Error('Benchmark endpoint returned invalid JSON on '+task.id+'.'); }
      const message=protocol==='agent'?response.message:response.choices?.[0]?.message;
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

  const attempts=[];
  for(let attempt=0;attempt<attemptCount;attempt++){
    const batch=[];
    for(const scenario of scenarios){
      for(const task of scenario.tasks)batch.push(await evaluate(task));
      process.stderr.write('Attempt '+(attempt+1)+'/'+attemptCount+' · '+batch.length+' / 60 tasks\n');
    }
    attempts.push(batch);
  }
  const [trials,...repeats]=attempts;
  const metric=rows=>({...aggregate(rows),cost_usd:null});
  const report={
    format:'agentbench-external-v1',
    suite_id:suite.id, suite_version:suite.version,
    model:{id:modelId,name:model,provider,version:model},
    agent:{id:agentId,name,version,harness:protocol==='agent'?'External agent · Support Operations':strategy==='verify'?'Model tools · verification prompt':'Model tools · direct prompt',model_id:modelId,initials:name.slice(0,2).toUpperCase(),color:'violet'},
    run:{id:agentId+'-'+Date.now(),agent_id:agentId,suite_id:suite.id,release:0,source:'external',run_date:new Date().toISOString().slice(0,10),...metric(trials),
      breakdown:scenarios.map(s=>({scenario_id:s.id,...metric(trials.filter(t=>t.scenario_id===s.id))}))},
    trials,...(repeats.length?{repeats}:{}),
  };
  await writeFile(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  console.log(output);
}

main().catch(error=>{
  const message=error.code==='EEXIST'?'Output file already exists. Choose another path.':
    error.code==='ERR_INVALID_URL'?'BENCH_ENDPOINT is not a valid URL.':error.message;
  console.error('Benchmark failed. '+message);
  process.exitCode=1;
});
