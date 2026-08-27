(function(){
'use strict';

const DEF='135';
const EXCEL='4685';
const LEGACY_SOURCE='../assets/js/legacy-apps-bundle.js?v=20260827-srcdoc-loader-5';
let lang=normLang(localStorage.getItem('rw_lang')||'pl');
let pending=null;
let pin=DEF;
let authorized=false;
let legacyAppsPromise=null;

const TXT={
pl:{navHome:'Start',navTools:'Narzędzia',navProjects:'My Projects',navAi:'AI Agent',eyebrow:'Business AI Platform',tagline:'AI, automatyzacja i praktyczne narzędzia biznesowe w jednym ekosystemie.',lead:'Platforma łączy kalkulatory, rozwiązania HR i staffing, analitykę oraz narzędzia operacyjne bez zmiany istniejącej logiki biznesowej.',ctaTools:'Zobacz narzędzia',ctaProjects:'Otwórz My Projects',status:'Platforma gotowa',cap1:'Kalkulatory i modele',cap1c:'Bill rate, budżety, merit, CAO i narzędzia staffingowe.',cap2:'HR i workforce',cap2c:'Intake, CV Match, spotkania, home office i workflow operacyjne.',cap3:'AI Assistant',cap3c:'Lokalny asystent AI bez klucza API.',toolsK:'Narzędzia',toolsH:'Rozwiązania gotowe do pracy',toolsI:'Każdy moduł otwiera się wewnątrz platformy z zachowaniem obecnej logiki, PIN i języków.',catCalc:'Calculators',catRecruit:'Recruitment & Staffing',catHr:'HR & Workforce',catProjects:'My Projects',open:'Otwórz',download:'Pobierz Excel',projectsK:'Chroniony obszar',projectsH:'My Projects',projectsP:'Prywatny obszar projektowy z istniejącym dostępem PIN.',projectsBtn:'Otwórz My Projects',security:'Dostęp chroniony istniejącym mechanizmem PIN.',aiH:'Rafal Wilk AI Assistant',aiP:'Asystent działa lokalnie w przeglądarce bez klucza API, zna stronę i aktywne moduły oraz może otwierać narzędzia.',aiBtn:'Otwórz AI Agent',back:'Powrót do platformy',pinTitle:'Dostęp do modułu',pinText:'Wpisz PIN, aby otworzyć:',cancel:'Anuluj',unlock:'Odblokuj',wrong:'Nieprawidłowy kod. Spróbuj ponownie.',loading:'Ładowanie modułu…',loadError:'Nie udało się uruchomić modułu.',footer:'Narzędzia biznesowe, AI i automatyzacja.',legal:'Legal & Privacy: zawartość platformy pozostaje własnością Rafała Wilka.'},
en:{navHome:'Home',navTools:'Tools',navProjects:'My Projects',navAi:'AI Agent',eyebrow:'Business AI Platform',tagline:'AI, automation and practical business tools in one ecosystem.',lead:'Calculators, HR and staffing workflows, analytics and operational tools in one platform without changing existing business logic.',ctaTools:'Explore tools',ctaProjects:'Open My Projects',status:'Platform ready',cap1:'Calculators & models',cap1c:'Bill rate, budgets, merit, CAO and staffing calculators.',cap2:'HR & workforce',cap2c:'Intake, CV Match, meetings, home office and operational workflows.',cap3:'AI Assistant',cap3c:'Local AI assistant with no API key.',toolsK:'Tools',toolsH:'Solutions ready to use',toolsI:'Every module opens inside the platform while preserving existing logic, PIN access and languages.',catCalc:'Calculators',catRecruit:'Recruitment & Staffing',catHr:'HR & Workforce',catProjects:'My Projects',open:'Open',download:'Download Excel',projectsK:'Protected area',projectsH:'My Projects',projectsP:'Private project area with existing PIN access.',projectsBtn:'Open My Projects',security:'Protected by the existing PIN mechanism.',aiH:'Rafal Wilk AI Assistant',aiP:'The assistant runs locally in your browser without an API key, understands the website and active modules, and can open tools.',aiBtn:'Open AI Agent',back:'Back to platform',pinTitle:'Module access',pinText:'Enter the PIN to open:',cancel:'Cancel',unlock:'Unlock',wrong:'Incorrect code. Try again.',loading:'Loading module…',loadError:'Unable to load module.',footer:'Business tools, AI and automation.',legal:'Legal & Privacy: platform content remains the property of Rafał Wilk.'},
nl:{navHome:'Start',navTools:'Tools',navProjects:'My Projects',navAi:'AI Agent',eyebrow:'Business AI Platform',tagline:'AI, automatisering en praktische business tools in één ecosysteem.',lead:'Calculators, HR- en staffingworkflows, analytics en operationele tools in één platform zonder de bestaande businesslogica te wijzigen.',ctaTools:'Bekijk tools',ctaProjects:'Open My Projects',status:'Platform gereed',cap1:'Calculators & modellen',cap1c:'Bill rate, budgetten, merit, CAO en staffingcalculators.',cap2:'HR & workforce',cap2c:'Intake, CV Match, meetings, home office en operationele workflows.',cap3:'AI Assistant',cap3c:'Lokale AI-assistent zonder API-sleutel.',toolsK:'Tools',toolsH:'Oplossingen klaar voor gebruik',toolsI:'Elke module opent binnen het platform met behoud van bestaande logica, PIN-toegang en talen.',catCalc:'Calculators',catRecruit:'Recruitment & Staffing',catHr:'HR & Workforce',catProjects:'My Projects',open:'Open',download:'Download Excel',projectsK:'Beveiligde omgeving',projectsH:'My Projects',projectsP:'Privé-projectomgeving met bestaande PIN-toegang.',projectsBtn:'Open My Projects',security:'Beveiligd met het bestaande PIN-mechanisme.',aiH:'Rafal Wilk AI Assistant',aiP:'De assistent draait lokaal in je browser zonder API-sleutel, begrijpt de website en actieve modules en kan tools openen.',aiBtn:'Open AI Agent',back:'Terug naar platform',pinTitle:'Toegang tot module',pinText:'Voer de PIN in om te openen:',cancel:'Annuleren',unlock:'Ontgrendelen',wrong:'Onjuiste code. Probeer opnieuw.',loading:'Module laden…',loadError:'Module kon niet worden geladen.',footer:'Business tools, AI en automatisering.',legal:'Legal & Privacy: platforminhoud blijft eigendom van Rafał Wilk.'}
};

const DES={
'Contract Budget Calculator':['Budżet kontraktu i kontrola kosztów.','Contract budget and cost control.','Contractbudget en kostencontrole.'],
'New Bill Rate':['Przeliczenie nowej stawki bill rate.','New bill-rate calculation.','Berekening van een nieuwe bill rate.'],
'RekenTool Master':['Główny kalkulator stawek i scenariuszy.','Master rate and scenario calculator.','Hoofdcalculator voor tarieven en scenario’s.'],
'RekenTool Professional & General Staffing':['Professional i General Staffing.','Professional and General Staffing.','Professional en General Staffing.'],
'RekenTool General Staffing':['Kalkulator General Staffing.','General Staffing calculator.','General Staffing calculator.'],
'RekenTool Professional Staffing':['Kalkulator Professional Staffing.','Professional Staffing calculator.','Professional Staffing calculator.'],
'RekenTool Payroll':['Kalkulator payroll.','Payroll calculator.','Payrollcalculator.'],
'Merit Increase':['Merit increase 2026.','Merit increase 2026.','Merit increase 2026.'],
'MSD CAO Salary Check':['Sprawdzenie wynagrodzenia CAO.','CAO salary check.','CAO-salariscontrole.'],
'Merit Excel':['Arkusz kalkulacji zbiorczej.','Bulk calculation workbook.','Excel voor bulkberekeningen.'],
'Intake Call':['Wsparcie intake call.','Intake-call support.','Ondersteuning voor intake calls.'],
'CV Match':['Ocena dopasowania CV.','CV fit assessment.','Beoordeling van CV-match.'],
'Agency Overview':['Przegląd agencji.','Agency overview.','Overzicht van bureaus.'],
'Manager Meeting Register':['Rejestr spotkań z managerami.','Manager meeting register.','Register voor managermeetings.'],
'Home Office Tracker':['Śledzenie pracy z domu.','Home-office tracking.','Registratie van thuiswerk.'],
'Redukcja':['Moduł operacyjny.','Operational module.','Operationele module.'],
'My Projects':['Chroniony obszar projektów.','Protected project area.','Beveiligde projectomgeving.']
};

function normLang(v){v=String(v||'').toLowerCase().slice(0,2);return ['pl','en','nl'].includes(v)?v:'pl';}
function t(k){return TXT[lang]?.[k]||TXT.pl[k]||k;}
function esc(v){return String(v||'').replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]));}
function frames(){return Array.from(document.querySelectorAll('.workspace-stage iframe'));}
function loadingEl(){return document.getElementById('workspaceLoading');}

