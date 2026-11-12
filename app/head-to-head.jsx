'use client';
import {useState} from 'react';
import {compareAgents} from './compare.mjs';
import {number,tied} from './data.mjs';

const name=(agents,slug)=>agents.find(agent=>agent.slug===slug)?.name;
const link=run=>'#runs/'+encodeURIComponent(run.run_id);
const score=run=>number(run.raw_value)+(run.metric.endsWith('_pct')?'%':'');
const interval=run=>run.ci_low==null||run.ci_high==null?'':number(run.ci_low)+'–'+number(run.ci_high)+'% CI';
const protocol=run=>{
  const {max_steps:steps,additional_coding_actions:coding}=run.constraints??{};
  return [run.dataset_version,run.dataset_split,run.harness,steps==null?null:steps+' steps',
    coding==null?null:coding?'Coding actions allowed':'No coding actions'].filter(Boolean).join(' · ');
};

function Score({run}){
  return <td><strong>{score(run)}</strong><br/>{interval(run)&&<span className="muted">{interval(run)}<br/></span>}
   <a className="link" href={link(run)}>{run.version_label}</a><br/>
   <span className="muted">{run.run_type==='platform_run'?'Scripted platform run':run.verified?'Benchmark-published result':'Third-party reported'}</span></td>;
}

function BenchmarkCoverage({title,rows}){
  return <section className="card"><h2>{title}</h2>{rows.length?<ul className="stack">
    {rows.map(run=><li key={run.run_id+'/'+run.metric}><a className="link" href={link(run)}>{run.benchmark} · {run.metric}</a> · {score(run)}
      <br/><span className="muted">{protocol(run)} · {run.version_label}</span></li>)}
    </ul>:<p className="muted">No results for this list.</p>}</section>;
}

export default function HeadToHead({agents,leaders,initial,tradeoffs}){
  const scored=new Set(leaders.map(row=>row.agent_slug));
  const defaults=['openai-codex','claude-code'].every(slug=>scored.has(slug))?['openai-codex','claude-code']:[...scored].slice(0,2);
  const [first,second]=initial?initial.split(',') : defaults;
  const [left,setLeft]=useState(name(agents,first)?first:'');
  const [right,setRight]=useState(first!==second&&name(agents,second)?second:'');
  const leftName=name(agents,left),rightName=name(agents,right);
  const active=left&&right&&left!==right;
  const {shared,leftOnly,rightOnly}=active?compareAgents(left,right,leaders):{shared:[],leftOnly:[],rightOnly:[]};
  const picker=(label,value,other,set)=><label>{label}<select value={value} onChange={event=>set(event.target.value)}>
    <option value="">Choose an agent</option>
    {agents.map(agent=><option key={agent.slug} value={agent.slug} disabled={agent.slug===other}>{agent.name}{scored.has(agent.slug)?'':' · No published score'}</option>)}
  </select></label>;
  return <>
    <header className="hero"><h1>Compare two agents</h1><p className="sub">Choose any two named agents. See shared benchmark results and which scores are still missing.</p>
      <div className="filters pair-pickers">{picker('First agent',left,right,setLeft)}{picker('Second agent',right,left,setRight)}</div>
      {active&&<a className="link" href={'#compare/'+encodeURIComponent(left+','+right)}>Link to this comparison</a>}
    </header>
    {!active?<p className="panel empty">Select two different agents.</p>:<>
      <section className="panel"><h2>{leftName} vs {rightName}</h2>
        {shared.length?<><p className="muted">Each row uses the top leaderboard entry per agent for that protocol. Deltas are first agent minus second agent. The linked runs show the model and settings used.</p>
          <div className="table-scroll" tabIndex={0}><table><thead><tr><th>Shared benchmark</th><th>{leftName}</th><th>{rightName}</th><th>Delta</th></tr></thead><tbody>
          {shared.map(([a,b])=><tr key={a.run_id+'/'+b.run_id+'/'+a.metric}><td><strong>{a.benchmark}</strong><br/>{a.metric}<br/><span className="muted">{protocol(a)}</span></td>
            <Score run={a}/><Score run={b}/><td>{a.normalized_score==null||b.normalized_score==null?'Unavailable':number(a.normalized_score-b.normalized_score)+(a.metric.endsWith('_pct')?' pp':' points')}
              <br/><span className="muted">{a.ci_low==null||b.ci_low==null?'Uncertainty unavailable':tied(a,b)?'Intervals overlap':'Intervals do not overlap'}</span></td></tr>)}
          </tbody></table></div></>:<p className="empty">No comparable published results for this pair. A shared benchmark version and evaluation protocol are required to calculate a delta.</p>}
      </section>
      {shared.filter(([a,b])=>a.metric==='success_pct'&&a.total_cost_usd!=null&&b.total_cost_usd!=null).map(pair=>tradeoffs(pair))}
      <div className="grid-cards mt-4"><BenchmarkCoverage title={leftName+' · Unmatched results'} rows={leftOnly}/><BenchmarkCoverage title={rightName+' · Unmatched results'} rows={rightOnly}/></div>
    </>}
  </>;
}
