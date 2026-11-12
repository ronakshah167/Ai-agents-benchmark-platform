"""Reference adapters for deterministic local fixtures."""
from dataclasses import dataclass
from time import perf_counter_ns

@dataclass
class Result:
    task: str
    attempt: int
    passed: bool
    failure_category: str | None
    latency_ms: int
    trace: dict

def evaluate(adapter, agent, tasks, seeds=(13,29,47)):
    results=[]
    for attempt,seed in enumerate(seeds,1):
        for task in tasks:
            started=perf_counter_ns()
            env=None
            try:
                env=adapter.setup(task)
                trace=adapter.run(agent,task,env,seed)
                passed=adapter.grade(trace,task)
                failure=None if passed else 'wrong_answer'
            except TimeoutError:
                trace,passed,failure={},False,'timeout'
            except Exception:
                trace,passed,failure={},False,'env_error'
            finally:
                if env is not None:
                    adapter.teardown(env)
            results.append(Result(task['id'],attempt,passed,failure,(perf_counter_ns()-started)//1_000_000,trace))
    return results