function render(){
  document.documentElement.lang=lang;
  document.querySelectorAll('[data-i18n]').forEach(e=>{const v=TXT[lang]?.[e.dataset.i18n];if(v)e.textContent=v;});
  document.querySelectorAll('[data-lang]').forEach(b=>b.classList.toggle('active',b.dataset.lang===lang));
  document.querySelectorAll('[data-tool-name]').forEach(c=>{
    const d=c.querySelector('[data-tool-description]');
    const a=c.querySelector('[data-action-label]');
    const x=DES[c.dataset.toolName];
    if(d&&x)d.textContent=x[{pl:0,en:1,nl:2}[lang]];
    if(a)a.textContent=c.dataset.download==='true'?t('download'):t('open');
  });
  const wl=document.getElementById('workspaceLang');if(wl)wl.textContent=lang.toUpperCase();
  ['rw_lang','doc_lang','supplier_lang'].forEach(k=>localStorage.setItem(k,lang));
  window.__rwActiveAppLang=lang;
  frames().forEach(sync);
  window.dispatchEvent(new CustomEvent('rwLanguageChanged',{detail:{lang}}));
}
function setLanguage(v){lang=normLang(v);render();}
window.__rwPlatformSetLang=setLanguage;

function pinParts(){return{g:document.getElementById('mc_gate'),i:document.getElementById('mc_pin'),e:document.getElementById('mc_err'),t:document.getElementById('mc_title'),p:document.getElementById('mc_text')};}
window.__rwModulePinConsume=()=>authorized?(authorized=false,true):false;
window.__rwRequestModulePin=(cb,title)=>{
  pending=cb;authorized=false;pin=String(title||'').toLowerCase().includes('merit excel')?EXCEL:DEF;
  const x=pinParts();
  if(x.t)x.t.textContent=t('pinTitle');
  if(x.p)x.p.textContent=t('pinText')+' '+(title||'Module');
  if(x.e)x.e.textContent='';
  if(x.i){x.i.value='';x.i.maxLength=pin.length;x.i.placeholder='•'.repeat(pin.length);}
  if(x.g){x.g.style.display='flex';x.g.setAttribute('aria-hidden','false');}
  setTimeout(()=>x.i?.focus(),0);
};
function unlock(){
  const x=pinParts();
  if(x.i?.value===pin){
    authorized=true;
    if(x.g){x.g.style.display='none';x.g.setAttribute('aria-hidden','true');}
    const cb=pending;pending=null;if(x.i)x.i.value='';cb?.();
  }else{
    if(x.e)x.e.textContent=t('wrong');
    if(x.i){x.i.value='';x.i.focus();}
  }
}
function closePin(){const x=pinParts();pending=null;authorized=false;if(x.g){x.g.style.display='none';x.g.setAttribute('aria-hidden','true');}}
function withPin(title,fn){
  if(window.__rwModulePinConsume())return fn();
  window.__rwRequestModulePin(()=>{if(window.__rwModulePinConsume())fn();},title||'Module');
}

