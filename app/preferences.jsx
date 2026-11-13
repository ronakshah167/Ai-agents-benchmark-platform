'use client';

import {createContext, useContext, useEffect, useState} from 'react';
import {messages} from './translations.mjs';

const Preferences = createContext(null);
const consentKey = 'agentbench_consent';
const preferenceKeys = ['agentbench_theme', 'agentbench_language'];

function cookie(key, value, age = 15552000) {
  document.cookie = `${key}=${value}; Path=/; Max-Age=${age}; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
}

export function PreferencesProvider({children}) {
  const [theme, setTheme] = useState('light');
  const [language, setLanguage] = useState('en');
  const [consent, setConsent] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  useEffect(() => {
    const saved = Object.fromEntries(document.cookie.split(';').map(part => part.trim().split('=')));
    const decision = saved[consentKey];
    if (decision === 'allow') {
      if (Object.hasOwn(messages, saved[preferenceKeys[1]])) setLanguage(saved[preferenceKeys[1]]);
    }
    setConsent(decision === 'allow' || decision === 'deny' ? decision : 'unset');
  }, []);
  useEffect(() => {
    if (consent === null) return;
    document.documentElement.dataset.theme = theme;
    document.documentElement.lang = language;
    if (consent === 'allow') {
      cookie(preferenceKeys[0], '', 0);
      cookie(preferenceKeys[1], language);
    }
  }, [consent, theme, language]);
  const t = (key, values = {}) => (messages[language][key] ?? key).replace(/\{(\w+)\}/g, (match, name) => values[name] ?? match);
  function decide(decision) {
    cookie(consentKey, decision);
    if (decision === 'deny') preferenceKeys.forEach(key => cookie(key, '', 0));
    setConsent(decision);
    setSettingsOpen(false);
  }
  return <Preferences.Provider value={{t, language, setLanguage, theme, setTheme, openCookies: () => setSettingsOpen(true)}}>
    {children}
    {(consent === 'unset' || settingsOpen) && <section className="cookie-banner" aria-labelledby="cookie-heading">
      <div><h2 id="cookie-heading">{t('Cookie preferences')}</h2><p>{t('Choose whether this browser remembers your language. The site always opens in light mode. This dashboard uses no analytics or advertising cookies.')}</p></div>
      <div className="actions"><button onClick={() => decide('deny')}>{t('Essential only')}</button><button className="primary" onClick={() => decide('allow')}>{t('Save preferences')}</button>{settingsOpen && consent !== 'unset' && <button onClick={() => setSettingsOpen(false)}>{t('Close')}</button>}</div>
    </section>}
  </Preferences.Provider>;
}

export function usePreferences() { return useContext(Preferences); }

export function PreferencesControls() {
  const {t, theme, setTheme, language, setLanguage} = usePreferences();
  return <div className="preferences-controls">
    <select aria-label={t('Language')} value={language} onChange={event => setLanguage(event.target.value)}>
      <option value="en" lang="en">English</option><option value="hi" lang="hi">हिन्दी</option>
    </select>
    <select aria-label={t('Theme')} value={theme} onChange={event => setTheme(event.target.value)}>
      <option value="system">{t('System')}</option><option value="light">{t('Light')}</option><option value="dark">{t('Dark')}</option>
    </select>
  </div>;
}

export function BackToTop() {
  const {t} = usePreferences();
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const update = () => setVisible(window.scrollY > 420);
    update();
    window.addEventListener('scroll', update, {passive: true});
    return () => window.removeEventListener('scroll', update);
  }, []);
  return visible && <button className="back-top" onClick={() => {
    document.getElementById('site-header').focus({preventScroll: true});
    window.scrollTo({top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'});
  }}><span aria-hidden="true">↑</span> {t('Back to top')}</button>;
}

export function Loading({label}) {
  const {t} = usePreferences();
  return <section className="panel loading" role="status" aria-busy="true"><p><span className="spinner" aria-hidden="true"/>{t(label)}</p>
    <div className="skeleton" aria-hidden="true"><i/><i/><i/></div>
  </section>;
}
