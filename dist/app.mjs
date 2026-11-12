import {aggregate,runBaseline,snapshot} from './engine.mjs';
import {supabase} from './config.mjs';
import {copy} from './copy.mjs';
import {readReports} from './import.mjs';
import {runAttempts,passAll} from './evidence.mjs';
import {evidenceCopy,evidenceList,pairedView,taskRows} from './evidence-view.mjs';

const $=id=>document.getElementById(id);
const cookie=key=>document.cookie.split('; ').find(part=>part.startsWith(key+'='))?.split('=')[1];
function setCookie(key,value,maxAge=15552000){
  document.cookie=key+'='+value+'; Path=/; SameSite=Lax; Max-Age='+maxAge+(location.protocol==='https:'?'; Secure':'');
}
const preference=cookie('ab_consent')==='yes';
const state={lang:preference&&cookie('ab_lang')==='hi'?'hi':'en',theme:preference&&['dark','light'].includes(cookie('ab_theme'))?cookie('ab_theme'):(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'),consent:preference,ids:['relay','atlas'],scenario:'all',release:null,search:'',sort:'success_pct',direction:-1,focus:'atlas',logAgent:'quill',attempt:0,outcome:'failed',data:null,origin:'baseline'};
const labels=()=>({...copy[state.lang],...evidenceCopy[state.lang]});
let original;
const e=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const routes=['overview','compare','trends','evidence','faq'];
const route=()=>routes.includes(location.hash.slice(1))?location.hash.slice(1):'overview';
const metrics=[['success_pct','success'],['policy_pct','policy'],['p95_ms','latency'],['cost_usd','cost'],['tool_calls','tools']];
const lower=new Set(['p95_ms','cost_usd','tool_calls']);
const agent=id=>state.data.agents.find(a=>a.id===id);
const release=()=>state.release??Math.max(...state.data.runs.map(r=>r.release));
const scope=run=>state.scenario==='all'?run:run.breakdown.find(s=>s.scenario_id===state.scenario);
const runFor=id=>state.data.runs.find(r=>r.release===release()&&r.agent_id===id);
const pct=v=>v.toFixed(1).replace(/\.0$/,'')+'%';
const display=(key,v)=>v==null?'—':key.endsWith('_pct')?pct(v):key==='p95_ms'?(v/1000).toFixed(2)+' s':key==='cost_usd'?'$'+v.toFixed(4):String(v);
const opt=(value,name,selected)=>'<option value="'+e(value)+'"'+(value===selected?' selected':'')+'>'+e(name)+'</option>';
const tag=(value,type='')=>'<span class="tag '+type+'">'+e(value)+'</span>';
const title=(title,sub)=>'<header class="page-title"><span class="kicker">'+labels().suiteName+'</span><h1>'+title+'</h1><p>'+sub+'</p></header>';
const links=[['SWE-bench','https://github.com/SWE-bench/SWE-bench'],['OSWorld','https://github.com/xlang-ai/OSWorld'],['τ-bench','https://github.com/sierra-research/tau2-bench'],['Inspect AI','https://github.com/UKGovernmentBEIS/inspect_ai']];

function chrome(){
  const t=labels();
  document.documentElement.lang=state.lang;
  document.documentElement.dataset.theme=state.theme;
  $('language').value=state.lang;
  $('theme').setAttribute('aria-label',t.theme);
  $('theme').textContent=state.theme==='dark'?'☀':'☾';
  $('back').setAttribute('aria-label',t.back);
  $('nav').innerHTML=routes.map(r=>'<a href="#'+r+'"'+(route()===r?' aria-current="page"':'')+'>'+t[r]+'</a>').join('');
  $('footer').innerHTML='<span>AgentBench Observatory · '+t.suiteName+' v'+e(state.data?.suite.version??'1.0.0')+'</span><div class="actions"><a href="#faq">'+t.methods+'</a><button type="button" data-action="cookies">'+t.cookie+'</button></div>';
}

function filters(withSearch=false,withRelease=true){
  const t=labels(), ids=Array.from(new Set(state.data.runs.map(r=>r.release))).sort((a,b)=>b-a);
  return '<div class="filters">'+(withSearch?'<input class="search" id="search" aria-label="'+t.search+'" placeholder="'+t.search+'" value="'+e(state.search)+'" type="search">':'')+
    '<select id="scenario" class="select" aria-label="'+t.scenario+'">'+opt('all',t.all,state.scenario)+state.data.scenarios.map(s=>opt(s.id,t[s.id]??s.name,state.scenario)).join('')+'</select>'+
    (withRelease?'<select id="release" class="select" aria-label="'+t.release+'">'+ids.map(i=>opt(i,t.release+' '+(i+1),release())).join('')+'</select>':'')+'</div>';
}
function median(values){
  const sorted=values.toSorted((a,b)=>a-b),mid=Math.floor(sorted.length/2);
  return !sorted.length?null:sorted.length%2?sorted[mid]:(sorted[mid-1]+sorted[mid])/2;
}
function rows(){
  return state.data.agents.map(a=>({a,r:runFor(a.id),s:runFor(a.id)?scope(runFor(a.id)):null})).filter(row=>row.s);
}
function avatar(a){return '<span class="avatar '+e(a.color)+'">'+e(a.initials)+'</span>';}
function nameCell(a){return '<span class="agent">'+avatar(a)+'<span><strong>'+e(a.name)+' <small class="sr-only">v'+e(a.version)+'</small></strong><small>v'+e(a.version)+' · '+e(labels().harness[a.id]??a.harness)+'</small></span></span>';}
function modelName(a){return a.model_id==='rules'?labels().baselineName:state.data.models.find(m=>m.id===a.model_id)?.name??'—';}

function leaderboard(){
  const t=labels(), term=state.search.trim().toLowerCase();
  const records=rows().filter(({a})=>[a.name,a.harness,t.harness[a.id],modelName(a)].some(s=>s?.toLowerCase().includes(term)));
  records.sort((a,b)=>state.direction*(state.sort==='name'?a.a.name.localeCompare(b.a.name):a.s[state.sort]-b.s[state.sort])||a.a.name.localeCompare(b.a.name));
  const sort=(id,label)=>'<th scope="col"'+(state.sort===id?' aria-sort="'+(state.direction===1?'ascending':'descending')+'"':'')+'><button type="button" data-sort="'+id+'">'+label+(state.sort===id?(state.direction===1?' ↑':' ↓'):'')+'</button></th>';
  return '<div class="table-wrap" tabindex="0" aria-label="'+t.leader+'"><table><thead><tr><th scope="col"><span class="sr-only">'+t.select+'</span></th>'+sort('name',t.agent)+'<th scope="col">'+t.model+'</th>'+metrics.map(([key,label])=>sort(key,t[label])).join('')+'</tr></thead><tbody>'+records.map(({a,s})=>'<tr'+(state.ids.includes(a.id)?' class="selected"':'')+'><td><input type="checkbox" data-agent="'+e(a.id)+'" aria-label="'+t.select+' '+e(a.name)+'"'+(state.ids.includes(a.id)?' checked':state.ids.length>=3?' disabled':'')+'></td><td>'+nameCell(a)+'</td><td>'+e(modelName(a))+'</td>'+metrics.map(([key])=>'<td class="num">'+(key==='success_pct'?tag(display(key,s[key]),s[key]>=90?'good':'neutral'):display(key,s[key]))+'</td>').join('')+'</tr>').join('')+(records.length?'':'<tr><td class="empty" colspan="8">'+t.none+'</td></tr>')+'</tbody></table></div><div class="table-foot"><span aria-live="polite">'+state.ids.length+' / 3 '+t.selected+'</span><button type="button" class="button primary" data-action="compare"'+(state.ids.length<2?' disabled':'')+'>'+t.openCompare+' →</button></div>';
}
function overview(){
  const t=labels(), cohort=rows(), first=cohort[0]?.s;
  const best=cohort.length?Math.max(...cohort.map(({s})=>s.success_pct)):null;
  const cost=median(cohort.map(({s})=>s.cost_usd).filter(v=>v!=null));
  const cards=[[t.agents,cohort.length,t.suiteName],[t.tasks,first?.n??'—',t.scope],[t.bestSuccess,best===null?'—':pct(best),t.success],[t.cost,display('cost_usd',cost),t.median]];
  return '<section class="hero"><div class="intro"><span class="kicker">'+t.scope+'</span><h1>'+t.heading+'</h1><p>'+t.sub+'</p><div class="actions"><button class="button primary" data-action="run">▷ '+t.run+'</button><a class="button" href="#faq">'+t.view+' ↗</a><button class="button ghost" data-action="'+(state.origin==='external'?'restore':'import')+'">'+(state.origin==='external'?t.restore:t.import)+'</button></div></div></section>'+
    '<div class="data-bar"><span class="tag"><span class="dot"></span>'+t[state.origin]+'</span><span>'+t.suiteName+' v'+e(state.data.suite.version)+' · '+(state.origin==='external'?t.measured:t.simulated)+'</span></div>'+
    '<section aria-label="'+t.summary+'" class="cards">'+cards.map(([label,value,caption])=>'<div class="card"><div class="metric-label">'+label+'</div><div class="value">'+value+'</div><div class="caption">'+caption+'</div></div>').join('')+'</section>'+
    '<section class="section"><div class="section-head"><div><h2>'+t.leader+'</h2><p>'+t.leaderSub+'</p></div>'+filters(true)+'</div><div class="panel" id="leaderboard">'+leaderboard()+'</div></section>';
}

function compare(){
  const t=labels();
  const items=state.ids.map(agent).filter(Boolean);
  const active=items.map(a=>{const run=runFor(a.id);return {a,s:run?scope(run):null,attempts:runAttempts(run)};});
  const grid=active.length<2?'<div class="empty">'+t.pick+'</div>':'<div class="table-wrap" tabindex="0" aria-label="'+t.compare+'"><table><thead><tr><th scope="col">'+t.metric+'</th>'+active.map(({a})=>'<th scope="col">'+nameCell(a)+'</th>').join('')+'</tr></thead><tbody><tr><td>'+t.model+'</td>'+active.map(({a})=>'<td>'+e(modelName(a))+'</td>').join('')+'</tr>'+metrics.map(([key,label])=>{
    const available=active.filter(({s})=>s?.[key]!=null).map(({s})=>s[key]);
    const best=(lower.has(key)?Math.min:Math.max)(...available);
    return '<tr><td>'+t[label]+'</td>'+active.map(({s})=>'<td class="num">'+(available.length>1&&s?.[key]===best?tag(display(key,s[key])+' · '+t.best,'good'):display(key,s?.[key]))+'</td>').join('')+'</tr>';
  }).join('')+'<tr><td>'+t.reliability+'</td>'+active.map(({attempts})=>'<td class="num">'+display('success_pct',passAll(attempts,state.scenario))+'</td>').join('')+'</tr><tr><td>'+t.sample+'</td>'+active.map(({s})=>'<td>'+e(s?.n??'—')+'</td>').join('')+'</tr></tbody></table></div>';
  return title(t.compareTitle,t.compareSub)+'<div class="section-head"><div class="filters">'+state.data.agents.map(a=>'<label class="button"><input type="checkbox" data-agent="'+e(a.id)+'"'+(state.ids.includes(a.id)?' checked':state.ids.length>=3?' disabled':'')+'> '+e(a.name)+'</label>').join('')+'</div>'+filters()+'</div><div class="panel">'+grid+'<div class="table-foot">'+(state.origin==='external'?t.externalNote:t.scopeNote)+'</div><div class="table-foot">'+t.reliabilityNote+'</div></div>'+pairedView(active,state.scenario,t,e);
}

function trendChart(){
  const t=labels(), selected=state.ids.length?state.ids:state.data.agents.slice(0,3).map(a=>a.id);
  const releases=Array.from(new Set(state.data.runs.map(r=>r.release))).sort((a,b)=>a-b);
  const x=i=>46+i*440/Math.max(1,releases.length-1), y=value=>187-value*1.55;
  const color=i=>i?'var(--chart'+(i+1)+')':'var(--chart)';
  return '<svg class="chart" role="img" aria-label="'+t.history+' · '+t.success+'" viewBox="0 0 520 220">'+[0,25,50,75,100].map(v=>'<path class="gridline" d="M46 '+y(v)+'h440"/><text x="4" y="'+(y(v)+4)+'">'+v+'%</text>').join('')+releases.map((r,i)=>'<text text-anchor="middle" x="'+x(i)+'" y="207">R'+(r+1)+'</text>').join('')+
    selected.map((id,k)=>{
      const points=releases.map((r,i)=>({i,s:state.data.runs.find(run=>run.release===r&&run.agent_id===id)})).map(({i,s})=>({i,s:s?scope(s):null}));
      let pen=false;
      const path=points.map(({i,s})=>{if(!s){pen=false;return '';}const part=(pen?'L':'M')+x(i)+' '+y(s.success_pct);pen=true;return part;}).join(' ');
      return '<path class="series" stroke="'+color(k)+'" d="'+path+'"/>'+points.filter(({s})=>s).map(({i,s})=>'<circle r="4" fill="'+color(k)+'" cx="'+x(i)+'" cy="'+y(s.success_pct)+'"><title>'+e(agent(id)?.name)+' · R'+(releases[i]+1)+' · '+pct(s.success_pct)+'</title></circle>').join('');
    }).join('')+'</svg><div class="legend">'+selected.map((id,i)=>'<span><span class="dot" style="color:'+color(i)+'"></span>'+e(agent(id)?.name)+'</span>').join('')+'</div>';
}
function trendTable(){
  const t=labels(), selected=state.ids.length?state.ids:state.data.agents.slice(0,3).map(a=>a.id);
  const releases=Array.from(new Set(state.data.runs.map(r=>r.release))).sort((a,b)=>a-b);
  return '<details class="notes section"><summary>'+t.history+' · '+t.success+'</summary><div class="table-wrap"><table><thead><tr><th>'+t.release+'</th>'+selected.map(id=>'<th>'+e(agent(id)?.name)+'</th>').join('')+'</tr></thead><tbody>'+releases.map(r=>'<tr><td>R'+(r+1)+'</td>'+selected.map(id=>{const run=state.data.runs.find(v=>v.release===r&&v.agent_id===id);return '<td>'+display('success_pct',run?scope(run)?.success_pct:null)+'</td>';}).join('')+'</tr>').join('')+'</tbody></table></div></details>';
}
function roadmap(){
  const t=labels(), own=runFor(state.focus);
  if(!own)return '<p class="notes">'+t.none+'</p>';
  const peers=rows().filter(({a})=>a.id!==state.focus);
  const scores=own.breakdown.map(b=>{
    const same=peers.map(({r})=>r.breakdown.find(p=>p.scenario_id===b.scenario_id)).filter(Boolean);
    const mid=same.length>=3?median(same.map(s=>s.success_pct)):null;
    const target=Math.min(100,Math.max(b.success_pct,mid??0,90));
    return {...b,mid,target,gap:target-b.success_pct};
  }).filter(b=>state.scenario==='all'||state.scenario===b.scenario_id).sort((a,b)=>b.gap-a.gap);
  return '<p class="notes">'+e(agent(state.focus)?.name)+' · '+t.release+' '+(release()+1)+'</p><ol class="roadmap">'+scores.map(r=>'<li><span class="eyebrow">'+(t[r.scenario_id]??e(r.scenario_id))+'</span><b>'+pct(r.success_pct)+' → '+pct(r.target)+'</b><p>'+t.cohort+' '+(r.mid===null?'—':pct(r.mid))+' · '+t.target+' +'+Number(r.gap.toFixed(1))+' pp</p><p>'+t.step+' · '+(t.tips[r.scenario_id]??'')+'</p></li>').join('')+'</ol>';
}
function trends(){
  const t=labels();
  return title(t.trendTitle,t.trendSub)+'<div class="section-head">'+filters()+'<select class="select" id="focus" aria-label="'+t.agent+'">'+state.data.agents.map(a=>opt(a.id,a.name,state.focus)).join('')+'</select></div><div class="split"><section class="panel pad"><div class="panel-head"><div><h2>'+t.history+'</h2><p>'+t.success+' · '+t.allHistory+'</p></div></div>'+trendChart()+trendTable()+'</section><section class="panel pad"><div class="panel-head"><h2>'+t.gap+'</h2></div>'+roadmap()+'</section></div>';
}
function evidence(){
  const t=labels(), selected=agent(state.logAgent)??state.data.agents[0], attempts=runAttempts(runFor(selected.id));
  const index=attempts[state.attempt]?state.attempt:0;
  const visible=taskRows(attempts[index]??[],state.scenario,state.outcome);
  return title(t.evidenceTitle,t.evidenceSub)+'<div class="section-head"><div class="filters">'+
    '<select class="select" id="logAgent" aria-label="'+t.agent+'">'+state.data.agents.map(a=>opt(a.id,a.name,selected.id)).join('')+'</select>'+
    '<select class="select" id="attempt" aria-label="'+t.attempt+'">'+attempts.map((_,i)=>opt(i,t.attempt+' '+(i+1),index)).join('')+'</select>'+
    '<select class="select" id="outcome" aria-label="'+t.taskResults+'">'+[['all',t.allTasks],['failed',t.failed],['policy',t.violated]].map(([v,l])=>opt(v,l,state.outcome)).join('')+'</select></div>'+filters()+'</div>'+
    '<div class="section-head evidence-meta"><span class="notes">'+visible.length+' / '+taskRows(attempts[index]??[],state.scenario,'all').length+' '+t.sample+'</span>'+
    '<button type="button" class="button" data-action="export"'+(attempts.length?'':' disabled')+'>'+t.export+' ↓</button></div>'+
    evidenceList(visible,t,e);
}
function exportEvidence(){
  const selected=agent(state.logAgent)??state.data.agents[0], run=runFor(selected.id), attempts=runAttempts(run);
  if(!attempts.length)return;
  const {attempts:_,...summary}=run;
  const payload={suite:state.data.suite,agent:selected,model:state.data.models.find(m=>m.id===selected.model_id),summary,attempts};
  const url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));
  const download=document.createElement('a');
  download.href=url;
  download.download=selected.id+'-release-'+(release()+1)+'-evidence.json';
  download.click();
  setTimeout(()=>URL.revokeObjectURL(url),30000);
}
function faq(){
  const t=labels();
  return title(t.methods,t.modelNote)+'<section class="panel faq" aria-label="'+t.faq+'">'+t.faqs.map(([q,a],i)=>'<details><summary>'+q+'</summary><p>'+a+'</p>'+(i===5?'<ul>'+links.map(([name,url])=>'<li><a target="_blank" rel="noopener" href="'+url+'">'+name+' ↗</a></li>').join('')+'</ul>':'')+'</details>').join('')+'</section>';
}
function render(focus){
  chrome();
  if(!state.data){$('content').innerHTML='<div class="loading" role="status"><span class="spinner"></span>'+labels().loading+'</div>';return;}
  $('content').innerHTML=({overview,compare,trends,evidence,faq})[route()]();
  if(focus)document.querySelector(focus)?.focus({preventScroll:true});
}