function prep(title){
  frames().forEach(f=>f.classList.remove('show'));
  document.querySelector('.viewport')?.classList.add('active');
  document.body.classList.add('app-open');
  const wt=document.getElementById('workspaceTitle');if(wt)wt.textContent=title||'Rafal Wilk AI';
  const l=loadingEl();if(l){l.hidden=false;l.textContent=t('loading');}
  document.title='Rafal Wilk AI — '+(title||'Module');
}
function finishFrame(f){const l=loadingEl();if(l)l.hidden=true;theme(f);sync(f);}
function show(f,title){
  if(!f)return;
  prep(title);f.classList.add('show');
  const done=()=>finishFrame(f);
  if(f.contentDocument?.readyState==='complete')setTimeout(done,35);
  else f.addEventListener('load',done,{once:true});
  setTimeout(done,1400);
}
function showError(err){console.error('[Rafal Wilk AI module]',err);const l=loadingEl();if(l){l.hidden=false;l.textContent=t('loadError');}}
window.__rwSetActiveApp=title=>{const e=document.getElementById('workspaceTitle');if(e&&title)e.textContent=title;};
window.__rwSaveActiveFrame=(id,title)=>{try{localStorage.setItem('rw_active_frame_state',JSON.stringify({id,title}));localStorage.removeItem('rw_active_module_idx');}catch{}};

