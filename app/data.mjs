import {supabase} from '../dist/config.mjs';

export const fields=['benchmark_slug','metric','dataset_version','dataset_split','method_version','harness','n_trials','constraints'];
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
export const cohort=row=>JSON.stringify(fields.map(key=>canonical(row[key])));
export const tied=(a,b)=>[a.ci_low,a.ci_high,b.ci_low,b.ci_high].every(x=>x!=null)&&Math.max(a.ci_low,b.ci_low)<=Math.min(a.ci_high,b.ci_high);
export const safeUrl=value=>{try{const u=new URL(value);return u.protocol==='https:'?u.href:null;}catch{return null;}};
export const number=value=>value==null?'—':new Intl.NumberFormat('en',{maximumFractionDigits:2}).format(value);

export async function request(path,{query={},method='GET',token,body,signal}={}){
  const url=new URL(supabase.url+path);
  for(const [key,value] of Object.entries(query))url.searchParams.set(key,value);
  const boundedSignal=signal?AbortSignal.any([signal,AbortSignal.timeout(15000)]):AbortSignal.timeout(15000);
  const response=await fetch(url,{method,signal:boundedSignal,headers:{apikey:supabase.key,
    ...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
  if(!response.ok)throw Object.assign(Error('Request failed ('+response.status+')'), {status:response.status});
  return response.status===204||response.headers.get('content-length')==='0'?null:response.json();
}

export async function allRows(name,query,signal){
  const records=[], pageSize=200;
  while(true){
    const page=await request('/rest/v1/'+name,{query:{...query,limit:pageSize,offset:records.length},signal});
    records.push(...page);
    if(page.length<pageSize)return records;
  }
}

export async function catalog(signal){
  const get=(name,query)=>request('/rest/v1/'+name,{query,signal});
  const [agents,benchmarks,leaders,peers,groups]=await Promise.all([
    allRows('agents',{select:'id,slug,name,category,license_type,form_factor,status,homepage_url,repo_url,price_tier,description',order:'name,id'},signal),
    get('benchmarks',{select:'id,slug,name,domain,description,primary_metric,contamination_risk,paper_url,repo_url',order:'name,id',limit:150}),
    allRows('v_leaderboard',{select:'*',order:'benchmark_slug,metric,verified.desc,normalized_score.desc.nullslast,run_id'},signal),
    get('v_peer_percentile',{select:'*',order:'peer_group,peer_percentile.desc,run_id',limit:500}),
    get('peer_groups',{select:'id,name,rule',order:'name,id',limit:100})
  ]);
  return {agents,benchmarks,leaders,peers,groups};
}
