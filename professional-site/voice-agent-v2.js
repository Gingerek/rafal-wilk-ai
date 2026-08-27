(function(){
  'use strict';
  function add(src){
    var s=document.createElement('script');
    s.src=src;
    s.async=false;
    document.head.appendChild(s);
  }
  add('./module-readability.js?v=20260827-native-modules-1');
  add('./voice-agent-core.js?v=20260827-local-ai-core-1');
})();