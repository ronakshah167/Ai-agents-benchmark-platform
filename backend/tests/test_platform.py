from unittest import TestCase
import httpx
from backend.adapters import PatchFixture
from backend.collectors import collect, github_metadata, swe_results
from backend.fixture_run import CODING
from backend.harness import evaluate
from backend.scoring import compare, composite, normalize, wilson

class ScoringTests(TestCase):
    def test_bounds_and_direction(self):
        self.assertEqual(normalize(5,0,20),25)
        self.assertEqual(normalize(5,0,20,False),75)
        for value in (-1,21,float('nan')):
            with self.assertRaises(ValueError):
                normalize(value,0,20)

    def test_wilson(self):
        self.assertEqual(wilson(0,60)[0],0)
        self.assertEqual(wilson(60,60)[1],100)
        self.assertAlmostEqual(wilson(5,10)[0],23.6593,places=3)
        self.assertAlmostEqual(wilson(5,10)[1],76.3407,places=3)
        with self.assertRaises(ValueError):
            wilson(1,0)

    def test_cohorts(self):
        sample=dict(benchmark_slug='test',metric='success_pct',dataset_version='1',dataset_split='full',
                    method_version='1',harness='h',n_trials=1,constraints={'steps':4,'timeout':8},
                    normalized_score=80,ci_low=72,ci_high=87)
        self.assertEqual(compare(sample,sample|{'n_trials':3})['status'],'incompatible')
        self.assertEqual(compare(sample,sample|{'constraints':{'timeout':8,'steps':4}})['status'],'statistical_tie')
        self.assertEqual(compare(sample,sample|{'ci_low':10,'ci_high':20})['status'],'separated_intervals')
        self.assertEqual(compare(sample,sample|{'ci_high':None})['status'],'uncertainty_unavailable')
        self.assertIsNone(composite({'capability':80},{'capability':2,'safety':1}))
        self.assertEqual(composite({'capability':80,'safety':50},{'capability':2,'safety':1}),70)

class CollectionTests(TestCase):
    def test_task_lists(self):
        self.assertEqual(swe_results({'resolved':['a'],'unresolved':['b']})['sample_size'],2)
        self.assertEqual(swe_results({'case-1':{'resolved':True},'case-2':{'resolved':False}})['successes'],1)
        with self.assertRaises(ValueError):
            swe_results({'resolved':['a'],'unresolved':['a']})

    def test_allow_list_and_dedup(self):
        class Store:
            def __init__(self):
                self.rows=[]
            def request(self,*args,**kwargs):
                self.rows.append(kwargs)
        payload={'full_name':'x/y','html_url':'https://github.com/x/y','stargazers_count':1,'open_issues_count':2,
                 'pushed_at':'2026-01-01','archived':False,'disabled':False}
        def answer(req):
            return httpx.Response(404) if req.url.path=='/robots.txt' else httpx.Response(200,json=payload)
        with httpx.Client(transport=httpx.MockTransport(answer)) as client:
            store=Store()
            for _ in range(2):
                self.assertEqual(collect(store,'github','https://api.github.com/repos/x/y',client),github_metadata(payload))
            self.assertEqual(store.rows[0]['data']['content_hash'],store.rows[1]['data']['content_hash'])
            self.assertEqual(store.rows[0]['prefer'],'resolution=ignore-duplicates,return=minimal')
            with self.assertRaises(ValueError):
                collect(store,'github','https://example.com/repos/x/y',client)

class FixtureTests(TestCase):
    def test_correct_patch(self):
        runs=evaluate(PatchFixture(),lambda task,seed:'x*2',CODING)
        self.assertEqual([r.passed for r in runs],[True,True,True])
    def test_wrong_or_unsupported_patch(self):
        for patch in ('x+2','other(x)'):
            self.assertFalse(evaluate(PatchFixture(),lambda task,seed:patch,CODING)[0].passed)
