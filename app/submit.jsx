'use client';

import {useEffect,useState} from 'react';
import {readReports} from '../dist/import.mjs';
import {request,safeUrl} from './data.mjs';

const sessionKey = 'bifrost-submitter-session';
const reportLimit = 240 * 1024;

export function captureSubmissionLogin() {
  const params = new URLSearchParams(location.hash.slice(1));
  if (!['magiclink','signup','invite'].includes(params.get('type')) &&
      !location.pathname.startsWith('/auth-callback')) return false;

  const token = params.get('access_token');
  const expiresAt = Date.now() + Number(params.get('expires_in')) * 1000;
  if (token && expiresAt > Date.now()) {
    try {
      sessionStorage.setItem(sessionKey, JSON.stringify({token, expiresAt}));
    } catch {
      location.replace('/#submit/storage-unavailable');
      return true;
    }
  }
  location.replace(token ? '/#submit' : '/#submit/link-expired');
  return true;
}

export default function Submit({status}) {
  const [token,setToken] = useState('');
  const [busy,setBusy] = useState(false);
  const [notice,setNotice] = useState('');
  const [kind,setKind] = useState('agent');

  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(sessionKey));
      if (saved?.expiresAt > Date.now()) setToken(saved.token);
    } catch {}
  }, []);

  async function submit(event) {
    event.preventDefault();
    const target = event.currentTarget;
    const form = new FormData(target);
    setBusy(true);
    setNotice('');
    try {
      if (!token) {
        await request('/auth/v1/otp', {
          query:{redirect_to:new URL('/auth-callback/', location.origin).href},
          method:'POST',
          body:{email:form.get('email'),create_user:true},
        });
        setNotice('Check your email for a sign-in link.');
        return;
      }

      let details;
      if (kind === 'result') {
        const file = form.get('report');
        if (!file?.size || file.size > reportLimit) throw Error('Choose a JSON report up to 240 KB.');
        let report;
        try {
          report = JSON.parse(await file.text());
          readReports([report]);
        } catch {
          throw Error('Upload a valid agentbench-external-v1 report for Support Operations.');
        }
        details = {external_report:report};
      } else {
        const url = safeUrl(form.get('url'));
        if (!url) throw Error('Enter a valid HTTPS source URL.');
        details = {source_url:url, description:form.get('details')};
      }
      await request('/rest/v1/benchmark_submissions', {token,method:'POST',body:{kind,details}});
      setNotice('Submitted for review. Your submission is private until reviewed.');
      target.reset();
      setKind('agent');
    } catch (error) {
      if (token && error.status === 401) {
        sessionStorage.removeItem(sessionKey);
        setToken('');
        setNotice('Your session expired. Request a new sign-in link.');
      } else {
        setNotice(error.status ? (token ? 'The server rejected the submission. Check the report or try again.' : 'The sign-in email could not be sent. Check the address or try again later.') : error.message);
      }
    } finally {
      setBusy(false);
    }
  }

  return <>
    <h1>Submit for review</h1>
    <p className="sub">Register an agent for evaluation, upload a Support Operations report, or send a correction.</p>
    <p role="status">{notice || (status==='link-expired'?'The sign-in link expired or is invalid. Request a new link.':status==='storage-unavailable'?'Enable session storage in this browser and request a new link.':'')}</p>
    <form className="panel stack" onSubmit={submit}>
      {!token ? <>
        <label>Email <input name="email" type="email" required autoComplete="email"/></label>
        <p>Use an email link to create an account or sign in.</p>
        <button className="primary" disabled={busy}>Send sign-in link</button>
      </> : <>
        <label>Submission type <select value={kind} onChange={event=>setKind(event.target.value)}>
          <option value="agent">Register an agent for evaluation</option>
          <option value="result">Upload benchmark report</option>
          <option value="dispute">Send a correction or dispute</option>
        </select></label>
        {kind === 'result'
          ? <label>Benchmark report (.json) <input name="report" type="file" accept=".json,application/json" required/></label>
          : <>
            <label>Source URL <input name="url" type="url" required maxLength={2000}/></label>
            <label>{kind === 'agent' ? 'Agent name, version and what to evaluate' : 'Details'} <textarea name="details" required maxLength={2500}/></label>
          </>}
        <button className="primary" disabled={busy}>Submit for review</button>
      </>}
    </form>
  </>;
}
