'use client';

import {useState} from 'react';
import {compareAgents} from './compare.mjs';
import {number, tied} from './data.mjs';
import {usePreferences} from './preferences.jsx';

const name = (agents, slug) => agents.find(agent => agent.slug === slug)?.name;
const link = run => '#runs/' + encodeURIComponent(run.run_id);
const score = run => number(run.raw_value) + (run.raw_value != null && run.metric.endsWith('_pct') ? '%' : '');
const interval = run => run.ci_low == null || run.ci_high == null ? '' : number(run.ci_low) + '–' + number(run.ci_high) + (run.metric.endsWith('_pct') ? '% CI' : ' CI');
const isPercent = run => run.metric.endsWith('_pct');
const delta = (a, b) => {
  const field = isPercent(a) ? 'raw_value' : 'normalized_score';
  return a[field] == null || b[field] == null ? null : a[field] - b[field];
};

function protocol(run, t) {
  const {max_steps: steps, additional_coding_actions: coding} = run.constraints ?? {};
  return [run.dataset_version, run.dataset_split, run.harness, steps == null ? null : t('{count} steps', {count: steps}),
    coding == null ? null : t(coding ? 'Coding actions allowed' : 'No coding actions')].filter(Boolean).join(' · ');
}

function Score({run, t}) {
  const provenance = run.run_type === 'platform_run' ? 'Scripted platform run' : run.verified ? 'Benchmark-published result' : 'Third-party reported';
  return <td><strong className="score">{score(run)}</strong>{interval(run) && <span className="cell-line muted">{interval(run)}</span>}
    <a className="cell-line link" href={link(run)}>{run.version_label}</a><span className="cell-line muted">{t(provenance)}</span></td>;
}

function BenchmarkCoverage({title, rows, t}) {
  return <details className="card coverage"><summary>{title} <span className="badge">{rows.length}</span></summary>{rows.length ? <ul className="stack">
    {rows.map(run => <li key={run.run_id + '/' + run.metric}><a className="link" href={link(run)}>{run.benchmark} · {run.metric}</a> · {score(run)}
      <br/><span className="muted">{protocol(run, t)} · {run.version_label}</span></li>)}
    </ul> : <p className="muted">{t('No results for this list.')}</p>}</details>;
}

const sortValues = {benchmark: ([a]) => a.benchmark, left: ([a]) => a.raw_value, right: ([, b]) => b.raw_value, delta: ([a, b]) => delta(a, b)};

