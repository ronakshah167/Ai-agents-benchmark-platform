import './registry.css';

export const metadata={title:'AgentBench Observatory',description:'Versioned benchmarks and transparent comparisons for agent systems.'};
const themeScript = `try{const c=Object.fromEntries(document.cookie.split(';').map(p=>p.trim().split('=')));if(c.agentbench_consent==='allow'){if(['en','hi'].includes(c.agentbench_language))document.documentElement.lang=c.agentbench_language;}}catch{}`;
export default function Layout({children}){
  return <html lang="en" data-theme="light" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{__html:themeScript}}/></head><body>{children}</body></html>;
}
