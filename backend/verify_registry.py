"""Verify only reviewed seed mappings. Unmapped seeds stay pending."""
import argparse
import json
from pathlib import Path
import httpx
from .collectors import collect
from .db import privileged_database

def verify(db):
    manifest=json.loads(Path(__file__).with_name('registry.json').read_text())
    outcomes={}
    with httpx.Client(timeout=10,follow_redirects=False) as source:
        for table,entries in manifest.items():
            for entry in entries:
                slug,repo,homepage=entry['slug'],entry['repo'],entry['homepage']
                try:
                    metadata=collect(db,'github','https://api.github.com/repos/'+repo,source)
                    response=source.get(homepage,follow_redirects=True)
                    response.raise_for_status()
                    if metadata['archived'] or metadata['disabled'] or metadata['full_name'].lower()!=repo.lower():
                        raise ValueError('Repository is archived, disabled, or moved')
                    changes={'status':'active','repo_url':metadata['html_url']}
                    changes['homepage_url' if table=='agents' else 'paper_url']=homepage
                    updated=db.request('PATCH',table,params={'slug':'eq.'+slug,'status':'eq.to_verify','select':'slug'},data=changes,prefer='return=representation')
                    outcomes[slug]='activated' if updated else 'no candidate update'
                except (httpx.HTTPError,ValueError) as error:
                    outcomes[slug]='needs review: '+type(error).__name__
    return outcomes

if __name__=='__main__':
    argparse.ArgumentParser(description=__doc__).parse_args()
    with privileged_database() as db:
        print(json.dumps(verify(db),indent=2))
