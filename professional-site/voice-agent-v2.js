(function(){
'use strict';

const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
const HISTORY_KEY='rw_local_ai_history_v3';
const VOICE_KEY='rw_local_ai_voice_v3';
const LEGACY_SOURCE='../assets/js/legacy-apps-bundle.js?v=20260727-cv-match-engine-4';
const WEBLLM_CDN='https://esm.run/@mlc-ai/web-llm';

const I18N={
  pl:{title:'Rafal Wilk AI Assistant',sub:'Lokalny AI • bez klucza API',ready:'Gotowy',local:'AI działa lokalnie',loading:'Ładowanie lokalnego AI',model:'Model AI',download:'Pierwsze uruchomienie pobiera model do przeglądarki.',ask:'Zapytaj o stronę, aktywny moduł albo dowolny temat…',send:'Wyślij',listen:'Mów',stop:'Stop',voice:'Głos',site:'Rafal Wilk AI to platforma narzędzi biznesowych, kalkulatorów, HR, staffing, workforce i prywatnych projektów.',tools:'Dostępne moduły:',opened:'Otwieram moduł:',missing:'Nie znalazłem takiego modułu.',active:'Aktualnie otwarty moduł:',noActive:'Nie ma teraz otwartego modułu.',noGpu:'Ta przeglądarka nie udostępnia WebGPU. Funkcje strony i komendy modułów działają, ale pełny lokalny model AI wymaga aktualnego Chrome lub Edge z WebGPU.',modelError:'Nie udało się uruchomić lokalnego modelu AI.',thinking:'Analizuję…',legacyLoading:'Ładowanie modułu…',legacyError:'Nie udało się uruchomić modułu. Odśwież stronę i spróbuj ponownie.'},
  en:{title:'Rafal Wilk AI Assistant',sub:'Local AI • no API key',ready:'Ready',local:'AI runs locally',loading:'Loading local AI',model:'AI model',download:'The first run downloads the model into the browser cache.',ask:'Ask about the website, active module, or anything else…',send:'Send',listen:'Speak',stop:'Stop',voice:'Voice',site:'Rafal Wilk AI is a business platform for calculators, HR, staffing, workforce and private projects.',tools:'Available modules:',opened:'Opening module:',missing:'I could not find that module.',active:'Currently open module:',noActive:'No module is open right now.',noGpu:'This browser does not expose WebGPU. Website and module commands still work, but the full local AI model requires a current Chrome or Edge with WebGPU.',modelError:'The local AI model could not be started.',thinking:'Thinking…',legacyLoading:'Loading module…',legacyError:'The module could not be started. Refresh the page and try again.'},
  nl:{title:'Rafal Wilk AI Assistant',sub:'Lokale AI • geen API-sleutel',ready:'Klaar',local:'AI draait lokaal',loading:'Lokale AI laden',model:'AI-model',download:'Bij het eerste gebruik wordt het model in de browsercache gedownload.',ask:'Vraag iets over de website, actieve module of een ander onderwerp…',send:'Verstuur',listen:'Spreek',stop:'Stop',voice:'Stem',site:'Rafal Wilk AI is een businessplatform voor calculators, HR, staffing, workforce en privéprojecten.',tools:'Beschikbare modules:',opened:'Ik open module:',missing:'Ik kon die module niet vinden.',active:'Momenteel geopend module:',noActive:'Er is nu geen module geopend.',noGpu:'Deze browser biedt geen WebGPU. De website en modulecommando’s werken wel, maar het volledige lokale AI-model vereist een actuele Chrome of Edge met WebGPU.',modelError:'Het lokale AI-model kon niet worden gestart.',thinking:'Ik analyseer…',legacyLoading:'Module laden…',legacyError:'De module kon niet worden gestart. Vernieuw de pagina en probeer opnieuw.'}
};

let history=readHistory();
let engine=null;
let enginePromise=null;
let webllmModule=null;
let recognition=null;
let listening=false;
let legacyAppsPromise=null;

function lang(){
  const v=String(localStorage.getItem('rw_lang')||document.documentElement.lang||'pl').toLowerCase().slice(0,2);
  return ['pl','en','nl'].includes(v)?v:'pl';
}
function tr(k){return I18N[lang()]?.[k]||I18N.pl[k]||k;}
function norm(v){return String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim();}
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));}
function readHistory(){try{const x=JSON.parse(localStorage.getItem(HISTORY_KEY)||'[]');return Array.isArray(x)?x.slice(-24):[]}catch{return[];}}
function saveHistory(){try{localStorage.setItem(HISTORY_KEY,JSON.stringify(history.slice(-24)));}catch{}}
function catalog(){return window.RWPlatform?.getCatalog?.()||$$('[data-tool-name]').map(c=>({name:c.dataset.toolName||'',description:c.querySelector('[data-tool-description]')?.textContent?.trim()||''})).filter(x=>x.name);}
function activeFrame(){return $('.workspace-stage iframe.show')||null;}
function activeModule(){
  const f=activeFrame();
  if(!f)return null;
  const out={title:$('#workspaceTitle')?.textContent?.trim()||f.title||f.id,id:f.id,text:'',fields:[],actions:[]};
  try{
    const d=f.contentDocument;
    if(d){
      out.text=String(d.body?.innerText||'').replace(/\s+/g,' ').trim().slice(0,12000);
      out.fields=$$('input,textarea,select',d).filter(e=>e.type!=='password').slice(0,60).map(e=>({label:String(e.getAttribute('aria-label')||e.name||e.id||e.placeholder||'field').slice(0,90),value:String(e.tagName==='SELECT'?(e.selectedOptions?.[0]?.textContent||e.value):(e.value||'')).slice(0,400)})).filter(x=>x.value);
      out.actions=$$('button,a,[role="button"]',d).slice(0,50).map(e=>(e.textContent||e.getAttribute('aria-label')||'').trim()).filter(Boolean);
    }
  }catch{}
  return out;
}

