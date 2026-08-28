const { chromium } = require('playwright-core');

(async()=>{
  const executablePath=process.env.CHROME_BIN;
  const base=process.env.RW_BASE_URL||'http://127.0.0.1:4173/professional-v2/index.html';
  if(!executablePath) throw new Error('CHROME_BIN is not set');
  const browser=await chromium.launch({headless:true,executablePath,args:['--no-sandbox','--disable-dev-shm-usage']});
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  const shellErrors=[];
  page.on('pageerror',e=>shellErrors.push(e&&e.stack?e.stack:String(e)));
  page.on('console',m=>{if(m.type()==='error')console.log('[shell console error]',m.text())});
  const assert=(cond,msg)=>{if(!cond)throw new Error(msg)};
  try{
    await page.goto(base,{waitUntil:'domcontentloaded',timeout:20000});
    await page.waitForFunction(()=>window.RWV2&&window.RWV2.tools?.length===17);
    await page.waitForTimeout(100);
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
    await page.waitForTimeout(700);
    const direct=page.frames().find(f=>/rekentool-professional-staffing\.html/.test(f.url()));
    assert(!!direct,'Professional Staffing frame not loaded');
    assert(/Professional Staffing/i.test(await direct.locator('body').innerText()),'Professional Staffing content missing');
    console.log('[QA] workspace direct module PASS');
    await page.click('#workspaceBack');

    const tools=await page.evaluate(()=>RWV2.tools.map(t=>({
      id:t.id,name:t.name,type:t.type,src:t.src,pin:t.pin||null,
      resolved:t.src?new URL(t.src,location.href).href:null
    })));
    const results=[];
    for(const tool of tools){
      if(tool.type==='download'){
        try{
          const response=await page.request.get(tool.resolved,{timeout:15000});
          const item={id:tool.id,name:tool.name,type:tool.type,ok:response.ok(),detail:`HTTP ${response.status()}`,errors:[]};
          console.log('[TOOL QA]',item.ok?'PASS':'FAIL',tool.name,item.detail);
          results.push(item);
        }catch(error){
          const item={id:tool.id,name:tool.name,type:tool.type,ok:false,detail:String(error),errors:[]};
          console.log('[TOOL QA] FAIL',tool.name,item.detail);results.push(item);
        }
        continue;
      }

      const toolPage=await browser.newPage({viewport:{width:1280,height:900}});
      const errors=[];
      const consoleErrors=[];
      toolPage.on('pageerror',e=>errors.push(e&&e.stack?e.stack:String(e)));
      toolPage.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text())});
      let detail='';let ok=false;
      try{
        await toolPage.goto(tool.resolved,{waitUntil:'domcontentloaded',timeout:20000});
        await toolPage.waitForTimeout(tool.resolved.includes('legacy-module.html')?1300:600);
        if(tool.id==='rekentool-master'){
          const frameInfo=[];
          for(const frame of toolPage.frames()){
            let source='';
            try{source=await frame.evaluate(()=>typeof window.translateMerit==='function'?window.translateMerit.toString():'')}catch(_e){}
            frameInfo.push({url:frame.url(),hasTranslateMerit:!!source,source:source.slice(0,12000)});
          }
          console.log('[REKENTOOL FRAMES]',JSON.stringify(frameInfo));
        }
        const bodyText=(await toolPage.locator('body').innerText().catch(()=>'' )).replace(/\s+/g,' ').trim();
        const nodes=await toolPage.locator('body > *').count().catch(()=>0);
        const loaderError=/Unable to open this tool/i.test(bodyText);
        ok=!loaderError&&(bodyText.length>10||nodes>0)&&errors.length===0;
        detail=`url:${toolPage.url()};body:${bodyText.length};nodes:${nodes};consoleErrors:${consoleErrors.length}`;
      }catch(error){detail=String(error);ok=false;}
      const item={id:tool.id,name:tool.name,type:tool.type,ok,detail,errors,consoleErrors};
      console.log('[TOOL QA]',ok?'PASS':'FAIL',tool.name,detail);
      if(errors.length)console.log('[TOOL ERRORS]',tool.name,JSON.stringify(errors));
      if(consoleErrors.length)console.log('[TOOL CONSOLE]',tool.name,JSON.stringify(consoleErrors));
      results.push(item);
      await toolPage.close();
    }

    const failed=results.filter(x=>!x.ok);
    console.log('[QA MATRIX]',JSON.stringify({count:results.length,passed:results.length-failed.length,failed:failed.length,results},null,2));
    assert(results.length===17,'matrix count is not 17');
    assert(shellErrors.length===0,'shell page errors: '+JSON.stringify(shellErrors));
    assert(failed.length===0,'tool failures: '+JSON.stringify(failed,null,2));
    console.log('[QA] ALL 17 PASS WITH ZERO PAGE ERRORS');
  } finally {
    await browser.close();
  }
})().catch(e=>{console.error(e.stack||e);process.exit(1)});