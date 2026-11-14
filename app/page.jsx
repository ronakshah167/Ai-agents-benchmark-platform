'use client';
import {useEffect,useState} from 'react';
import {CartesianGrid,ResponsiveContainer,Scatter,ScatterChart,Tooltip,XAxis,YAxis} from 'recharts';
import {allRows,catalog,cohort,number,request,safeUrl} from './data.mjs';
import HeadToHead from './head-to-head.jsx';
import {BackToTop, Loading, PreferencesControls, PreferencesProvider, usePreferences} from './preferences.jsx';
import {faqs, tourStops} from './translations.mjs';
import Character from './character.jsx';
import SiteTour, {rememberTour, shouldStartTour} from './site-tour.jsx';

const tabs=[['leaderboard','Leaderboard'],['agents','Agents'],['benchmarks','Benchmarks'],['compare','Compare'],['peers','Peer groups'],['method','Methodology'],['faq','FAQs']];
const go=(path,id='')=>'#'+path+(id?'/'+encodeURIComponent(id):'');
const asLabel=value=>value?.replaceAll('_',' ')??'—';
const interval=r=>r.ci_low==null||r.ci_high==null?'—':number(r.ci_low)+'–'+number(r.ci_high);
const external=(url,label)=>safeUrl(url)?<a className="link" href={safeUrl(url)}>{label}</a>:null;
function Empty({children}){const {t}=usePreferences();return <p className="panel empty">{typeof children==='string'?t(children):children}</p>;}
function Rows({rows,peer=false}){
 const {t}=usePreferences();
 return rows.length?<div className="table-scroll" tabIndex={0}><table><thead><tr><th>{t('Agent')}</th><th>{t('Benchmark / metric')}</th><th>{t('Raw')}</th><th>{t('Score / 100')}</th><th>95% CI</th><th>{t('Provenance')}</th>{peer&&<th>{t('Peer percentile')}</th>}</tr></thead><tbody>
 {rows.map(r=><tr key={[r.run_id,r.metric,r.peer_group].join('/')}><td><a className="link" href={go('agents',r.agent_slug)}>{r.agent}</a><br/><span className="muted">{r.version_label}</span></td><td>{r.benchmark}<br/><span className="muted">{r.metric} · {r.dataset_version}</span></td><td>{number(r.raw_value)}</td><td>{number(r.normalized_score)}</td><td>{interval(r)}</td><td><a className="link" href={go('runs',r.run_id)}>{t('Run details')}</a> · {external(r.source_url,t('Source'))}<br/><span className="badge">{r.verified?(t(r.run_type==='platform_run'?'Platform run':'Benchmark-published')):asLabel(r.run_type)}</span></td>{peer&&<td>{r.cohort_size>1?number(r.peer_percentile):'—'} ({r.cohort_size})</td>}</tr>)}
 </tbody></table></div>:<Empty>No published results match this selection.</Empty>;
}
function Tradeoffs({rows}){
 const {t}=usePreferences();
 const points=rows.filter(row=>row.metric==='success_pct'&&row.sample_size>0&&row.raw_value>0&&row.total_cost_usd!=null)
  .map(row=>({agent:row.agent,cost:Number((row.total_cost_usd/(row.sample_size*row.raw_value/100)).toFixed(4)),score:row.normalized_score}));
 if(points.length<2)return null;
 const frontier=points.filter(p=>!points.some(q=>q.cost<=p.cost&&q.score>=p.score&&(q.cost<p.cost||q.score>p.score)));
 return <section className="panel mt-4"><h2>{t('Score versus cost per successful task')}</h2><p className="muted">{rows[0].constraints?.tool_cost==='simulated'?t('Simulated tool costs.')+' ':''}{t('Pareto frontier {agents}.',{agents:frontier.map(p=>p.agent).join(', ')})}</p>
 <div style={{height:250}}><ResponsiveContainer width="100%" height="100%"><ScatterChart margin={{top:15,right:16,bottom:15,left:10}}><CartesianGrid stroke="var(--rule)"/><XAxis type="number" dataKey="cost" name={t('Cost / success')} tickFormatter={v=>'$'+v}/><YAxis type="number" dataKey="score" name={t('Score')} domain={[0,100]}/><Tooltip cursor={{strokeDasharray:'3 3'}}/><Scatter data={points} fill="var(--accent)"/></ScatterChart></ResponsiveContainer></div>
 <details><summary>{t('Chart data')}</summary>{points.map(p=><p key={p.agent}>{p.agent} · {number(p.score)} / 100 · ${p.cost}</p>)}</details></section>;
}
function Cohort({data}){
 const {t}=usePreferences();
 const [chosen,setChosen]=useState(''),[filters,setFilters]=useState({});
 const groups=Map.groupBy(data.leaders,cohort);
 const key=groups.has(chosen)?chosen:[...groups].find(([,rows])=>rows[0].benchmark_slug==='terminal-bench'&&rows[0].dataset_version==='4.1')?.[0]??groups.keys().next().value;
 if(!key)return <Empty>{t('There are no published scores yet.')} <a className="link" href="/demo/index.html">{t('Open support benchmark')}</a></Empty>;
 const all=groups.get(key);
 const fields=[['category','Category'],['form_factor','Form factor'],['license_type','License'],['price_tier','Price tier']];
 const rows=all.filter(r=>fields.every(([field])=>!filters[field]||r[field]===filters[field]));
 const focus=all[0];
 return <><div className="filters" id="tour-leaderboard"><label>{t('Comparable cohort')} <select value={key} onChange={e=>{setChosen(e.target.value);setFilters({});}}>
 {[...groups].map(([id,[r]],i)=><option key={id} value={id}>{r.benchmark} · {r.metric} · {r.dataset_version}/{r.dataset_split} · {r.harness} · {i+1}</option>)}</select></label>
 {fields.map(([field,label])=><label key={field}>{t(label)} <select value={filters[field]??''} onChange={e=>setFilters({...filters,[field]:e.target.value})}><option value="">{t('All')}</option>{[...new Set(all.map(r=>r[field]).filter(Boolean))].map(v=><option key={v} value={v}>{asLabel(v)}</option>)}</select></label>)}</div>
 <p className="muted">{t('Method {version} · {trials}. Each cohort fixes dataset, split, harness and runtime constraints.',{version:focus.method_version,trials:focus.n_trials==null?t('Attempt count not reported'):t('{count} recorded trial(s)',{count:focus.n_trials})})}</p>
 <div className="panel mt-4"><Rows rows={rows}/></div></>;
}
function AgentScores({slug}){
 const {t}=usePreferences();
 const [rows,setRows]=useState(null),[error,setError]=useState(false);
 useEffect(()=>{
  const ctrl=new AbortController();
  allRows('v_published_scores',{select:'*',agent_slug:'eq.'+slug,order:'benchmark_slug,dataset_version.desc,verified.desc,normalized_score.desc.nullslast,run_id,metric'},ctrl.signal)
    .then(setRows).catch(()=>{if(!ctrl.signal.aborted)setError(true);});
  return()=>ctrl.abort();
 },[slug]);
 return <section className="panel"><h2>{t('Published benchmark runs')}</h2>{rows?<Rows rows={rows}/>:error?<p className="empty">{t('Results could not be loaded.')}</p>:<Loading label="Loading results…"/>}</section>;
}
function Directory({items,id,type,leaders}){
 const {t}=usePreferences();
 const [search,setSearch]=useState('');
 const visible=items.filter(item=>item.name.toLowerCase().includes(search.trim().toLowerCase()));
 const scored=new Set(leaders.map(row=>row.agent_slug));
 if(id){
   const item=items.find(r=>r.slug===id);
   if(!item)return <Empty>This entry is unavailable.</Empty>;
   return <><div className="hero"><h1>{item.name}</h1><p>{item.description??asLabel(item.category??item.domain)}</p><p className="actions">{external(item.homepage_url??item.paper_url,t('Website'))}{external(item.repo_url,t('Repository'))}{type==='agents'&&<a className="link" href={go('compare',item.slug)}>{t('Compare this agent')}</a>}{item.contamination_risk&&<span>{t('Contamination risk {risk}',{risk:item.contamination_risk})}</span>}</p></div>
   {type==='agents'?<><Versions key={item.id} id={item.id}/><AgentScores key={item.slug} slug={item.slug}/></>:<div className="panel"><Rows rows={leaders.filter(r=>r.benchmark_slug===id)}/></div>}</>;
 }
 return <><h1>{t(type==='agents'?'Agent registry':'Benchmark registry')}</h1><div className="filters" id={type==='agents'?'tour-registry':undefined}><input type="search" aria-label={t('Search registry')} value={search} onChange={e=>setSearch(e.target.value)} placeholder={t('Search registry')}/></div><div className="grid-cards">{visible.map(item=><article className="card" key={item.id}><h2><a href={go(type,item.slug)}>{item.name}</a></h2><p className="muted">{asLabel(item.category??item.domain)}</p>{type==='agents'&&<span className="badge">{t(scored.has(item.slug)?'Benchmark results':'No published score')}</span>}<p>{item.description}</p></article>)}</div>{!visible.length&&<Empty>{items.length?'No entries match this search.':'Reviewed entries will appear here.'}</Empty>}</>;
}
function Versions({id}){
 const {t}=usePreferences();
 const [rows,setRows]=useState(null),[failed,setFailed]=useState(false);
 useEffect(()=>{const ctrl=new AbortController();request('/rest/v1/agent_versions',{query:{agent_id:'eq.'+id,select:'id,version_label,underlying_model,release_date,notes',order:'release_date.desc.nullslast,version_label',limit:50},signal:ctrl.signal}).then(setRows).catch(()=>{if(!ctrl.signal.aborted)setFailed(true);});return()=>ctrl.abort();},[id]);
 return <section className="panel mb-4"><h2>{t('Versions')}</h2>{failed?<p className="empty">{t('Results could not be loaded.')}</p>:rows==null?<Loading label="Loading configurations…"/>:rows.length?rows.map(r=><p key={r.id}><b>{r.version_label}</b> · {r.underlying_model??t('Model undisclosed')} · {r.release_date??t('Date unavailable')} {r.notes}</p>):<p className="muted">{t('No evaluation configurations published.')}</p>}</section>;
}
function Run({id}){
 const {t}=usePreferences();
 const [result,setResult]=useState(null),[error,setError]=useState('');
 useEffect(()=>{const ctrl=new AbortController();if(!/^[a-f0-9-]{36}$/i.test(id))return;
  const get=(table,query)=>request('/rest/v1/'+table,{query,signal:ctrl.signal});
  Promise.all([get('v_published_scores',{run_id:'eq.'+id,select:'*',limit:40}),get('v_run_evidence',{run_id:'eq.'+id,select:'*',order:'attempt,task',limit:500})]).then(setResult).catch(e=>{if(!ctrl.signal.aborted)setError(e.message);});return()=>ctrl.abort();},[id]);
 if(error)return <Empty>{error}</Empty>;
 if(!/^[a-f0-9-]{36}$/i.test(id))return <Empty>Invalid run identifier.</Empty>;
 if(!result)return <Loading label="Loading run evidence…"/>;
 const [scores,evidence]=result;
 if(!scores.length)return <Empty>This run is unpublished or unavailable.</Empty>;
 const current=scores[0], release=/release-(\d+)$/.exec(current.version_label);
 const demo=current.benchmark_slug==='support-operations'&&release?'/demo/index.html?'+new URLSearchParams({agent:current.agent_slug.replace(/^support-/,''),release:Number(release[1])-1})+'#evidence':null;
 return <><h1>{t('Run details')}</h1><div className="panel"><Rows rows={scores}/><p className="muted">{t('Retrieved {date}',{date:scores[0].retrieved_at})} · {scores[0].harness}</p><pre>{JSON.stringify(scores[0].constraints,null,2)}</pre></div><section className="panel mt-4"><h2>{t('Task evidence')}</h2>{evidence.length?evidence.map(row=><details key={row.task+'/'+row.attempt}><summary>{row.task} · {t('Attempt {count}',{count:row.attempt})} · {row.passed?t('Passed'):row.failure_category??t('Failed')}</summary><pre>{JSON.stringify(row.trace,null,2)}</pre></details>):demo?<a className="link" href={demo}>{t('Open reproducible task evidence')}</a>:<p className="muted">{t('No task traces have been released for this run.')}</p>}</section></>;
}
function PeerGroups({data}){
 const {t}=usePreferences();
 const [group,setGroup]=useState('');
 const rows=data.peers.filter(r=>r.peer_group===group).map(r=>({...data.leaders.find(x=>x.run_id===r.run_id&&x.metric===r.metric),...r}));
 const cohorts=Map.groupBy(rows,cohort);
 return <><h1>{t('Peer groups')}</h1><div className="filters"><select aria-label={t('Peer group')} value={group} onChange={e=>setGroup(e.target.value)}><option value="">{t('Select a peer group')}</option>{data.groups.map(x=><option key={x.id}>{x.name}</option>)}</select></div>
 {!cohorts.size?<Empty>No verified peer scores for this selection.</Empty>:[...cohorts].map(([k,v])=><section className="panel mb-4" key={k}><h2>{v[0].benchmark} · {v[0].metric}</h2><p className="muted">{v[0].dataset_version}/{v[0].dataset_split} · {v[0].harness}</p><Rows rows={v} peer/></section>)}</>;
}
function Review({admin=false}){
 const {t}=usePreferences();
 const [session,setSession]=useState(''),[notice,setNotice]=useState(''),[entries,setEntries]=useState([]);
 async function act(e){
  e.preventDefault();const form=new FormData(e.currentTarget);setNotice('');
  try{
   if(!session){
    const result=await request('/auth/v1/token',{query:{grant_type:'password'},method:'POST',body:{email:form.get('email'),password:form.get('password')}});
    if(admin){
     const reviewers=await request('/rest/v1/benchmark_reviewers',{token:result.access_token,query:{select:'user_id',limit:1}});
     if(!reviewers.length){setNotice('Reviewer access is required.');return;}
     setEntries(await request('/rest/v1/benchmark_submissions',{token:result.access_token,query:{select:'id,kind,details,status',status:'eq.pending',order:'created_at',limit:50}}));
    }
    setSession(result.access_token);
   }else{
    const status=form.get('decision');
    if(admin){await request('/rest/v1/benchmark_submissions',{token:session,method:'PATCH',query:{id:'eq.'+form.get('id'),status:'eq.pending'},body:{status}});setEntries(entries.filter(x=>x.id!==form.get('id')));setNotice('Review decision submitted.');}
    else {await request('/rest/v1/benchmark_submissions',{token:session,method:'POST',body:{kind:form.get('kind'),details:{description:form.get('details'),source_url:form.get('url')}}});setNotice('Sent to the review queue.');}
   }
  }catch(error){setNotice(error.message);}
 }
 return <><h1>{t(admin?'Review queue':'Submit for review')}</h1><p role="status">{t(notice)}</p>{!session?<form className="panel stack" onSubmit={act}><p>{t('Sign in with an existing Supabase account.')}</p><label>{t('Email')} <input name="email" type="email" required autoComplete="username"/></label><label>{t('Password')} <input name="password" type="password" required autoComplete="current-password"/></label><button className="primary">{t('Sign in')}</button></form>:admin?entries.length?entries.map(row=><form className="panel stack mb-3" key={row.id} onSubmit={act}><input name="id" type="hidden" value={row.id}/><h2>{row.kind}</h2><pre>{JSON.stringify(row.details,null,2)}</pre><select name="decision" aria-label={t('Review decision')}><option value="accepted">{t('Accept')}</option><option value="rejected">{t('Reject')}</option></select><button>{t('Save review')}</button></form>):<Empty>No pending submissions.</Empty>:<form className="panel stack" onSubmit={act}><label>{t('Submission type')} <select name="kind"><option value="agent">{t('Agent')}</option><option value="result">{t('Result')}</option><option value="dispute">{t('Dispute')}</option></select></label><label>{t('Source URL')} <input name="url" type="url" required/></label><label>{t('Details')} <textarea name="details" required maxLength={4000}/></label><button className="primary">{t('Submit')}</button></form>}</>;
}
function Method(){
 const {t}=usePreferences();return <><h1>{t('Methodology')}</h1><div className="panel stack"><p>{t('Agents are versioned systems. A score links to its source and run protocol. Candidate entries and raw submissions are private until reviewed.')}</p><p>{t('Normalize each metric within documented bounds. Comparisons require identical benchmark, split, dataset version, harness, trial count, method version and constraints. The dashboard shows whether the reported confidence intervals overlap. That alone is not a significance test.')}</p><p>{t('Wilson intervals require known binary outcomes and a task count. Missing confidence intervals, cost, or other dimensions stay unavailable. Sponsored results must follow the same protocol.')}</p><p><a className="link" href={go('submit')}>{t('Submit a correction or dispute')}</a></p></div></>;}
