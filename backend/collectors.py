"""Bounded HTTP collectors for reviewed endpoints. Collection never publishes a score."""
import hashlib
import json
import re
from urllib.parse import urlsplit
import httpx
from .scoring import normalize,wilson

USER_AGENT='BifrostRegistry/1.0'
GITHUB_PATH=re.compile(r'^/repos/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$')
SWE_PATH=re.compile(r'^/SWE-bench/experiments/[a-f0-9]{40}/evaluation/(verified|lite|full)/[A-Za-z0-9_.-]+/(?:results|per_instance_details)\.json$',re.I)

def fetch(url, client):
    from urllib.robotparser import RobotFileParser
    endpoint=urlsplit(url)
    valid=(endpoint.netloc=='api.github.com' and GITHUB_PATH.fullmatch(endpoint.path) or
           endpoint.netloc=='raw.githubusercontent.com' and SWE_PATH.fullmatch(endpoint.path))
    if endpoint.scheme!='https' or not valid or endpoint.query or endpoint.fragment:
        raise ValueError('Endpoint must be on the reviewed collector allow-list')
    robots=client.get(f'https://{endpoint.netloc}/robots.txt')
    if robots.status_code not in (404,410):
        robots.raise_for_status()
        parser=RobotFileParser()
        parser.parse(robots.text.splitlines())
        if not parser.can_fetch(USER_AGENT,url):
            raise ValueError('Source robots.txt disallows collection')
    with client.stream('GET',url,headers={'User-Agent':USER_AGENT,'Accept':'application/json'}) as response:
        response.raise_for_status()
        chunks=[]
        length=0
        for chunk in response.iter_bytes():
            length+=len(chunk)
            if length>2_000_000:
                raise ValueError('Source exceeds collector size limit')
            chunks.append(chunk)
    return json.loads(b''.join(chunks))

def github_metadata(payload):
    fields=('full_name','html_url','stargazers_count','open_issues_count','pushed_at','archived','disabled')
    if not isinstance(payload,dict) or not all(key in payload for key in fields):
        raise ValueError('Unexpected GitHub repository response')
    expected=(str,str,int,int,str,bool,bool)
    if any(type(payload[key]) is not kind for key,kind in zip(fields,expected,strict=True)):
        raise ValueError('Invalid GitHub repository field types')
    return {key:payload[key] for key in fields} | {'license':(payload.get('license') or {}).get('spdx_id')}

def swe_results(payload):
    if not isinstance(payload,dict):
        raise ValueError('Expected a results object')
    if 'resolved' not in payload and payload and all(
        isinstance(key,str) and key and isinstance(result,dict) and type(result.get('resolved')) is bool
        for key,result in payload.items()
    ):
        return {'successes':sum(row['resolved'] for row in payload.values()),'sample_size':len(payload),'review_required':True}
    resolved,unresolved=payload.get('resolved'),payload.get('unresolved')
    if not all(isinstance(value,list) and all(isinstance(item,str) and item for item in value) for value in (resolved,unresolved)):
        raise ValueError('Expected explicit resolved/unresolved task IDs')
    complete=set(resolved)|set(unresolved)
    if not complete or len(complete)!=len(resolved)+len(unresolved):
        raise ValueError('Missing, duplicate or contradictory task IDs')
    return {'successes':len(resolved),'sample_size':len(complete),'review_required':True}

PARSERS={'github':github_metadata,'leaderboard':swe_results}

def collect(db,kind,url,client=None):
    if kind not in PARSERS or (kind=='github')!=(urlsplit(url).netloc=='api.github.com'):
        raise ValueError('Collector type does not match the endpoint')
    if client is None:
        with httpx.Client(timeout=10,follow_redirects=False,headers={'User-Agent':USER_AGENT}) as source_client:
            return collect(db,kind,url,source_client)
    payload=fetch(url,client)
    canonical=json.dumps(payload,sort_keys=True,separators=(',',':'),allow_nan=False)
    digest=hashlib.sha256(canonical.encode()).hexdigest()
    parsed=PARSERS[kind](payload)
    db.request('POST','sources',params={'on_conflict':'url,content_hash'},
        data={'source_type':kind,'url':url,'content_hash':digest,'raw':{'payload':payload,'parsed':parsed}},
        prefer='resolution=ignore-duplicates,return=minimal')
    if kind=='leaderboard':
        split=SWE_PATH.fullmatch(urlsplit(url).path).group(1).lower()
        slug={'verified':'swe-bench-verified','lite':'swe-bench-lite','full':'swe-bench-full'}[split]
        benchmark=db.request('GET','benchmarks',params={'slug':'eq.'+slug,'select':'slug,task_count','limit':1})
        if benchmark and parsed['sample_size']==benchmark[0]['task_count']:
            source=db.request('GET','sources',params={'url':'eq.'+url,'content_hash':'eq.'+digest,'select':'id','limit':1})[0]
            n,k=parsed['sample_size'],parsed['successes']
            score=100*k/n
            low,high=wilson(k,n)
            db.request('POST','collected_result_candidates',params={'on_conflict':'source_id'},prefer='resolution=ignore-duplicates,return=minimal',
                data={'source_id':source['id'],'benchmark_slug':slug,'split':split,'metric':'success_pct','successes':k,
                      'sample_size':n,'raw_value':score,'normalized_score':normalize(score,0,100),'ci_low':low,'ci_high':high})
    return parsed