function openDirect(id,title){
  const f=document.getElementById(id);if(!f)return showError(new Error('Missing frame '+id));
  if(!f.getAttribute('src')&&f.dataset.src)f.setAttribute('src',f.dataset.src);
  window.__rwSaveActiveFrame(id,title||'');
  window.__rwActiveAppId=id;
  show(f,title);
}
window.openApp=(id,title)=>withPin(title||id||'Module',()=>openDirect(id,title));
window.openMyCompany=()=>window.openApp('mycompany','My Projects');
window.openMc=window.openMyCompany;

function decodeBase64Utf8(b64){
  const bin=atob(b64);const bytes=new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);
  return new TextDecoder('utf-8').decode(bytes);
}
async function getLegacyApps(){
  if(legacyAppsPromise)return legacyAppsPromise;
  legacyAppsPromise=(async()=>{
    const r=await fetch(LEGACY_SOURCE,{cache:'no-store'});
    if(!r.ok)throw new Error('Legacy source HTTP '+r.status);
    const text=await r.text();
    const marker=text.search(/const\s+APPS\s*=\s*/);
    if(marker<0)throw new Error('APPS data not found');
    const start=text.indexOf('[',marker);
    const end=text.indexOf('];',start);
    if(start<0||end<0)throw new Error('APPS data malformed');
    const apps=JSON.parse(text.slice(start,end+1));
    if(!Array.isArray(apps)||!apps.length)throw new Error('APPS data empty');
    return apps;
  })().catch(err=>{legacyAppsPromise=null;throw err;});
  return legacyAppsPromise;
}
async function openLegacy(idx,title){
  prep(title);
  const apps=await getLegacyApps();
  const app=apps[Number(idx)];
  if(!app?.b64)throw new Error('Legacy module '+idx+' missing');
  const html=decodeBase64Utf8(app.b64);
  const f=document.getElementById('appframe');
  if(!f)throw new Error('appframe missing');
  f.classList.remove('show');
  f.removeAttribute('src');
  f.srcdoc=html;
  f.classList.add('show');
  window.__rwActiveAppId='appframe';
  window.__rwActiveAppLang=lang;
  try{localStorage.setItem('rw_active_module_idx',String(idx));localStorage.removeItem('rw_active_frame_state');}catch{}
  window.__rwSetActiveApp(title||app.title||'Module');
  const done=()=>finishFrame(f);
  f.addEventListener('load',done,{once:true});
  setTimeout(done,1400);
}
function loadLegacy(idx,title){
  withPin(title||'Module',()=>openLegacy(idx,title).catch(showError));
}
window.__rwOpenLegacyModule=loadLegacy;

