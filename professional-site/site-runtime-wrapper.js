(function(){
'use strict';
function cleanFrame(frame){
  if(!frame)return;
  const clean=()=>{
    try{
      const d=frame.contentDocument;
      if(!d)return;
      d.getElementById('rw-professional-module-theme')?.remove();
      d.documentElement.style.colorScheme='light';
    }catch{}
  };
  clean();
  [0,25,80,180,500,1200].forEach(ms=>setTimeout(clean,ms));
}
function installReadabilityGuard(){
  const frames=()=>Array.from(document.querySelectorAll('.workspace-stage iframe'));
  frames().forEach(frame=>{
    frame.addEventListener('load',()=>cleanFrame(frame));
    cleanFrame(frame);
  });
  document.addEventListener('click',()=>frames().forEach(cleanFrame),true);
}
var core=document.createElement('script');
core.src='./site-core.js?v=20260827-native-modules-3';
core.async=false;
core.onload=function(){
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installReadabilityGuard,{once:true});
  else installReadabilityGuard();
};
document.head.appendChild(core);
})();