const { test, expect } = require('@playwright/test');

test.setTimeout(240000);

const BASE = process.env.RW_BASE_URL || 'http://127.0.0.1:4173/professional-v2/index.html';

test('executive shell and command palette work', async ({ page }) => {
  const errors=[];
  page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(BASE,{waitUntil:'domcontentloaded'});
  await expect(page.locator('h1')).toContainText(/Narzędzia|Work tools|Tools voor werk/);
  await page.locator('#openTools').click();
  await expect(page.locator('#toolPalette')).toBeVisible();
  await expect(page.locator('.tool-row')).toHaveCount(17);
  await page.locator('#toolSearch').fill('Professional Staffing');
  await expect(page.locator('.tool-row')).toHaveCount(2);
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

test('all 17 launcher entries load in Chromium', async ({ page }) => {
  const errors=[];
  page.on('pageerror',e=>errors.push(String(e)));
  page.on('console',msg=>{if(msg.type()==='error')console.log('[browser error]',msg.text())});
  await page.goto(BASE,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.RWQA&&typeof RWQA.runAll==='function');
  const result=await page.evaluate(()=>RWQA.runAll());
  console.log(JSON.stringify(result,null,2));
  expect(result.count).toBe(17);
  expect(result.failed, JSON.stringify(result.results.filter(x=>!x.ok),null,2)).toBe(0);
  expect(result.ok).toBe(true);
  expect(errors).toEqual([]);
});