function Faq({onStartTour}) {
 const {t}=usePreferences();
 return <><header className="hero"><h1>{t('FAQs')}</h1><p className="sub">{t('Find an agent, compare results, and check the evidence.')}</p><div className="actions"><button type="button" className="primary" onClick={onStartTour}>{t('Take the tour')}</button></div></header><section className="panel faq-list" id="tour-faq">
   {faqs.map(([question,answer,destination,label])=><details key={question}><summary>{t(question)}</summary><p>{t(answer)}{destination && <> <a className="link" href={go(destination)}>{t(label)}</a></>}</p></details>)}
 </section></>;
}

function Home({data,onStartTour}) {
 const {t}=usePreferences();
 return <><section className="hero dashboard-hero" id="tour-welcome"><div className="hero-copy"><h1>{t('Benchmark AI agents')}</h1><p className="sub">{t('Compare versioned agents under the same conditions and follow each score back to its evidence.')}</p><div className="actions"><a className="button primary" href={go('compare')}>{t('Compare agents')} <span aria-hidden="true">→</span></a><a className="button" href={go('agents')}>{t('Explore agents')}</a><a className="link" href="/demo/index.html">{t('Support simulator')}</a><button type="button" onClick={onStartTour}>{t('Take the tour')}</button></div></div>
   <dl className="hero-stats"><div><dt>{t('Registered agents')}</dt><dd>{data?.agents.length??'—'}</dd></div><div><dt>{t('Agents with scores')}</dt><dd>{data?new Set(data.leaders.map(r=>r.agent_slug)).size:'—'}</dd></div></dl>
 </section><section className="panel"><h2>{t('Compare systems, not just models')}</h2><p>{t('Each agent combines a model, tools, prompts, memory and runtime limits. Open the leaderboard for published scores, choose two agents to compare, or inspect a run to see its source and conditions.')}</p><div className="actions"><a className="button primary" href="#leaderboard">{t('Leaderboard')}</a><a className="link" href="#method">{t('Methodology')}</a></div><p className="muted">{t('The support simulator is a learning lab with scripted agents and simulated costs, not a ranking of real commercial agents.')}</p></section></>;
}