/* ---------- Safe legacy module loader ---------- */
function decodeBase64Utf8(b64){
  const bin=atob(b64); const bytes=new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);
  return new TextDecoder('utf-8').decode(bytes);
}
async function getLegacyApps(){
  if(legacyAppsPromise)return legacyAppsPromise;
  legacyAppsPromise=(async()=>{
    const r=await fetch(LEGACY_SOURCE,{cache:'force-cache'});
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
  })();
  return legacyAppsPromise;
}
function showWorkspaceForLegacy(title){
  $$('.workspace-stage iframe').forEach(f=>f.classList.remove('show'));
  $('.viewport')?.classList.add('active');
  document.body.classList.add('app-open');
  const wt=$('#workspaceTitle'); if(wt)wt.textContent=title||'Rafal Wilk AI';
  const l=$('#workspaceLoading'); if(l){l.hidden=false;l.textContent=tr('legacyLoading');}
  document.title='Rafal Wilk AI — '+(title||'Module');
}
async function openLegacyModule(idx,title){
  const frame=$('#appframe'); if(!frame)throw new Error('appframe missing');
  showWorkspaceForLegacy(title);
  const apps=await getLegacyApps();
  const app=apps[Number(idx)]; if(!app?.b64)throw new Error('Legacy module '+idx+' missing');
  const html=decodeBase64Utf8(app.b64);
  frame.classList.remove('show');
  frame.removeAttribute('src');
  frame.onload=()=>{
    const loading=$('#workspaceLoading'); if(loading)loading.hidden=true;
    try{window.__rwPlatformSetLang?.(lang());}catch{}
  };
  frame.srcdoc=html;
  frame.classList.add('show');
  try{localStorage.setItem('rw_active_module_idx',String(idx));}catch{}
  window.__rwActiveAppId='appframe';
  window.__rwActiveAppLang=lang();
  try{window.__rwSetActiveApp?.(title||app.title);}catch{}
  setTimeout(()=>{const loading=$('#workspaceLoading');if(loading)loading.hidden=true;},1200);
}
function requestLegacyModule(idx,title){
  const run=async()=>{
    try{
      if(window.__rwModulePinConsume && !window.__rwModulePinConsume())return;
      await openLegacyModule(idx,title);
    }catch(err){
      console.error('[RW legacy loader]',err);
      const l=$('#workspaceLoading');
      if(l){l.hidden=false;l.textContent=tr('legacyError');}
    }
  };
  if(typeof window.__rwRequestModulePin==='function')window.__rwRequestModulePin(run,title||'Module');
  else run();
}
// Capture-phase interception prevents the old site.js legacy loader from executing.
document.addEventListener('click',e=>{
  const btn=e.target?.closest?.('[data-legacy-idx]');
  if(!btn)return;
  e.preventDefault();
  e.stopImmediatePropagation();
  requestLegacyModule(Number(btn.dataset.legacyIdx),btn.dataset.title||btn.closest('[data-tool-name]')?.dataset.toolName||'Module');
},true);