function closeWorkspace(){
  document.body.classList.remove('app-open');
  document.querySelector('.viewport')?.classList.remove('active');
  frames().forEach(f=>f.classList.remove('show'));
  document.title='Rafal Wilk AI';
  try{localStorage.removeItem('rw_active_frame_state');localStorage.removeItem('rw_active_module_idx');}catch{}
}
function downloadMerit(){
  withPin('Merit Excel 350',()=>{
    const a=document.createElement('a');
    a.href='../downloads/Merit_2026_Employee_Bulk_Calculator_350_exact.xlsx?v=authoritative-title-list-20260807-1';
    a.download='Merit_2026_Employee_Bulk_Calculator_350_correct_title_list_20260807.xlsx';
    document.body.appendChild(a);a.click();a.remove();
  });
}
function sync(f){
  if(!f)return;
  try{
    f.contentWindow?.postMessage({type:'rw:setLang',lang},'*');
    const w=f.contentWindow,d=f.contentDocument;if(!w||!d)return;
    d.documentElement.lang=lang;
    try{w.localStorage.setItem('rw_lang',lang);w.localStorage.setItem('doc_lang',lang);}catch{}
    ['__rwApplyModuleLang','__rwPlatformSetLang','setLanguage','applyLanguage','setLang','applyLang'].forEach(n=>{try{w[n]?.(lang);}catch{}});
  }catch{}
}
function theme(f){
  try{
    const d=f?.contentDocument;if(!d?.head||d.getElementById('rw-professional-module-theme'))return;
    const s=d.createElement('style');s.id='rw-professional-module-theme';
    s.textContent='html,body{background:linear-gradient(180deg,#07111d,#050b14)!important;color:#eef6ff!important;font-family:Inter,system-ui,sans-serif!important}.card,.panel,.container>.card,.section,.box,.widget{background:rgba(10,24,41,.94)!important;border-color:rgba(118,173,246,.18)!important;color:#eef6ff!important;box-shadow:0 16px 45px rgba(0,0,0,.18)!important}h1,h2,h3,h4,strong,.title,.section-title{color:#f2f7ff!important}p,label,.muted,.sub,.subtitle,.desc{color:#9aacc1!important}input,select,textarea{background:#081523!important;color:#eef6ff!important;border-color:rgba(118,173,246,.22)!important}th{background:#0b1a2c!important;color:#a9bad0!important}td{background:rgba(7,17,29,.75)!important;color:#dce8f5!important}th,td{border-color:rgba(118,173,246,.16)!important}@media(max-width:760px){table{display:block!important;overflow-x:auto!important;white-space:nowrap}}';
    d.head.appendChild(s);
  }catch{}
}
function toolCard(name){
  const q=String(name||'').toLowerCase();
  const cs=Array.from(document.querySelectorAll('[data-tool-name]'));
  return cs.find(c=>String(c.dataset.toolName||'').toLowerCase()===q)||cs.find(c=>String(c.dataset.toolName||'').toLowerCase().includes(q)||q.includes(String(c.dataset.toolName||'').toLowerCase()));
}
function openToolByName(name){const c=toolCard(name);if(!c)return false;const a=c.querySelector('[data-direct-frame],[data-legacy-idx],[data-my-projects],[data-download-merit],.tool-action');if(!a)return false;a.click();return true;}
function getCatalog(){return Array.from(document.querySelectorAll('[data-tool-name]')).map(c=>({name:c.dataset.toolName||'',description:c.querySelector('[data-tool-description]')?.textContent?.trim()||'',tag:c.querySelector('.tool-tag')?.textContent?.trim()||''}));}
async function healthCheck(){
  const result=[];
  for(const f of Array.from(document.querySelectorAll('.workspace-stage iframe[data-src]'))){
    try{const r=await fetch(f.dataset.src,{cache:'no-store'});result.push({id:f.id,url:f.dataset.src,ok:r.ok,status:r.status});}
    catch(e){result.push({id:f.id,url:f.dataset.src,ok:false,error:String(e?.message||e)});}
  }
  try{const apps=await getLegacyApps();result.push({id:'legacy-modules',ok:Array.isArray(apps)&&apps.length>=8,count:apps.length});}
  catch(e){result.push({id:'legacy-modules',ok:false,error:String(e?.message||e)});}
  return{ok:result.every(x=>x.ok),results:result};
}
window.RWPlatform={openToolByName,getCatalog,healthCheck,closeWorkspace,setLanguage,getActiveModule:()=>document.body.classList.contains('app-open')?(document.getElementById('workspaceTitle')?.textContent||''):''};

