import csv
import io
import os
from collections import defaultdict, deque
from threading import Lock
from time import monotonic
from uuid import UUID
import httpx
from fastapi import Depends, FastAPI, Header, HTTPException, Query, Response
from .db import Database
from .scoring import compare

app = FastAPI(title='AgentBench REST', version='1.0')
clients = defaultdict(deque)
limiter_lock = Lock()

def limit(x_api_key: str | None = Header(default=None)):
    from hmac import compare_digest
    configured = os.environ.get('BENCH_READ_API_KEY')
    if not configured:
        raise HTTPException(503,'Read API is not configured')
    if not x_api_key or not compare_digest(x_api_key,configured):
        raise HTTPException(401,'Invalid read API key')
    now=monotonic()
    with limiter_lock:
        window=clients['read']
        while window and window[0] <= now-60:
            window.popleft()
        if len(window)>=120:
            raise HTTPException(429,'Rate limit reached',headers={'Retry-After':'60'})
        window.append(now)

def rows(path,params):
    try:
        with Database() as db:
            return db.request('GET',path,params=params)
    except (httpx.HTTPError,RuntimeError):
        raise HTTPException(502,'Benchmark data is unavailable') from None

@app.get('/agents',dependencies=[Depends(limit)])
def agents(offset: int=Query(0,ge=0), count: int=Query(50,ge=1,le=100)):
    return rows('agents',{'select':'id,slug,name,category,license_type,form_factor,status,homepage_url,repo_url','order':'name,id','offset':offset,'limit':count})

@app.get('/benchmarks',dependencies=[Depends(limit)])
def benchmarks(offset: int=Query(0,ge=0), count: int=Query(50,ge=1,le=100)):
    return rows('benchmarks',{'select':'id,slug,name,domain,description,primary_metric,contamination_risk,paper_url,repo_url','order':'name,id','offset':offset,'limit':count})

@app.get('/leaderboard',dependencies=[Depends(limit)])
def leaderboard(benchmark: str | None=Query(None,pattern=r'^[a-z0-9-]{1,80}$'), count: int=Query(50,ge=1,le=100), offset: int=Query(0,ge=0), format: str='json'):
    params={'select':'*','order':'benchmark_slug,metric,verified.desc,normalized_score.desc.nullslast,run_id','limit':count,'offset':offset}
    if benchmark:
        params['benchmark_slug']='eq.'+benchmark
    data=rows('v_leaderboard',params)
    if format=='csv':
        buffer=io.StringIO()
        if data:
            def safe(value):
                return "'"+value if isinstance(value,str) and value.lstrip().startswith(('=','+','-','@')) else value
            writer=csv.DictWriter(buffer,fieldnames=list(data[0]))
            writer.writeheader()
            writer.writerows({k:safe(v) for k,v in row.items()} for row in data)
        return Response(buffer.getvalue(),media_type='text/csv')
    if format!='json':
        raise HTTPException(422,'Use json or csv')
    return data

@app.get('/runs/{run_id}',dependencies=[Depends(limit)])
def run(run_id: UUID):
    matches=rows('evaluation_runs',{'id':'eq.'+str(run_id),'select':'id,harness,run_type,verified,dataset_version,dataset_split,constraints,n_trials,retrieved_at,source_id,method_version'})
    if not matches:
        raise HTTPException(404,'Run not found')
    scores=rows('benchmark_results',{'run_id':'eq.'+str(run_id),'select':'metric,raw_value,normalized_score,ci_low,ci_high,sample_size'})
    return {'run':matches[0],'scores':scores}

@app.get('/compare',dependencies=[Depends(limit)])
def compare_runs(left: UUID, right: UUID, metric: str=Query('success_pct',pattern=r'^[A-Za-z0-9_@^%-]{1,48}$')):
    items=rows('v_published_scores',{'run_id':f'in.({left},{right})','metric':'eq.'+metric,'select':'*','limit':2})
    selected={str(row['run_id']):row for row in items}
    if str(left) not in selected or str(right) not in selected:
        raise HTTPException(404,'Run or metric not found')
    return compare(selected[str(left)],selected[str(right)])
