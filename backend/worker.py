import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
import time
from .collectors import collect
from .db import privileged_database

SCHEDULE=Path(__file__).with_name('schedule.json')

def enqueue(db):
    now=datetime.now(timezone.utc)
    config=json.loads(SCHEDULE.read_text())
    pending=[]
    for task in config:
        period=now.date().isoformat() if task['period']=='daily' else now.strftime('%G-W%V')
        pending.append({'kind':task['kind'],'dedup_key':task['id']+':'+period,'payload':task['payload']})
    db.request('POST','benchmark_jobs',params={'on_conflict':'dedup_key'},data=pending,prefer='resolution=ignore-duplicates,return=minimal')

def work(db):
    jobs=db.request('POST','rpc/claim_benchmark_job',data={'job_kinds':['collect','alerts']})
    if not jobs:
        return False
    job=jobs[0]
    failure=None
    try:
        if job['kind']=='alerts':
            db.request('POST','rpc/emit_benchmark_regressions',data={})
        else:
            collect(db,job['payload']['collector'],job['payload']['url'])
    except Exception as error:
        failure=type(error).__name__
    accepted=db.request('POST','rpc/finish_benchmark_job',data={'job_id':job['id'],'token':job['lease_token'],'failure':failure})
    if not accepted:
        raise RuntimeError('Worker lease expired')
    return True

if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('mode',choices=['enqueue','once','work'])
    command=parser.parse_args().mode
    with privileged_database() as db:
        if command=='enqueue':
            enqueue(db)
        elif command=='once':
            work(db)
        else:
            while True:
                if not work(db):
                    time.sleep(5)
