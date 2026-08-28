const { test, expect } = require('@playwright/test');

test.setTimeout(240000);
const BASE = process.env.RW_BASE_URL || 'http://127.0.0.1:4173/professional-v2/index.html';

test('executive shell and command palette work', async ({ page }) => {
  const errors=[]; page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(BASE,{waitUntil:'domcontentloaded'});
  await expect(page.locator('h1')).toContainText(/Narzędzia|Work tools|Tools voor werk/);
  await page.locator('#openTools').click();
  await expect(page.locator('#toolPalette')).toBeVisible();
  await expect(page.locator('.tool-row')).toHaveCount(17);
  await page.locator('#toolSearch').fill('Professional Staffing');
  await expect(page.locator('.tool-row')).toHaveCount(1);
  await page.locator('#closeTools').click();
  expect(errors).toEqual([]);
});

test('PIN gate and a native direct module open correctly', async ({ page }) => {
  await page.goto(BASE,{waitUntil:'domcontentloaded'});
  await page.evaluate(()=>RWV2.openToolById('professional-staffing'));
  await expect(page.locator('#pinGate')).toBeVisible();
  await page.locator('#pinInput').fill('135');
  await page.locator('#pinSubmit').click();
  await expect(page.locator('#workspace')).toBeVisible();
  const frame=page.frameLocator('#moduleFrame');
  await expect(frame.locator('body')).toContainText(/Professional Staffing/i,{timeout:15000});
  await expect(page.locator('#moduleLoading')).toHaveClass(/done/,{timeout:15000});
});

test('legacy compatibility bridge opens the production Contract Budget module', async ({ page }) => {
  await page.goto(BASE,{waitUntil:'domcontentloaded'});
  await page.evaluate(()=>RWV2.openToolById('contract-budget'));
  await page.locator('#pinInput').fill('135');
  await page.locator('#pinSubmit').click();
  await expect(page.locator('#workspace')).toBeVisible();
  await expect(page.locator('#moduleLoading')).toHaveClass(/done/,{timeout:20000});
});

test('all 17 launcher entries resolve to working documents', async ({ page }) => {
  await page.goto(BASE,{waitUntil:'domcontentloaded'});
  const result=await page.evaluate(async()=>{
    const tools=RWV2.tools;
    function direct(tool){return new Promise(resolve=>{
      const f=document.createElement('iframe');f.style.cssText='position:fixed;width:4px;height:4px;opacity:0;pointer-events:none;left:-30px;top:-30px';
      let done=false;const finish=(ok,detail)=>{if(done)return;done=true;f.remove();resolve({id:tool.id,name:tool.name,type:tool.type,ok,detail})};
      const timer=setTimeout(()=>finish(false,'direct timeout'),12000);
      f.onload=()=>setTimeout(()=>{clearTimeout(timer);try{const d=f.contentDocument;const text=(d?.body?.innerText||'').replace(/\s+/g,' ').trim();const nodes=d?.body?.children?.length||0;finish(text.length>10||nodes>0,`body:${text.length};nodes:${nodes}`)}catch(e){finish(false,String(e?.message||e))}},80);
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
  console.log(JSON.stringify(result,null,2));
  expect(result.count).toBe(17);
  expect(result.failed, JSON.stringify(result.results.filter(x=>!x.ok),null,2)).toBe(0);
  expect(result.passed).toBe(17);
});
