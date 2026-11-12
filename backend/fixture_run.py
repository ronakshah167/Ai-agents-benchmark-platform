import json
from dataclasses import asdict
from .adapters import BrowserFixture,PatchFixture
from .harness import evaluate

CODING=[{'id':'double','buggy':'x+2','issue':'Double the number','assertions':[(0,0),(-7,-14),(19,38)]}]
WEB=[{'id':'warehouse','instruction':'Create Alder warehouse in the east region.','expected':'Alder | east'}]
def run_fixtures():
    return {
        'coding':[asdict(r) for r in evaluate(PatchFixture(),lambda task,seed:'x*2',CODING)],
        'browser':[asdict(r) for r in evaluate(BrowserFixture(),lambda task,seed:[
            ('fill','name','Alder'),('select','region','east'),('click','save',None)],WEB)]
    }

if __name__=='__main__':
    output=run_fixtures()
    print(json.dumps(output,indent=2))
    if not all(row['passed'] for rows in output.values() for row in rows):
        raise SystemExit(1)