/* ---------- Agent UI ---------- */
function installUI(){
  const panel=$('#rwAgentPanel'),log=$('#rwLog'); if(!panel||!log)return;
  panel.classList.add('rw-local-ai');
  const title=panel.querySelector('.rw-agent-title'); if(title)title.textContent=tr('title');
  const sub=panel.querySelector('.rw-agent-subtitle'); if(sub)sub.textContent=tr('sub');
  const visual=$('#rwVisual');
  if(visual)visual.innerHTML='<div class="rw-local-status"><span class="rw-local-dot"></span><div><strong id="rwState"></strong><small id="rwHint"></small><div class="rw-model-progress"><i id="rwModelBar"></i></div></div></div>';
  const controls=panel.querySelector('.rw-controls');
  if(controls)controls.innerHTML='<button class="rw-btn" id="rwListenBtn" type="button"></button><label class="rw-local-voice"><input id="rwVoiceEnabled" type="checkbox"> <span></span></label>';
  $('#rwRefreshBtn')?.parentElement?.remove();
  log.classList.add('rw-local-chat');
  if(!$('#rw-local-ai-style')){
    const st=document.createElement('style'); st.id='rw-local-ai-style';
    st.textContent=`#rwAgentPanel.rw-local-ai{width:min(650px,calc(100vw - 28px));max-height:min(820px,calc(100vh - 28px))}.rw-local-ai .rw-holo{min-height:auto!important;padding:13px!important}.rw-local-status{display:grid;grid-template-columns:auto 1fr;gap:10px;align-items:center}.rw-local-dot{width:10px;height:10px;border-radius:50%;background:#52d7a8;box-shadow:0 0 16px rgba(82,215,168,.65)}.rw-local-status strong{display:block;font-size:12px;color:#eef7ff}.rw-local-status small{display:block;margin-top:2px;font-size:10px;color:#879bb3}.rw-model-progress{height:3px;margin-top:7px;background:rgba(255,255,255,.07);border-radius:99px;overflow:hidden}.rw-model-progress i{display:block;width:0;height:100%;background:currentColor;transition:width .2s}.rw-local-ai .rw-log.rw-local-chat{height:330px;max-height:40vh;display:flex;flex-direction:column;gap:9px;padding:12px;overflow:auto}.rw-local-msg{max-width:88%;padding:10px 12px;border-radius:12px;border:1px solid rgba(123,174,246,.15);font-size:12px;line-height:1.55;color:#dce9f7;background:rgba(255,255,255,.035)}.rw-local-msg.user{align-self:flex-end;background:rgba(74,148,239,.16);border-color:rgba(91,166,255,.28)}.rw-local-msg.assistant{align-self:flex-start}.rw-local-voice{display:flex;align-items:center;gap:5px;color:#91a6bd;font-size:10px}.rw-local-ai .rw-input{min-height:44px}.rw-local-ai .rw-row{align-items:stretch}@media(max-width:620px){#rwAgentPanel.rw-local-ai{width:100%;max-height:92vh}.rw-local-ai .rw-log.rw-local-chat{height:36vh}}`;
    document.head.appendChild(st);
  }
  applyTexts(); renderHistory();
}
function applyTexts(){
  const title=$('.rw-agent-title');if(title)title.textContent=tr('title');
  const sub=$('.rw-agent-subtitle');if(sub)sub.textContent=tr('sub');
  const input=$('#rwCommandInput');if(input)input.placeholder=tr('ask');
  const send=$('#rwSendBtn');if(send)send.textContent=tr('send');
  const listen=$('#rwListenBtn');if(listen)listen.textContent=listening?tr('stop'):tr('listen');
  const voiceLabel=$('.rw-local-voice span');if(voiceLabel)voiceLabel.textContent=tr('voice');
  const voice=$('#rwVoiceEnabled');if(voice)voice.checked=localStorage.getItem(VOICE_KEY)!=='0';
  setStatus(tr('ready'),tr('local'));
}
function setStatus(main,hint,progress){
  const s=$('#rwState'),h=$('#rwHint'),b=$('#rwModelBar');
  if(s)s.textContent=main||tr('ready'); if(h)h.textContent=hint||tr('local');
  if(b&&typeof progress==='number')b.style.width=Math.max(0,Math.min(100,progress))+'%';
  window.dispatchEvent(new CustomEvent('rwAiStatus',{detail:{configured:false,online:false,label:tr('local')}}));
}
function renderHistory(){
  const box=$('#rwLog');if(!box)return; box.innerHTML='';
  if(!history.length)addBubble('assistant',tr('site'),false);
  else history.forEach(x=>addBubble(x.role,x.text,false));
}
function addBubble(role,text,persist=true){
  const box=$('#rwLog');if(!box)return;
  const d=document.createElement('div');d.className='rw-local-msg '+(role==='user'?'user':'assistant');d.innerHTML=esc(text).replace(/\n/g,'<br>');box.appendChild(d);box.scrollTop=box.scrollHeight;
  if(persist){history.push({role,text:String(text)});saveHistory();}
}

