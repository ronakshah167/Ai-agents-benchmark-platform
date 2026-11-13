'use client';

import {useEffect, useRef} from 'react';
import {usePreferences} from './preferences.jsx';
import {tourStops} from './translations.mjs';

const tourKey = 'agentbench-tour-v1';

export function shouldStartTour() {
  const home = ['', '#', '#home'].includes(window.location.hash);
  if (!home) return false;
  try { return localStorage.getItem(tourKey) !== 'seen'; }
  catch { return true; }
}

export function rememberTour() {
  try { localStorage.setItem(tourKey, 'seen'); }
  catch { /* The visitor can still dismiss the tour when browser storage is disabled. */ }
}

export default function SiteTour({step, page, ready, onMove, onClose}) {
  const {t} = usePreferences();
  const dialog = useRef(null);
  const title = useRef(null);
  const active = step !== null;
  const stop = active ? tourStops[step] : null;
  const last = step === tourStops.length - 1;

  useEffect(() => {
    const element = dialog.current;
    if (active && !element.open) element.showModal();
    if (!active && element.open) element.close();
  }, [active]);

  useEffect(() => {
    if (!stop) return;
    title.current.focus({preventScroll: true});
  }, [stop]);

  useEffect(() => {
    if (!stop || page !== stop.page) return;
    const target = document.getElementById(stop.target) ?? document.getElementById('main-content');
    target.classList.add('tour-highlight');
    target.scrollIntoView({block: 'start', behavior: 'instant'});
    return () => target.classList.remove('tour-highlight');
  }, [stop, page, ready]);

  return <dialog className="tour-dialog" ref={dialog} aria-labelledby="tour-title" aria-describedby="tour-copy" onCancel={event => {event.preventDefault(); onClose();}}>
    {stop && <>
      <div className="tour-intro">
        <div className="tour-robot" aria-hidden="true"><span className="robot-antenna"/><span className="robot-face"><i/><i/></span></div>
        <div><p className="tour-name">{t('Pixel · Your guide')}</p><h2 id="tour-title" ref={title} tabIndex={-1}>{t(stop.title)}</h2></div>
      </div>
      <p id="tour-copy">{t(stop.copy)}</p>
      <div className="tour-progress" aria-label={t('Step {step} of {total}', {step: step + 1, total: tourStops.length})}>
        <span>{t('Step {step} of {total}', {step: step + 1, total: tourStops.length})}</span>
        <span className="tour-dots" aria-hidden="true">{tourStops.map((item, index) => <i key={item.target} className={index <= step ? 'filled' : undefined}/>)}</span>
      </div>
      <div className="tour-actions">
        <button type="button" className="tour-skip" onClick={onClose}>{t('Skip tour')}</button>
        {step > 0 && <button type="button" onClick={() => onMove(step - 1)}>{t('Back')}</button>}
        <button type="button" className="primary" onClick={() => last ? onClose() : onMove(step + 1)}>{t(last ? 'Finish' : 'Next')}{!last && <span aria-hidden="true"> →</span>}</button>
      </div>
    </>}
  </dialog>;
}
