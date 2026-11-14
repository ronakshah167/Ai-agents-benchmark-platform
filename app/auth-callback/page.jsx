'use client';

import {useEffect} from 'react';
import {captureSubmissionLogin} from '../submit.jsx';

export default function AuthCallback() {
  useEffect(() => {captureSubmissionLogin();}, []);
  return <main className="shell"><h1>Signing in to Bifrost</h1><a className="link" href="/#submit">Return to submissions</a></main>;
}