/* ---------- Local deterministic knowledge / commands ---------- */
function localCommand(raw){
  const n=norm(raw),tools=catalog(); if(!n)return null;
  if(['co to za strona','czym jest ta strona','what is this site','what is this website','wat is deze site'].some(x=>n.includes(norm(x))))return tr('site');
  if(['jakie narzedzia','jakie moduly','lista narzedzi','list tools','what tools','which tools','welke tools','welke modules'].some(x=>n.includes(norm(x))))return tr('tools')+' '+tools.map(x=>x.name).join(', ')+'.';
  if(['gdzie jestem','jaki modul','jaki moduł','active module','what module','welke module','waar ben ik'].some(x=>n.includes(norm(x)))){const m=activeModule();return m?tr('active')+' '+m.title+'.':tr('noActive');}
  const verbs=['otworz','otwórz','open','uruchom','start','openen'];
  if(verbs.some(v=>n.startsWith(norm(v)+' ')||n.includes(' '+norm(v)+' '))){
    const score=tools.map(x=>({x,s:norm(x.name).split(' ').filter(w=>w.length>2).filter(w=>n.includes(w)).length})).sort((a,b)=>b.s-a.s)[0];
    if(score?.s>0&&window.RWPlatform?.openToolByName){window.RWPlatform.openToolByName(score.x.name);return tr('opened')+' '+score.x.name+'.';}
    return tr('missing');
  }
  const tool=tools.find(x=>n.includes(norm(x.name)));
  if(tool&&['co robi','do czego','what does','what is','wat doet','waarvoor'].some(x=>n.includes(norm(x))))return tool.name+': '+(tool.description||'');
  const dateWords=['jaka data','jaki dzisiaj dzien','jaki dziś dzień','what date','what day is it','welke datum','welke dag'];
  if(dateWords.some(x=>n.includes(norm(x))))return new Intl.DateTimeFormat(lang()==='nl'?'nl-NL':lang()==='en'?'en-GB':'pl-PL',{dateStyle:'full'}).format(new Date());
  return null;
}

/* ---------- WebLLM: full AI in browser, no API key ---------- */
async function loadWebLLM(){
  if(webllmModule)return webllmModule;
  webllmModule=await import(WEBLLM_CDN);
  return webllmModule;
}
function chooseModel(mod){
  const list=mod?.prebuiltAppConfig?.model_list||[];
  const ids=list.map(x=>x.model_id).filter(Boolean);
  const preferred=[
    'Qwen2.5-1.5B-Instruct-q4f16_1-MLC',
    'Qwen2.5-3B-Instruct-q4f16_1-MLC',
    'Llama-3.2-1B-Instruct-q4f16_1-MLC',
    'Llama-3.2-3B-Instruct-q4f16_1-MLC',
    'Phi-3.5-mini-instruct-q4f16_1-MLC'
  ];
  for(const id of preferred)if(ids.includes(id))return id;
  return ids.find(id=>/Qwen.*(?:1\.5B|3B).*Instruct/i.test(id))||ids.find(id=>/(?:1B|1\.5B|3B).*Instruct/i.test(id))||ids[0];
}
async function ensureEngine(){
  if(engine)return engine; if(enginePromise)return enginePromise;
  enginePromise=(async()=>{
    if(!navigator.gpu)throw new Error('WEBGPU_UNAVAILABLE');
    setStatus(tr('loading'),tr('download'),2);
    const mod=await loadWebLLM();
    const model=chooseModel(mod); if(!model)throw new Error('No compatible WebLLM model');
    engine=await mod.CreateMLCEngine(model,{initProgressCallback:p=>{
      const value=Math.round((Number(p.progress)||0)*100);
      setStatus(tr('loading'),p.text||model,value);
    }});
    setStatus(tr('ready'),tr('local'),100);
    return engine;
  })();
  try{return await enginePromise;}catch(e){enginePromise=null;throw e;}
}
function systemPrompt(){
  const m=activeModule();
  const tools=catalog().map(x=>x.name+(x.description?' — '+x.description:'')).join('\n');
  const language=lang()==='nl'?'Dutch':lang()==='en'?'English':'Polish';
  return `You are Rafal Wilk AI Assistant, running locally in the user's browser. Answer in ${language} unless the user explicitly asks for another language. Be concise, useful and factual. You know the Rafal Wilk AI website and its business tools. Never invent values that are not present in the supplied active-module context. If the question depends on live internet data, explain briefly that this local browser model cannot verify live web information. Do not ask for or mention API keys.\n\nWEBSITE TOOLS:\n${tools}\n\nACTIVE MODULE:\n${m?JSON.stringify(m):'none'}`;
}
async function askLocalAI(message){
  const e=await ensureEngine();
  const msgs=[{role:'system',content:systemPrompt()}];
  history.slice(-10).forEach(x=>msgs.push({role:x.role==='assistant'?'assistant':'user',content:x.text}));
  msgs.push({role:'user',content:message});
  const out=await e.chat.completions.create({messages:msgs,temperature:0.25,max_tokens:800});
  return String(out?.choices?.[0]?.message?.content||'').trim();
}

