'use client';

import {useState} from 'react';
import {request} from './data.mjs';

export default function BenchmarkReplay() {
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function replay() {
    setBusy(true);
    setError(false);
    setResult(null);
    try {
      const tasks = await request('/rest/v1/rpc/bifrost_run_bfcl_math', {method:'POST', body:{}});
      const latencies = tasks.map(task => task.latency_ms).sort((a,b) => a-b);
      setResult({
        passed: tasks.filter(task => task.passed).length,
        count: tasks.length,
        p95: latencies[Math.ceil(latencies.length * 0.95) - 1],
      });
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return <section className="panel mt-4">
    <h2>Re-run the hosted benchmark</h2>
    <p>Runs the fixed Numeric Binder baseline on 19 BFCL math cases in Supabase. No model API calls are made. Timing covers the baseline’s argument binding and excludes browser and network overhead.</p>
    <button className="primary" type="button" disabled={busy} onClick={replay}>{busy?'Running…':'Run 19 cases'}</button>
    <p role="status">{error?'The hosted run failed. Try again.':result&&
      `${result.passed} / ${result.count} passed. p95 binding latency: ${result.p95.toFixed(3)} ms. Model-provider cost: $0.`}</p>
  </section>;
}