function Dashboard(){
 const {t,openCookies}=usePreferences();
 const [attempt,retry]=useState(0);
 const [tourStep,setTourStep]=useState(null);
 const [view,setView]=useState(['home','']),[data,setData]=useState(null),[error,setError]=useState('');
 useEffect(()=>{const update=()=>{const [page,id='']=location.hash.slice(1).split('/');let parsed='';try{parsed=decodeURIComponent(id);}catch{}setView([page||'home',parsed]);};update();addEventListener('hashchange',update);return()=>removeEventListener('hashchange',update);},[]);
 useEffect(()=>{const ctrl=new AbortController();catalog(ctrl.signal).then(setData).catch(e=>{if(!ctrl.signal.aborted)setError(e.message);});return()=>ctrl.abort();},[attempt]);
 useEffect(()=>{if(shouldStartTour())setTourStep(0);},[]);
 const [page,id]=view;
 useEffect(()=>{
   const names={home:'AI agent benchmarks',leaderboard:'Leaderboard',agents:'Agent registry',benchmarks:'Benchmarks',compare:'Compare agents',peers:'Peer groups',method:'Methodology',faq:'FAQs',runs:'Run details',submit:'Submit for review',admin:'Reviewer sign-in'};
   const entry=data?.[page]?.find?.(item=>item.slug===id);
   document.title=(entry?.name??names[page]??'Page not found')+' | Bifrost';
 },[page,id,data]);

 function moveTour(step) {
   const destination=go(tourStops[step].page);
   if(location.hash!==destination)location.hash=destination;
   setTourStep(step);
 }
 function closeTour() {
   rememberTour();
   setTourStep(null);
   requestAnimationFrame(()=>document.getElementById('main-content')?.focus({preventScroll:true}));
 }
 let content;
 if(page==='faq')content=<Faq onStartTour={()=>moveTour(0)}/>;
 else if(page==='method')content=<Method/>;
 else if(page==='submit'||page==='admin')content=<Review key={page} admin={page==='admin'}/>;
 else if(page==='runs')content=<Run key={id} id={id}/>;
 else if(page==='home')content=<><Home data={data} onStartTour={()=>moveTour(0)}/>{error&&<section className="panel mt-4" role="alert"><p>{t('Registry data is unavailable.')}</p><button onClick={()=>{setError('');retry(value=>value+1);}}>{t('Retry')}</button></section>}</>;
 else if(!data)content=error?<section className="panel empty" role="alert"><h1>{t('Registry data is unavailable.')}</h1><p>{t('The data service did not respond. Retry, or use the local support simulator while it reconnects.')}</p><div className="actions">
   <button onClick={()=>{setError('');retry(value=>value+1);}}>{t('Retry')}</button><a className="link" href="/demo/index.html">{t('Open support benchmark')}</a></div></section>:<Loading label="Loading registry…"/>;
 else if(page==='agents'||page==='benchmarks')content=<Directory key={page} items={data[page]} id={id} type={page} leaders={data.leaders}/>;
 else if(page==='compare')content=<HeadToHead key={id} initial={id} agents={data.agents} leaders={data.leaders} tradeoffs={rows=><Tradeoffs key={rows[0].run_id} rows={rows}/>}/>;
 else if(page==='peers')content=<PeerGroups data={data}/>;
 else if(page==='leaderboard')content=<><h1>{t('Leaderboard')}</h1><Cohort data={data}/></>;
 else content=<Empty>This page is unavailable. Use the navigation to return to Bifrost.</Empty>;
 return <>
   <button className="skip-link" onClick={()=>document.getElementById('main-content').focus()}>{t('Skip to content')}</button>
   <header className="top" id="site-header" tabIndex={-1}><div className="shell nav">
     <a className="brand" href={go('home')}><span className="mark" aria-hidden="true">B</span>Bifrost</a>
     <nav aria-label={t('Main navigation')}>{tabs.map(([key,label])=><a href={go(key)} key={key} aria-current={page===key?'page':undefined}>{t(label)}</a>)}</nav>
     <PreferencesControls/>
   </div></header>
   <main className="shell" id="main-content" tabIndex={-1}>{content}</main>
   <footer className="shell foot"><span>Bifrost · Agent benchmarks</span><div><a href="/demo/index.html">{t('Support simulator · scripted demo')}</a><a href={go('submit')}>{t('Submit')}</a><button onClick={openCookies}>{t('Cookie preferences')}</button></div></footer>
   <BackToTop/>
   {tourStep===null && <button className="pip-launcher" onClick={()=>moveTour(0)} aria-label={t('Take the tour')}><Character/><span>{t('Pip · Your guide')}</span></button>}
   <SiteTour step={tourStep} page={page} ready={Boolean(data)} onMove={moveTour} onClose={closeTour}/>
 </>;
}

export default function Page(){
 return <PreferencesProvider><Dashboard/></PreferencesProvider>;
}
