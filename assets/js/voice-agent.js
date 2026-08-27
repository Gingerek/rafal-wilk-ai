(function(){
  'use strict';
  var s=document.createElement('script');
  s.async=false;
  if(location.pathname.indexOf('/professional-site/')!==-1){
    s.src='./voice-agent-v2.js?v=20260827-local-ai-legacy-fix-3';
  }else{
    s.src='https://raw.githack.com/Gingerek/rafal-wilk-ai/main/assets/js/voice-agent.js?v=20260827-main-agent';
  }
  document.head.appendChild(s);
})();