function modal(html){
  $('dialog-body').innerHTML=html;
  if(!$('dialog').open)$('dialog').showModal();
}
function preferences(){
  const t=labels();
  modal('<h2 id="modal-title">'+t.cookiesTitle+'</h2><p>'+t.cookiesBody+'</p><div class="actions"><button type="button" class="button primary" data-action="allow">'+t.allow+'</button><button type="button" class="button" data-action="decline">'+t.decline+'</button><button type="button" class="button ghost" data-action="close">'+t.close+'</button></div>');
}
function importDialog(){
  const t=labels();
  modal('<h2 id="modal-title">'+t.import+'</h2><p>'+t.importBody+'</p><input id="report-files" type="file" accept=".json,application/json" multiple aria-label="'+t.import+'"><p id="import-status" role="status"></p><div class="actions"><button class="button" data-action="close">'+t.close+'</button></div>');
}
function replaceData(data,origin){
  state.data=data;
  state.origin=origin;
  state.ids=data.agents.slice(0,2).map(a=>a.id);
  state.focus=state.ids.at(-1);
  state.logAgent=data.agents.find(a=>a.id==='quill')?.id??data.agents[0].id;
  state.attempt=0;
  state.outcome='failed';
  state.scenario='all';
  state.search='';
  state.release=null;
  $('dialog').close();
  render();
}
async function importFiles(input){
  try{
    const files=[...input.files];
    if(!files.length)return;
    if(files.length>12||files.some(f=>f.size>250000))throw Error('Size');
    const reports=await Promise.all(files.map(async f=>JSON.parse(await f.text())));
    if(input.isConnected&&$('dialog').open)replaceData(readReports(reports),'external');
  }catch{
    if(input.isConnected)$('import-status').textContent=labels().importError;
  }
}
function runDialog(){
  const t=labels();
  const baselines=snapshot().agents;
  modal('<h2 id="modal-title">'+t.runTitle+'</h2><p>'+t.runBody+'</p><select id="run-agent" class="select" aria-label="'+t.agent+'">'+baselines.map(a=>opt(a.id,a.name,state.ids[0])).join('')+'</select><p id="run-out" aria-live="polite"></p><progress id="progress" aria-label="'+t.running+'" value="0" max="60" hidden></progress><div class="actions"><button id="run-start" class="button primary" data-action="start">'+t.start+'</button><button class="button" data-action="close">'+t.close+'</button></div>');
}
async function run(){
  const t=labels(), select=$('run-agent'), out=$('run-out'), progress=$('progress'), button=$('run-start');
  button.disabled=true;
  progress.hidden=false;
  const trials=runBaseline(select.value);
  for(let count=5;count<=trials.length;count+=5){
    if(!$('dialog').open||!out.isConnected)return;
    progress.value=count;
    out.textContent=t.running+' '+count+' / '+trials.length;
    await new Promise(resolve=>setTimeout(resolve,27));
  }
  const result=aggregate(trials);
  out.textContent=t.result+' · '+t.success+' '+pct(result.success_pct)+' · '+t.policy+' '+pct(result.policy_pct);
  button.disabled=false;
}
$('dialog').setAttribute('aria-labelledby','modal-title');
$('dialog').addEventListener('click',event=>{if(event.target===$('dialog'))$('dialog').close();});
document.addEventListener('click',event=>{
  const button=event.target.closest('button');
  if(!button)return;
  const {action,sort}=button.dataset;
  if(sort){
    state.direction=state.sort===sort?-state.direction:(lower.has(sort)||sort==='name'?1:-1);
    state.sort=sort;
    render('[data-sort="'+sort+'"]');
  }
  if(action==='compare')location.hash='compare';
  if(action==='cookies')preferences();
  if(action==='run')runDialog();
  if(action==='export')exportEvidence();
  if(action==='import')importDialog();
  if(action==='restore')replaceData(original.data,original.origin);
  if(action==='start')void run();
  if(action==='close')$('dialog').close();
  if(action==='allow'||action==='decline'){
    state.consent=action==='allow';
    for(const [key,val] of [['consent','yes'],['theme',state.theme],['lang',state.lang]])setCookie('ab_'+key,val,state.consent?15552000:0);
    $('dialog').close();
  }
});
$('content').addEventListener('input',event=>{
  if(event.target.id==='search'){
    state.search=event.target.value;
    $('leaderboard').innerHTML=leaderboard();
  }
});
document.addEventListener('change',event=>{
  const input=event.target;
  if(input.id==='report-files')void importFiles(input);
  if(input.id==='language'){
    state.lang=input.value;
    if(state.consent)setCookie('ab_lang',state.lang);
    render();
  }
  if(['scenario','release','focus','logAgent','attempt','outcome'].includes(input.id)){
    state[input.id]=['release','attempt'].includes(input.id)?Number(input.value):input.value;
    if(input.id==='logAgent')state.attempt=0;
    render('#'+input.id);
  }
  if(input.dataset.agent){
    const id=input.dataset.agent;
    if(input.checked&&state.ids.length<3)state.ids.push(id);
    if(!input.checked)state.ids=state.ids.filter(v=>v!==id);
    render('[data-agent="'+CSS.escape(id)+'"]');
  }
});
$('theme').addEventListener('click',()=>{
  state.theme=state.theme==='dark'?'light':'dark';
  if(state.consent)setCookie('ab_theme',state.theme);
  chrome();
});
window.addEventListener('hashchange',()=>{
  render();
  window.scrollTo({top:0,behavior:'instant'});
});
window.addEventListener('scroll',()=>{$('back').hidden=window.scrollY<260;},{passive:true});
$('back').addEventListener('click',()=>window.scrollTo({top:0,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'}));

async function load(){
  if(!supabase.url||!supabase.key)return snapshot();
  try{
    const result=await fetch(supabase.url.replace(/\/$/,'')+'/rest/v1/rpc/agentbench_snapshot',{
      method:'POST',headers:{apikey:supabase.key,'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(5000)
    });
    if(!result.ok)throw Error('Dataset request failed');
    const data=await result.json();
    if(!data.suite||!data.runs?.length||!data.agents?.length)throw Error('Dataset is empty');
    state.origin='database';
    return data;
  }catch{
    state.origin='fallback';
    return snapshot();
  }
}
render();
state.data=await load();
original={data:state.data,origin:state.origin};
const requested=new URLSearchParams(location.search);
const logAgent=requested.get('agent');
const logRelease=requested.get('release');
if(location.hash==='#evidence'&&logAgent&&agent(logAgent)&&logRelease!==null&&
   state.data.runs.some(run=>run.agent_id===logAgent&&run.release===Number(logRelease))){
  state.logAgent=logAgent;
  state.release=Number(logRelease);
}

state.ids=state.ids.filter(id=>agent(id));
if(state.ids.length<2)state.ids=state.data.agents.slice(0,2).map(a=>a.id);
if(!agent(state.focus))state.focus=state.data.agents[0].id;
render();
