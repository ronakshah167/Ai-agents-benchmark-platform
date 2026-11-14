import './registry.css';

export const metadata={title:'AI agent benchmarks | Bifrost',description:'Versioned benchmarks and transparent comparisons for agent systems.'};
const themeScript = `try{const c=Object.fromEntries(document.cookie.split(';').map(p=>p.trim().split('=')));if(c.agentbench_consent==='allow'){if(['en','hi'].includes(c.agentbench_language))document.documentElement.lang=c.agentbench_language;}}catch{}`;
export const viewport={themeColor:'#ffe5ec'};
export default function Layout({children}){
  return <html lang="en" data-theme="light" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{__html:themeScript}}/></head><body><noscript><section className="shell panel"><h2>Welcome to Bifrost</h2><p>Compare whole AI agent systems using published benchmark results and traceable sources. Enable JavaScript for live scores, filters and comparisons. The introduction below remains readable without it.</p></section><style>{'.pip-launcher,.skip-link,.preferences-controls{display:none!important}'}</style></noscript>{children}</body></html>;
}