function bind(){
  document.querySelectorAll('[data-lang]').forEach(b=>b.addEventListener('click',()=>setLanguage(b.dataset.lang)));
  const m=document.getElementById('mobileMenu'),n=document.getElementById('navLinks');
  m?.addEventListener('click',()=>n?.classList.toggle('open'));
  document.querySelectorAll('#navLinks a').forEach(a=>a.addEventListener('click',()=>n?.classList.remove('open')));
  document.querySelectorAll('[data-scroll-target]').forEach(b=>b.addEventListener('click',()=>document.querySelector(b.dataset.scrollTarget)?.scrollIntoView({behavior:'smooth'})));
  document.querySelectorAll('[data-category-target]').forEach(b=>b.addEventListener('click',()=>document.querySelector(b.dataset.categoryTarget)?.scrollIntoView({behavior:'smooth',block:'start'})));
  document.querySelectorAll('[data-direct-frame]').forEach(b=>b.addEventListener('click',()=>window.openApp(b.dataset.directFrame,b.dataset.title)));
  document.querySelectorAll('[data-legacy-idx]').forEach(b=>b.addEventListener('click',e=>{e.preventDefault();loadLegacy(Number(b.dataset.legacyIdx),b.dataset.title);}));
  document.querySelectorAll('[data-my-projects]').forEach(b=>b.addEventListener('click',window.openMyCompany));
  document.querySelectorAll('[data-download-merit]').forEach(b=>b.addEventListener('click',downloadMerit));
  document.querySelectorAll('[data-open-agent]').forEach(b=>b.addEventListener('click',()=>window.RWAI?.open?.()||document.getElementById('rwVoiceLauncher')?.click()));
  document.getElementById('workspaceBack')?.addEventListener('click',closeWorkspace);
  document.getElementById('mc_ok')?.addEventListener('click',unlock);
  document.getElementById('mc_cancel')?.addEventListener('click',closePin);
  document.getElementById('mc_pin')?.addEventListener('keydown',e=>{if(e.key==='Enter')unlock();if(e.key==='Escape')closePin();});
  document.getElementById('mc_pin')?.addEventListener('input',e=>{e.target.value=e.target.value.replace(/\D/g,'').slice(0,pin.length);if(e.target.value===pin)unlock();});
  frames().forEach(f=>f.addEventListener('load',()=>{theme(f);sync(f);}));
  document.addEventListener('keydown',e=>{
    const editing=e.target&&(e.target.matches?.('input,textarea,select')||e.target.isContentEditable);if(editing)return;
    if(e.key.toLowerCase()==='k'&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&!e.shiftKey&&!e.repeat){
      e.preventDefault();
      const f=document.getElementById('msdcaosalarycheck');
      if(f?.classList.contains('show')){try{f.contentWindow?.postMessage({type:'msd:toggleCalculator'},'*');}catch{}return;}
      withPin('MSD CAO Salary Check',()=>{
        if(!f.getAttribute('src')&&f.dataset.src)f.setAttribute('src',f.dataset.src);
        show(f,'MSD CAO Salary Check');
        const go=()=>{try{f.contentWindow?.postMessage({type:'msd:toggleCalculator'},'*');}catch{}};
        f.addEventListener('load',()=>setTimeout(go,100),{once:true});setTimeout(go,700);
      });
    }
    if(e.key==='Escape'&&document.body.classList.contains('app-open'))closeWorkspace();
  });
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{bind();render();},{once:true});
else{bind();render();}
})();
