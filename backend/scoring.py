"""Scores remain tied to their evaluation protocol."""
from math import isfinite, sqrt
import json

DIMENSIONS = frozenset(('capability','reliability','cost_efficiency','latency','safety','autonomy','tool_use','robustness'))
COHORT_FIELDS = ('benchmark_slug','metric','dataset_version','dataset_split','method_version','harness','n_trials','constraints')

def normalize(value, minimum, maximum, higher=True):
    if not all(isfinite(v) for v in (value, minimum, maximum)) or not minimum <= value <= maximum or minimum == maximum:
        raise ValueError('Value and metric bounds must be finite and in range')
    fraction = (value - minimum) / (maximum - minimum)
    return 100 * (fraction if higher else 1 - fraction)

def wilson(successes, n, z=1.959963984540054):
    if type(successes) is not int or type(n) is not int or n <= 0 or not 0 <= successes <= n:
        raise ValueError('Expected integer successes in [0,n] with n positive')
    p = successes / n
    den = 1 + z*z/n
    middle = (p + z*z/(2*n))/den
    half = z*sqrt(p*(1-p)/n + z*z/(4*n*n))/den
    return (0 if successes == 0 else 100*(middle-half), 100 if successes == n else 100*(middle+half))

def cohort_key(row):
    values = [row.get(key) for key in COHORT_FIELDS]
    if any(value is None or value == '' for value in values) or not isinstance(values[-1], dict):
        return None
    return json.dumps(values, sort_keys=True, separators=(',', ':'), allow_nan=False)

def compare(left, right):
    cohort = cohort_key(left)
    if cohort is None or cohort != cohort_key(right):
        return {'status':'incompatible'}
    intervals = [(r.get('ci_low'), r.get('ci_high')) for r in (left,right)]
    delta = left['normalized_score'] - right['normalized_score']
    if any(x is None for pair in intervals for x in pair):
        return {'status':'uncertainty_unavailable','delta':delta}
    (ll,lh),(rl,rh) = intervals
    return {'status':'statistical_tie' if max(ll,rl)<=min(lh,rh) else 'separated_intervals','delta':delta}

def composite(scores, weights):
    if not weights or set(weights)-DIMENSIONS or any(not isfinite(w) or w < 0 for w in weights.values()):
        raise ValueError('Invalid dimension weights')
    chosen = [(key, weight) for key,weight in weights.items() if weight]
    if not chosen:
        raise ValueError('At least one positive weight is required')
    if any(scores.get(key) is None for key,_ in chosen):
        return None
    if any(not isfinite(scores[key]) or not 0 <= scores[key] <= 100 for key,_ in chosen):
        raise ValueError('Dimension scores must be finite and in [0,100]')
    return sum(scores[key]*weight for key,weight in chosen)/sum(weight for _,weight in chosen)
