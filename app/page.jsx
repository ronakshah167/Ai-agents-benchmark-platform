'use client';
import {useEffect,useState} from 'react';
import {CartesianGrid,ResponsiveContainer,Scatter,ScatterChart,Tooltip,XAxis,YAxis} from 'recharts';
import {allRows,catalog,cohort,number,request,safeUrl} from './data.mjs';
import HeadToHead from './head-to-head.jsx';

const tabs=[['home','Leaderboard'],['agents','Agents'],['benchmarks','Benchmarks'],['compare','Compare'],['peers','Peer groups'],['method','Methodology'],['submit','Submit'],['admin','Admin']];
const go=(path,id='')=>'#'+path+(id?'/'+encodeURIComponent(id):'');
const asLabel=value=>value?.replaceAll('_',' ')??'—';
const interval=r=>r.ci_low==null||r.ci_high==null?'—':number(r.ci_low)+'–'+number(r.ci_high);
const external=(url,label)=>safeUrl(url)?<a className="link" href={safeUrl(url)}>{label}</a>:null;
function Empty({children}){return <p className="panel empty">{children}</p>;}
function Rows({rows,peer=false}){
 return rows.length?<div className="table-scroll" tabIndex={0}><table><thead><tr><th>Agent</th><th>Benchmark / metric</th><th>Raw</th><th>Score / 100</th><th>95% CI</th><th>Provenance</th>{peer&&<th>Peer percentile</th>}</tr></thead><tbody>
 {rows.map(r=><tr key={[r.run_id,r.metric,r.peer_group].join('/')}><td><a className="link" href={go('agents',r.agent_slug)}>{r.agent}</a><br/><span className="muted">{r.version_label}</span></td><td>{r.benchmark}<br/><span className="muted">{r.metric} · {r.dataset_version}</span></td><td>{number(r.raw_value)}</td><td>{number(r.normalized_score)}</td><td>{interval(r)}</td><td><a className="link" href={go('runs',r.run_id)}>Run details</a> · {external(r.source_url,'Source')}<br/><span className="badge">{r.verified?(r.run_type==='platform_run'?'Platform run':'Benchmark-published'):asLabel(r.run_type)}</span></td>{peer&&<td>{r.cohort_size>1?number(r.peer_percentile):'—'} ({r.cohort_size})</td>}</tr>)}
 </tbody></table></div>:<Empty>No published results match this selection.</Empty>;
}
function Tradeoffs({rows}){
 const points=rows.filter(row=>row.metric==='success_pct'&&row.sample_size>0&&row.raw_value>0&&row.total_cost_usd!=null)
  .map(row=>({agent:row.agent,cost:Number((row.total_cost_usd/(row.sample_size*row.raw_value/100)).toFixed(4)),score:row.normalized_score}));
 if(points.length<2)return null;
 const frontier=points.filter(p=>!points.some(q=>q.cost<=p.cost&&q.score>=p.score&&(q.cost<p.cost||q.score>p.score)));
 return <section className="panel mt-4"><h2>Score versus cost per successful task</h2><p className="muted">{rows[0].constraints?.tool_cost==='simulated'?'Simulated tool costs. ':''}Pareto frontier {frontier.map(p=>p.agent).join(', ')}.</p>
 <div style={{height:250}}><ResponsiveContainer width="100%" height="100%"><ScatterChart margin={{top:15,right:16,bottom:15,left:10}}><CartesianGrid stroke="#dce1d7"/><XAxis type="number" dataKey="cost" name="Cost / success" tickFormatter={v=>'$'+v}/><YAxis type="number" dataKey="score" name="Score" domain={[0,100]}/><Tooltip cursor={{strokeDasharray:'3 3'}}/><Scatter data={points} fill="#354831"/></ScatterChart></ResponsiveContainer></div>
 <details><summary>Chart data</summary>{points.map(p=><p key={p.agent}>{p.agent} · {number(p.score)} / 100 · ${p.cost}</p>)}</details></section>;
}
function Cohort({data}){
 const [chosen,setChosen]=useState(''),[filters,setFilters]=useState({});
 const groups=Map.groupBy(data.leaders,cohort);
 const key=groups.has(chosen)?chosen:[...groups].find(([,rows])=>rows[0].benchmark_slug==='terminal-bench'&&rows[0].dataset_version==='4.1')?.[0]??groups.keys().next().value;
 if(!key)return <Empty>There are no published scores yet. <a className="link" href="/demo/index.html">Open the working support benchmark</a>.</Empty>;
 const all=groups.get(key);
 const fields=[['category','Category'],['form_factor','Form factor'],['license_type','License'],['price_tier','Price tier']];
 const rows=all.filter(r=>fields.every(([field])=>!filters[field]||r[field]===filters[field]));
 const focus=all[0];
 return <><div className="filters"><label>Comparable cohort <select value={key} onChange={e=>{setChosen(e.target.value);setFilters({});}}>
 {[...groups].map(([id,[r]],i)=><option key={id} value={id}>{r.benchmark} · {r.metric} · {r.dataset_version}/{r.dataset_split} · {r.harness} · {i+1}</option>)}</select></label>
 {fields.map(([field,label])=><label key={field}>{label} <select value={filters[field]??''} onChange={e=>setFilters({...filters,[field]:e.target.value})}><option value="">All</option>{[...new Set(all.map(r=>r[field]).filter(Boolean))].map(v=><option key={v} value={v}>{asLabel(v)}</option>)}</select></label>)}</div>
 <p className="muted">Method {focus.method_version} · {focus.n_trials==null?'Attempt count not reported':focus.n_trials+' recorded trial(s)'}. Each cohort fixes dataset, split, harness and runtime constraints.</p>
 <div className="panel mt-4"><Rows rows={rows}/></div></>;
}
function AgentScores({slug}){
 const [rows,setRows]=useState(null),[error,setError]=useState(false);
 useEffect(()=>{
  const ctrl=new AbortController();
  allRows('v_published_scores',{select:'*',agent_slug:'eq.'+slug,order:'benchmark_slug,dataset_version.desc,verified.desc,normalized_score.desc.nullslast,run_id,metric'},ctrl.signal)
    .then(setRows).catch(()=>{if(!ctrl.signal.aborted)setError(true);});
  return()=>ctrl.abort();
 },[slug]);
 return <section className="panel"><h2>Published benchmark runs</h2>{rows?<Rows rows={rows}/>:<Empty>{error?'Results could not be loaded.':'Loading results…'}</Empty>}</section>;
}
function Directory({items,id,type,leaders}){
 const [search,setSearch]=useState('');
 const scored=new Set(leaders.map(row=>row.agent_slug));
 if(id){
   const item=items.find(r=>r.slug===id);
   if(!item)return <Empty>This entry is unavailable.</Empty>;
   return <><div className="hero"><h1>{item.name}</h1><p>{item.description??asLabel(item.category??item.domain)}</p><p className="actions">{external(item.homepage_url??item.paper_url,'Website')}{external(item.repo_url,'Repository')}{type==='agents'&&<a className="link" href={go('compare',item.slug)}>Compare this agent</a>}{item.contamination_risk&&<span>Contamination risk {item.contamination_risk}</span>}</p></div>
   {type==='agents'?<><Versions key={item.id} id={item.id}/><AgentScores key={item.slug} slug={item.slug}/></>:<div className="panel"><Rows rows={leaders.filter(r=>r.benchmark_slug===id)}/></div>}</>;
 }
 return <><h1>{type==='agents'?'Agent registry':'Benchmark registry'}</h1><div className="filters"><input type="search" aria-label="Search registry" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search registry"/></div><div className="grid-cards">{items.filter(x=>x.name.toLowerCase().includes(search.toLowerCase())).map(item=><article className="card" key={item.id}><h2><a href={go(type,item.slug)}>{item.name}</a></h2><p className="muted">{asLabel(item.category??item.domain)}</p>{type==='agents'&&<span className="badge">{scored.has(item.slug)?'Benchmark results':'No published score'}</span>}<p>{item.description}</p></article>)}</div>{!items.length&&<Empty>Reviewed entries will appear here.</Empty>}</>;
}
function Versions({id}){
 const [rows,setRows]=useState([]);
 useEffect(()=>{const ctrl=new AbortController();request('/rest/v1/agent_versions',{query:{agent_id:'eq.'+id,select:'id,version_label,underlying_model,release_date,notes',order:'release_date.desc.nullslast,version_label',limit:50},signal:ctrl.signal}).then(setRows).catch(()=>{});return()=>ctrl.abort();},[id]);
 return <section className="panel mb-4"><h2>Versions</h2>{rows.length?rows.map(r=><p key={r.id}><b>{r.version_label}</b> · {r.underlying_model??'Model undisclosed'} · {r.release_date??'Date unavailable'} {r.notes}</p>):<p className="muted">No evaluation configurations published.</p>}</section>;
}
function Run({id}){
 const [result,setResult]=useState(null),[error,setError]=useState('');
 useEffect(()=>{const ctrl=new AbortController();if(!/^[a-f0-9-]{36}$/i.test(id))return;
  const get=(table,query)=>request('/rest/v1/'+table,{query,signal:ctrl.signal});
  Promise.all([get('v_published_scores',{run_id:'eq.'+id,select:'*',limit:40}),get('v_run_evidence',{run_id:'eq.'+id,select:'*',order:'attempt,task',limit:500})]).then(setResult).catch(e=>{if(!ctrl.signal.aborted)setError(e.message);});return()=>ctrl.abort();},[id]);
 if(error)return <Empty>{error}</Empty>;
 if(!/^[a-f0-9-]{36}$/i.test(id))return <Empty>Invalid run identifier.</Empty>;
 if(!result)return <Empty>Loading run evidence…</Empty>;
 const [scores,evidence]=result;
 if(!scores.length)return <Empty>This run is unpublished or unavailable.</Empty>;
 const current=scores[0], release=/release-(\d+)$/.exec(current.version_label);
 const demo=current.benchmark_slug==='support-operations'&&release?'/demo/index.html?'+new URLSearchParams({agent:current.agent_slug.replace(/^support-/,''),release:Number(release[1])-1})+'#evidence':null;
 return <><h1>Run details</h1><div className="panel"><Rows rows={scores}/><p className="muted">Retrieved {scores[0].retrieved_at} · {scores[0].harness}</p><pre>{JSON.stringify(scores[0].constraints,null,2)}</pre></div><section className="panel mt-4"><h2>Task evidence</h2>{evidence.length?evidence.map(row=><details key={row.task+'/'+row.attempt}><summary>{row.task} · Attempt {row.attempt} · {row.passed?'Passed':row.failure_category??'Failed'}</summary><pre>{JSON.stringify(row.trace,null,2)}</pre></details>):demo?<a className="link" href={demo}>Open reproducible task evidence</a>:<p className="muted">No task traces have been released for this run.</p>}</section></>;
}
function PeerGroups({data}){
 const [group,setGroup]=useState('');
 const rows=data.peers.filter(r=>r.peer_group===group).map(r=>({...data.leaders.find(x=>x.run_id===r.run_id&&x.metric===r.metric),...r}));
 const cohorts=Map.groupBy(rows,cohort);
 return <><h1>Peer groups</h1><div className="filters"><select aria-label="Peer group" value={group} onChange={e=>setGroup(e.target.value)}><option value="">Select a peer group</option>{data.groups.map(x=><option key={x.id}>{x.name}</option>)}</select></div>
 {!cohorts.size?<Empty>No verified peer scores for this selection.</Empty>:[...cohorts].map(([k,v])=><section className="panel mb-4" key={k}><h2>{v[0].benchmark} · {v[0].metric}</h2><p className="muted">{v[0].dataset_version}/{v[0].dataset_split} · {v[0].harness}</p><Rows rows={v} peer/></section>)}</>;
}
function Review({admin=false}){
 const [session,setSession]=useState(''),[notice,setNotice]=useState(''),[entries,setEntries]=useState([]);
 async function act(e){
  e.preventDefault();const form=new FormData(e.currentTarget);setNotice('');
  try{
   if(!session){
    const result=await request('/auth/v1/token',{query:{grant_type:'password'},method:'POST',body:{email:form.get('email'),password:form.get('password')}});
    setSession(result.access_token);
    if(admin){
     const reviewers=await request('/rest/v1/benchmark_reviewers',{token:result.access_token,query:{select:'user_id',limit:1}});
     if(!reviewers.length){setNotice('Reviewer access is required.');return;}
     setEntries(await request('/rest/v1/benchmark_submissions',{token:result.access_token,query:{select:'id,kind,details,status',status:'eq.pending',order:'created_at',limit:50}}));
    }
   }else{
    const status=form.get('decision');
    if(admin){await request('/rest/v1/benchmark_submissions',{token:session,method:'PATCH',query:{id:'eq.'+form.get('id'),status:'eq.pending'},body:{status}});setEntries(entries.filter(x=>x.id!==form.get('id')));setNotice('Review decision submitted.');}
    else {await request('/rest/v1/benchmark_submissions',{token:session,method:'POST',body:{kind:form.get('kind'),details:{description:form.get('details'),source_url:form.get('url')}}});setNotice('Sent to the review queue.');}
   }
  }catch(error){setNotice(error.message);}
 }
 return <><h1>{admin?'Review queue':'Submit for review'}</h1><p role="status">{notice}</p>{!session?<form className="panel stack" onSubmit={act}><p>Sign in with an existing Supabase account.</p><label>Email <input name="email" type="email" required autoComplete="username"/></label><label>Password <input name="password" type="password" required autoComplete="current-password"/></label><button className="primary">Sign in</button></form>:admin?entries.length?entries.map(row=><form className="panel stack mb-3" key={row.id} onSubmit={act}><input name="id" type="hidden" value={row.id}/><h2>{row.kind}</h2><pre>{JSON.stringify(row.details,null,2)}</pre><select name="decision" aria-label="Review decision"><option value="accepted">Accept</option><option value="rejected">Reject</option></select><button>Save review</button></form>):<Empty>No pending submissions.</Empty>:<form className="panel stack" onSubmit={act}><label>Submission type <select name="kind"><option value="agent">Agent</option><option value="result">Result</option><option value="dispute">Dispute</option></select></label><label>Source URL <input name="url" type="url" required/></label><label>Details <textarea name="details" required maxLength={4000}/></label><button className="primary">Submit</button></form>}</>;
}
function Method(){return <><h1>Methodology</h1><div className="panel stack"><p>Agents are versioned systems. A score links to its source and run protocol. Candidate entries and raw submissions are private until reviewed.</p><p>Normalize each metric within documented bounds. Comparisons require identical benchmark, split, dataset version, harness, trial count, method version and constraints. The dashboard shows whether the reported confidence intervals overlap. That alone is not a significance test.</p><p>Wilson intervals require known binary outcomes and a task count. Missing confidence intervals, cost, or other dimensions stay unavailable. Sponsored results must follow the same protocol.</p><p><a className="link" href={go('submit')}>Submit a correction or dispute</a></p></div></>;}
export default function Page(){
 const [view,setView]=useState(['home','']),[data,setData]=useState(null),[error,setError]=useState('');
 useEffect(()=>{const update=()=>{const [page,id='']=location.hash.slice(1).split('/');let parsed='';try{parsed=decodeURIComponent(id);}catch{}setView([page||'home',parsed]);};update();addEventListener('hashchange',update);return()=>removeEventListener('hashchange',update);},[]);
 useEffect(()=>{const ctrl=new AbortController();catalog(ctrl.signal).then(setData).catch(e=>{if(!ctrl.signal.aborted)setError(e.message);});return()=>ctrl.abort();},[]);
 const [page,id]=view;
 let content;
 if(page==='method')content=<Method/>;
 else if(page==='submit'||page==='admin')content=<Review key={page} admin={page==='admin'}/>;
 else if(page==='runs')content=<Run key={id} id={id}/>;
 else if(!data)content=<Empty>{error?'Registry data is unavailable.':'Loading registry…'} <a className="link" href="/demo/index.html">Open support benchmark</a>.</Empty>;
 else if(page==='agents'||page==='benchmarks')content=<Directory key={page} items={data[page]} id={id} type={page} leaders={data.leaders}/>;
 else if(page==='compare')content=<HeadToHead key={id} initial={id} agents={data.agents} leaders={data.leaders} tradeoffs={rows=><Tradeoffs key={rows[0].run_id} rows={rows}/>}/>;
 else if(page==='peers')content=<PeerGroups data={data}/>;
 else content=<><section className="hero"><h1>Benchmark agent systems.</h1><p className="sub">Compare versioned agents under the same conditions and follow each score back to its evidence.</p><div className="actions"><a className="button primary" href={go('compare')}>Compare agents</a><a className="button" href={go('agents')}>Explore agents</a><a className="button" href="/demo/index.html">Run support benchmark</a></div><p className="muted">{data.agents.length} registered agents · {new Set(data.leaders.map(r=>r.agent_slug)).size} with published scores</p></section><h2>Leaderboard</h2><Cohort data={data}/></>;
 return <><header className="top"><div className="shell nav"><a className="brand" href={go('home')}><span className="mark">A</span>AgentBench</a><nav aria-label="Main navigation">{tabs.map(([key,label])=><a href={go(key)} key={key} aria-current={page===key?'page':undefined}>{label}</a>)}</nav></div></header><main className="shell">{content}</main><footer className="shell foot">AgentBench Observatory · <a className="link" href="/demo/index.html">Support benchmark and run logs</a></footer></>;
}