function speak(text){
  if(localStorage.getItem(VOICE_KEY)==='0'||!window.speechSynthesis)return;
  try{
    speechSynthesis.cancel();
    const u=new SpeechSynthesisUtterance(String(text).slice(0,1200));
    u.lang=lang()==='nl'?'nl-NL':lang()==='en'?'en-GB':'pl-PL';u.rate=.96;u.pitch=.95;
    const voices=speechSynthesis.getVoices();const short=u.lang.slice(0,2).toLowerCase();const v=voices.find(x=>(x.lang||'').toLowerCase().startsWith(short)&&/natural|online|microsoft|google/i.test(x.name))||voices.find(x=>(x.lang||'').toLowerCase().startsWith(short));if(v)u.voice=v;
    speechSynthesis.speak(u);
  }catch{}
}
async function sendMessage(raw){
  const message=String(raw||'').trim();if(!message)return;
  addBubble('user',message,true);setStatus(tr('thinking'),tr('local'));
  let answer=localCommand(message);
  if(!answer){
    try{answer=await askLocalAI(message);}catch(e){
      console.error('[RW local AI]',e);
      answer=e?.message==='WEBGPU_UNAVAILABLE'?tr('noGpu'):tr('modelError')+' '+String(e?.message||'');
    }
  }
  answer=answer||tr('modelError');addBubble('assistant',answer,true);speak(answer);setStatus(tr('ready'),tr('local'));
}
function setupRecognition(){
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;if(!SR)return;
  recognition=new SR();recognition.continuous=false;recognition.interimResults=false;
  recognition.onresult=e=>{const text=e.results?.[0]?.[0]?.transcript||'';listening=false;applyTexts();sendMessage(text);};
  recognition.onend=()=>{listening=false;applyTexts();};recognition.onerror=()=>{listening=false;applyTexts();};
}
function toggleListen(){
  if(!recognition)setupRecognition();if(!recognition)return;
  if(listening){try{recognition.abort();}catch{}listening=false;applyTexts();return;}
  recognition.lang=lang()==='nl'?'nl-NL':lang()==='en'?'en-GB':'pl-PL';
  try{recognition.start();listening=true;applyTexts();setStatus(tr('listen'),tr('ready'));}catch{}
}
function openAgent(){const o=$('#rwAgentOverlay');if(o){o.classList.add('open');o.setAttribute('aria-hidden','false');}applyTexts();}
function closeAgent(){try{speechSynthesis.cancel();}catch{}const o=$('#rwAgentOverlay');if(o){o.classList.remove('open');o.setAttribute('aria-hidden','true');}}
function bindUI(){
  $('#rwVoiceLauncher')?.addEventListener('click',openAgent);
  $('#rwAgentClose')?.addEventListener('click',closeAgent);
  $('#rwSendBtn')?.addEventListener('click',()=>{const i=$('#rwCommandInput');const v=i?.value||'';if(i)i.value='';sendMessage(v);});
  $('#rwCommandInput')?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();const v=e.currentTarget.value;e.currentTarget.value='';sendMessage(v);}});
  $('#rwListenBtn')?.addEventListener('click',toggleListen);
  $('#rwVoiceEnabled')?.addEventListener('change',e=>{localStorage.setItem(VOICE_KEY,e.target.checked?'1':'0');if(!e.target.checked)try{speechSynthesis.cancel();}catch{}});
  window.addEventListener('rwLanguageChanged',()=>{applyTexts();});
}

window.RWAI={open:openAgent,close:closeAgent,isConfigured:()=>false,isOnline:()=>false,isLocal:()=>true,loadModel:ensureEngine,ask:sendMessage};

function init(){installUI();bindUI();setupRecognition();setStatus(tr('ready'),tr('local'));}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();