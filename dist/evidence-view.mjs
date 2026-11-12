import {pairedOutcomes} from './evidence.mjs';

export const evidenceCopy={
  en:{evidence:'Run logs',evidenceTitle:'Run evidence',evidenceSub:'Inspect the expected outcome, recorded state and tool sequence behind every score.',
    reliability:'Pass³ reliability',reliabilityNote:'Pass³ is the share of tasks passed on all three attempts. Headline scores use the first attempt.',
    paired:'Matched task outcomes',pairedNote:'Counts compare first-attempt results for the same tasks.',only:'only',both:'Both passed',neither:'Neither passed',
    attempt:'Attempt',allTasks:'All results',failed:'Failed tasks',violated:'Policy violations',pass:'Pass',fail:'Fail',compliant:'Compliant',
    task:'Task',decision:'Decision',environment:'Recorded state',expected:'Expected',actual:'Observed',trace:'Tool sequence',noTools:'No tool calls',
    noEvidence:'Evidence unavailable',noState:'No state change',export:'Export run JSON',taskResults:'Task results',
    policyReasons:{read_only:'Write attempted in a read-only task',unverified_write:'Write for an unverified account',ineligible_refund:'Refund outside eligibility rules'}},
  hi:{evidence:'रन लॉग',evidenceTitle:'रन के प्रमाण',evidenceSub:'हर स्कोर के पीछे अपेक्षित परिणाम, दर्ज स्थिति और टूल क्रम देखें।',
    reliability:'तीनों प्रयासों में सफलता',reliabilityNote:'Pass³ उन कार्यों का प्रतिशत है जो तीनों प्रयासों में सफल हुए। मुख्य स्कोर पहले प्रयास का है।',
    paired:'समान कार्यों के परिणाम',pairedNote:'तुलना समान कार्यों के पहले प्रयास पर आधारित है।',only:'केवल',both:'दोनों सफल',neither:'दोनों असफल',
    attempt:'प्रयास',allTasks:'सभी परिणाम',failed:'असफल कार्य',violated:'नीति उल्लंघन',pass:'सफल',fail:'असफल',compliant:'नीति का पालन',
    task:'कार्य',decision:'निर्णय',environment:'दर्ज स्थिति',expected:'अपेक्षित',actual:'देखा गया',trace:'टूल क्रम',noTools:'कोई टूल कॉल नहीं',
    noEvidence:'प्रमाण उपलब्ध नहीं',noState:'स्थिति में बदलाव नहीं',export:'रन JSON डाउनलोड करें',taskResults:'कार्य परिणाम',
    policyReasons:{read_only:'केवल पढ़ने वाले कार्य में बदलाव का प्रयास',unverified_write:'असत्यापित खाते में बदलाव',ineligible_refund:'अपात्र खाते में रिफंड'}},
};

export function taskRows(batch,scenario,status){
  return batch.filter(row=>(scenario==='all'||row.scenario_id===scenario)&&
    (status==='all'||(status==='failed'&&!row.passed)||(status==='policy'&&!row.policy_ok)));
}

export function evidenceList(rows,t,escape){
  const value=(row,key)=>Object.hasOwn(row,key)?escape(row[key]??t.noState):t.noEvidence;
  return '<section class="panel evidence-list" aria-label="'+t.taskResults+'">'+rows.map(row=>'<details><summary><span class="mono">'+escape(row.task_id)+'</span><span>'+escape(t[row.scenario_id]??row.scenario_id)+'</span><span class="result '+(row.passed?'':'failed')+'">'+(row.passed?t.pass:t.fail)+'</span></summary><div class="evidence-detail"><dl>'+
    [['decision','expected_answer','answer'],['environment','expected_state','final_state']].map(([label,expected,actual])=>'<div><dt>'+t[label]+'</dt><dd>'+t.expected+' <code>'+value(row,expected)+'</code></dd><dd>'+t.actual+' <code>'+value(row,actual)+'</code></dd></div>').join('')+
    '<div><dt>'+t.trace+'</dt><dd>'+ (row.trace.length?row.trace.map(escape).join(' → '):row.tool_calls?t.noEvidence:t.noTools)+'</dd></div>'+
    '<div><dt>'+t.policy+'</dt><dd>'+(row.policy_ok?t.compliant:row.violations.map(v=>escape(t.policyReasons[v]??v)).join(' · ')||t.violated)+'</dd></div></dl></div></details>').join('')+(rows.length?'':'<p class="empty">'+t.none+'</p>')+'</section>';
}

export function pairedView(active,scenario,t,escape){
  const pairs=active.flatMap((left,i)=>active.slice(i+1).filter(right=>left.attempts.length&&right.attempts.length).map(right=>{
    const score=pairedOutcomes(left.attempts[0],right.attempts[0],scenario);
    return {left:left.a.name,right:right.a.name,score};
  }));
  return pairs.length?'<section class="section"><div class="section-head"><div><h2>'+t.paired+'</h2><p>'+t.pairedNote+'</p></div></div><div class="paired-grid">'+pairs.map(({left,right,score})=>'<div class="card paired"><h3>'+escape(left)+' / '+escape(right)+'</h3><dl>'+[[left+' · '+t.only,score.left],[right+' · '+t.only,score.right],[t.both,score.both],[t.neither,score.neither]].map(([name,value])=>'<div><dt>'+escape(name)+'</dt><dd>'+value+'</dd></div>').join('')+'</dl></div>').join('')+'</div></section>':'';
}
