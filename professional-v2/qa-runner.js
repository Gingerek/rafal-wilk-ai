const { chromium } = require('playwright-core');

(async()=>{
  const executablePath=process.env.CHROME_BIN;
  const base=process.env.RW_BASE_URL||'http://127.0.0.1:4173/professional-v2/index.html';
  if(!executablePath) throw new Error('CHROME_BIN is not set');
  const browser=await chromium.launch({headless:true,executablePath,args:['--no-sandbox','--disable-dev-shm-usage']});
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  const pageErrors=[];
  page.on('pageerror',e=>pageErrors.push(String(e)));
  page.on('console',m=>{if(m.type()==='error')console.log('[console error]',m.text())});
  const assert=(cond,msg)=>{if(!cond)throw new Error(msg)};
  try{
    await page.goto(base,{waitUntil:'domcontentloaded',timeout:20000});
    await page.waitForFunction(()=>window.RWV2&&window.RWV2.tools?.length===17);
    console.log('[QA] shell loaded');

    await page.click('#openTools');
    assert(await page.locator('#toolPalette').isVisible(),'tool palette not visible');
    assert(await page.locator('.tool-row').count()===17,'launcher does not contain 17 entries');
    await page.fill('#toolSearch','Professional Staffing');
    assert(await page.locator('.tool-row').count()===1,'search filtering mismatch');
    await page.click('#closeTools');
    console.log('[QA] launcher PASS');

    await page.evaluate(()=>RWV2.openToolById('professional-staffing'));
    assert(await page.locator('#pinGate').isVisible(),'PIN gate did not open');
    await page.fill('#pinInput','135'); await page.click('#pinSubmit');
    await page.waitForSelector('#workspace:not([hidden])',{timeout:5000});
    const directFrame=page.frames().find(f=>/rekentool-professional-staffing\.html/.test(f.url()));
    if(!directFrame){await page.waitForTimeout(1000)}
    const direct=page.frames().find(f=>/rekentool-professional-staffing\.html/.test(f.url()));
    assert(!!direct,'Professional Staffing frame not loaded');
    assert(/Professional Staffing/i.test(await direct.locator('body').innerText()),'Professional Staffing content missing');
    console.log('[QA] direct module PASS');
    await page.click('#workspaceBack');

    const result=await page.evaluate(async()=>{
      const tools=RWV2.tools;
      function direct(tool){return new Promise(resolve=>{
        const f=document.createElement('iframe');f.style.cssText='position:fixed;width:4px;height:4px;opacity:0;pointer-events:none;left:-30px;top:-30px';
        let done=false;const finish=(ok,detail)=>{if(done)return;done=true;f.remove();resolve({id:tool.id,name:tool.name,type:tool.type,ok,detail})};
        const timer=setTimeout(()=>finish(false,'direct timeout'),12000);
        f.onload=()=>setTimeout(()=>{clearTimeout(timer);try{const d=f.contentDocument;const text=(d?.body?.innerText||'').replace(/\s+/g,' ').trim();const nodes=d?.body?.children?.length||0;finish(text.length>10||nodes>0,`body:${text.length};nodes:${nodes}`)}catch(e){finish(false,String(e?.message||e))}},100);
        f.src=tool.src;document.body.appendChild(f);
      })}
      function legacy(tool){return new Promise(resolve=>{
        const f=document.createElement('iframe');f.style.cssText='position:fixed;width:4px;height:4px;opacity:0;pointer-events:none;left:-40px;top:-40px';let done=false;
        const finish=(ok,detail)=>{if(done)return;done=true;window.removeEventListener('message',onMsg);f.remove();resolve({id:tool.id,name:tool.name,type:tool.type,ok,detail})};
        const onMsg=e=>{if(e.source===f.contentWindow&&e.data?.type==='rw:legacy-status'&&Number(e.data.idx)===tool.idx)finish(!!e.data.ok,e.data.detail||'')};window.addEventListener('message',onMsg);
        setTimeout(()=>finish(false,'legacy timeout'),20000);f.src=`./legacy-bridge.html?idx=${tool.idx}&qa=1`;document.body.appendChild(f);
      })}
      async function download(tool){try{const r=await fetch(tool.src,{cache:'no-store'});return{id:tool.id,name:tool.name,type:tool.type,ok:r.ok,detail:`HTTP ${r.status}`}}catch(e){return{id:tool.id,name:tool.name,type:tool.type,ok:false,detail:String(e)}}}
      const results=[];
      for(const tool of tools){const r=tool.type==='legacy'?await legacy(tool):tool.type==='download'?await download(tool):await direct(tool);console.log('[matrix]',r.ok?'PASS':'FAIL',r.name,r.detail);results.push(r)}
      return{count:results.length,passed:results.filter(x=>x.ok).length,failed:results.filter(x=>!x.ok).length,results};
    });
    console.log('[QA MATRIX]',JSON.stringify(result,null,2));
    assert(result.count===17,'matrix count is not 17');
    assert(result.failed===0,'module failures: '+JSON.stringify(result.results.filter(x=>!x.ok)));
    assert(pageErrors.length===0,'page errors: '+JSON.stringify(pageErrors));
    console.log('[QA] ALL 17 PASS');
  } finally {
    await browser.close();
  }
})().catch(e=>{console.error(e.stack||e);process.exit(1)});
