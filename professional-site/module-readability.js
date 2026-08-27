(function(){
  'use strict';
  const STYLE_ID='rw-professional-module-theme';
  const selector='.workspace-stage iframe';

  function restoreNativeModule(frame){
    if(!frame) return;
    try{
      const doc=frame.contentDocument;
      if(!doc) return;
      const forced=doc.getElementById(STYLE_ID);
      if(forced) forced.remove();
      if(doc.documentElement){
        doc.documentElement.style.removeProperty('color-scheme');
        doc.documentElement.removeAttribute('data-rw-forced-theme');
      }
      if(doc.body) doc.body.removeAttribute('data-rw-forced-theme');
    }catch(e){}
  }

  function bind(frame){
    if(!frame || frame.dataset.rwReadabilityBound==='1') return;
    frame.dataset.rwReadabilityBound='1';
    restoreNativeModule(frame);
    frame.addEventListener('load',function(){
      setTimeout(function(){restoreNativeModule(frame);},0);
      setTimeout(function(){restoreNativeModule(frame);},120);
      setTimeout(function(){restoreNativeModule(frame);},700);
      setTimeout(function(){restoreNativeModule(frame);},1700);
    });
  }

  function scan(){
    document.querySelectorAll(selector).forEach(bind);
    document.querySelectorAll(selector+'.show').forEach(restoreNativeModule);
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',scan,{once:true});
  else scan();

  document.addEventListener('load',function(e){
    if(e.target && e.target.tagName==='IFRAME'){
      bind(e.target);
      setTimeout(function(){restoreNativeModule(e.target);},50);
    }
  },true);

  const observer=new MutationObserver(scan);
  if(document.documentElement) observer.observe(document.documentElement,{childList:true,subtree:true});
  setInterval(scan,600);
})();