export default function HeadToHead({agents, leaders, initial, tradeoffs}) {
  const {t, language} = usePreferences();
  const scored = new Set(leaders.map(row => row.agent_slug));
  const defaults = ['openai-codex', 'claude-code'].every(slug => scored.has(slug)) ? ['openai-codex', 'claude-code'] : [...scored].slice(0, 2);
  const [first, second] = initial ? initial.split(',') : defaults;
  const [left, setLeft] = useState(name(agents, first) ? first : '');
  const [right, setRight] = useState(first !== second && name(agents, second) ? second : '');
  const [filter, setFilter] = useState('');
  const [sort, setSort] = useState({field: 'benchmark', descending: false});
  const leftName = name(agents, left), rightName = name(agents, right);
  const active = Boolean(left && right && left !== right);
  const {shared, leftOnly, rightOnly} = active ? compareAgents(left, right, leaders) : {shared: [], leftOnly: [], rightOnly: []};
  const benchmarks = [...new Set(shared.map(([a]) => a.benchmark))];
  const selected = benchmarks.includes(filter) ? filter : '';
  const visible = shared.filter(([a]) => !selected || selected === a.benchmark).sort((a, b) => {
    const value = sortValues[sort.field], x = value(a), y = value(b);
    if (x == null || y == null) return Number(x == null) - Number(y == null);
    const order = typeof x === 'string' ? x.localeCompare(y, language) : x - y;
    return sort.descending ? -order : order;
  });

  function picker(label, value, other, set) {
    return <label>{t(label)}<select value={value} onChange={event => {set(event.target.value); setFilter('');}}>
      <option value="">{t('Choose an agent')}</option>
      {agents.map(agent => <option key={agent.slug} value={agent.slug} disabled={agent.slug === other}>{agent.name}{scored.has(agent.slug) ? '' : ' · ' + t('No published score')}</option>)}
    </select></label>;
  }
  function sortHeader(field, label) {
    const current = sort.field === field;
    return <th scope="col" aria-sort={current ? sort.descending ? 'descending' : 'ascending' : undefined}>
      <button className="sort-button" onClick={() => setSort({field, descending: current ? !sort.descending : field !== 'benchmark'})}>
        {label} <span aria-hidden="true">{current ? sort.descending ? '↓' : '↑' : '↕'}</span>
      </button></th>;
  }

  return <>
    <header className="hero"><h1>{t('Compare two agents')}</h1><p className="sub">{t('Choose any two named agents. See shared benchmark results and which scores are still missing.')}</p>
      <div className="pair-pickers" id="tour-pickers">{picker('First agent', left, right, setLeft)}<button className="swap" type="button" disabled={!active} onClick={() => {setLeft(right); setRight(left);}} title={t('Swap agents')} aria-label={t('Swap agents')}>⇄</button>{picker('Second agent', right, left, setRight)}</div>
      {active && <a className="link" href={'#compare/' + encodeURIComponent(left + ',' + right)}>{t('Link to this comparison')}</a>}
    </header>
    {!active ? <p className="panel empty">{t('Select two different agents.')}</p> : <>
      <section id="tour-results" className="panel comparison-results" aria-labelledby="comparison-title"><h2 id="comparison-title">{t('{left} vs {right}', {left: leftName, right: rightName})}</h2>
        {shared.length ? <><p className="muted">{t('Each row uses the top leaderboard entry per agent for that protocol. Deltas are first agent minus second agent. The linked runs show the model and settings used.')}</p>
          <div className="filters comparison-toolbar"><label>{t('Filter by benchmark')} <select value={selected} onChange={event => setFilter(event.target.value)}>
            <option value="">{t('All benchmarks')}</option>{benchmarks.map(benchmark => <option key={benchmark}>{benchmark}</option>)}
          </select></label><span className="muted" role="status">{t('{count} matching protocols', {count: visible.length})}</span></div>
          <div className="table-scroll" tabIndex={0} role="region" aria-labelledby="comparison-title"><table><thead><tr>{sortHeader('benchmark', t('Shared benchmark'))}{sortHeader('left', leftName)}{sortHeader('right', rightName)}{sortHeader('delta', t('Delta'))}</tr></thead><tbody>
          {visible.map(([a, b]) => {
            const difference = delta(a, b);
            const uncertainty = [a.ci_low, a.ci_high, b.ci_low, b.ci_high].some(value => value == null) ? 'Uncertainty unavailable' : tied(a, b) ? 'Intervals overlap' : 'Intervals do not overlap';
            return <tr key={a.run_id + '/' + b.run_id + '/' + a.metric}><th scope="row"><strong>{a.benchmark}</strong><span className="cell-line">{a.metric}</span><span className="cell-line muted">{protocol(a, t)}</span></th>
              <Score run={a} t={t}/><Score run={b} t={t}/><td><strong className={difference > 0 ? 'delta-positive' : difference < 0 ? 'delta-negative' : undefined}>{difference == null ? t('Unavailable') : (difference > 0 ? '+' : '') + number(difference) + (isPercent(a) ? ' pp' : ' / 100')}</strong>
              <span className="cell-line muted">{t(uncertainty)}</span></td></tr>;
          })}
          </tbody></table></div></> : <p className="empty">{t('No comparable published results for this pair. A shared benchmark version and evaluation protocol are required to calculate a delta.')}</p>}
      </section>
      {visible.filter(([a, b]) => a.metric === 'success_pct' && a.total_cost_usd != null && b.total_cost_usd != null).map(pair => tradeoffs(pair))}
      <div className="grid-cards mt-4"><BenchmarkCoverage title={leftName + ' · ' + t('Unmatched results')} rows={leftOnly} t={t}/><BenchmarkCoverage title={rightName + ' · ' + t('Unmatched results')} rows={rightOnly} t={t}/></div>
    </>}
  </>;
}
