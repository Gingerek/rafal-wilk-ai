(function(){
  'use strict';
  var s=document.createElement('script');
  s.async=false;
  var professional=location.pathname.indexOf('/professional-site/')!==-1;
  if(professional){
    s.src='./voice-agent-v2.js?v=20260827-local-ai-legacy-fix-3';
    s.onload=function(){
      var p=document.querySelector('[data-i18n="aiP"]');
      if(p){
        var l=(localStorage.getItem('rw_lang')||document.documentElement.lang||'pl').slice(0,2);
        p.textContent=l==='en'?'The assistant runs locally in your browser without an API key and understands the website and active modules.':l==='nl'?'De assistent draait lokaal in je browser zonder API-sleutel en begrijpt de website en actieve modules.':'Asystent działa lokalnie w przeglądarce bez klucza API i rozumie stronę oraz aktywne moduły.';
      }
    };
  }else{
    s.src='https://raw.githack.com/Gingerek/rafal-wilk-ai/main/assets/js/voice-agent.js?v=20260827-main-agent';
  }
  document.head.appendChild(s);
})();