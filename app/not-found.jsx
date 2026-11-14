'use client';
import {useEffect} from 'react';
import Character from './character.jsx';
import {PreferencesProvider, PreferencesControls, usePreferences} from './preferences.jsx';

function MissingPage() {
  const {language} = usePreferences();
  const hindi = language === 'hi';
  useEffect(()=>{document.title='Page not found | Bifrost';},[]);
  return <main className="missing-page">
    <div className="missing-controls"><a className="brand" href="/">Bifrost</a><PreferencesControls/></div>
    <section className="missing-content">
      <p className="missing-code">404</p>
      <h1>{hindi ? 'यह पेज कतार में नहीं है।' : 'This page missed the queue.'}</h1>
      <p className="sub">{hindi ? 'हमारे एजेंट इंतज़ार कर रहे हैं, लेकिन यह पेज नहीं मिला। एजेंटों को देखने के लिए वापस जाएँ।' : 'The agents are waiting, but this page couldn’t be found. Head back to find your next agent.'}</p>
      <div className="character-queue" aria-hidden="true">{['#ca7e60','#8272ce','#5c9e90','#b78a51','#708fbb'].map((color,index)=><Character key={color} color={color} delay={index * -.3+'s'}/>)}</div>
      <div className="actions"><a className="button primary" href="/">{hindi ? 'होमपेज पर जाएँ' : 'Back to home'}</a><a className="button" href="/#agents">{hindi ? 'एजेंट देखें' : 'Explore agents'}</a></div>
    </section>
  </main>;
}
export default function NotFound(){return <PreferencesProvider><MissingPage/></PreferencesProvider>;}
