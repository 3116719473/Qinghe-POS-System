import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const browser=await chromium.launch({headless:true,...(process.env.BROWSER_PATH?{executablePath:process.env.BROWSER_PATH}:{})});
const page=await browser.newPage({viewport:{width:1440,height:960}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const base=process.env.TEST_URL||'http://127.0.0.1:3108';
mkdirSync('test-results',{recursive:true});
try {
 await page.goto(base);await page.locator('.product-card').first().waitFor();
 if(await page.locator('#cart-count').textContent()==='0 units')await page.locator('#demo-cart').click();assert.equal(await page.locator('#cart-count').textContent(),'3 units');
 assert.match(await page.locator('.total-row').textContent(),/27.09/);
 assert.equal(await page.locator('.cart-item del').count(),2);
 assert.equal(await page.locator('.category-tabs b').first().textContent(),'16');
 assert.equal(await page.locator('.product-card').first().evaluate(e=>e.scrollHeight<=e.clientHeight+2),true);
 await page.screenshot({path:'test-results/terminal-desktop.png',fullPage:true});
 const ratio=await page.evaluate(()=>document.querySelector('.cart-panel').getBoundingClientRect().width/document.querySelector('.pos-layout').getBoundingClientRect().width);assert.ok(ratio>.37&&ratio<.42);
 await page.keyboard.press('F4');assert.equal(await page.locator('#cart-count').textContent(),'0 units');
 await page.reload();await page.locator('#restore-cart').waitFor();await page.keyboard.press('F5');await page.locator('[data-restore]').click();await page.locator('.modal').waitFor({state:'detached'});assert.match(await page.locator('.total-row').textContent(),/27.09/);
 await page.locator('[data-product-minus="p6"]').click();assert.equal(await page.locator('#cart-count').textContent(),'2 units');
 await page.keyboard.press('F7');await page.locator('#quantity-value').fill('4');await page.locator('#save-quantity').click();assert.equal(await page.locator('#cart-count').textContent(),'5 units');
 await page.locator('[data-quantity="p6"]').click();await page.locator('#quantity-value').fill('999999');await page.locator('#save-quantity').click();assert.match(await page.locator('#modal-error').textContent(),/available stock/);await page.locator('#quantity-value').fill('2');await page.locator('#save-quantity').click();
 await page.keyboard.press('F6');await page.locator('#discount-value').fill('85');await page.locator('#save-discount').click();assert.match(await page.locator('.total-row').textContent(),/25.59/);
 await page.keyboard.press('F8');await page.locator('#cash').fill('30');assert.equal(await page.locator('#change').textContent(),'¥4.41');await page.locator('#pay').click();await page.locator('#print-receipt').waitFor();assert.match(await page.locator('.receipt').textContent(),/25.59/);assert.match(await page.locator('.receipt').textContent(),/Original price/);
 await page.locator('.modal-actions [data-close]').click();await page.locator('[data-page="orders"]').click();await page.locator('[data-refund]').first().click();await page.locator('[data-refund-item]').first().fill('1');await page.locator('#refund-reason').selectOption('Wrong item purchased');assert.equal(await page.locator('#refund-total').textContent(),'¥3.83');await page.locator('#confirm-refund').click();await page.locator('#print-receipt').waitFor();await page.locator('.modal-actions [data-close]').click();
 await page.locator('[data-page="pos"]').click();await page.locator('.product-main[data-add="p3"]').click();await page.locator('#pay-scan').click();await page.locator('#confirm-external').click();assert.match(await page.locator('#modal-error').textContent(),/Verify receipt/);await page.locator('#payment-method').selectOption('alipay');await page.locator('#payment-reference').fill('TEST-ALIPAY-2026');await page.locator('#payment-verified').check();await page.locator('#confirm-external').click();await page.locator('#print-receipt').waitFor();assert.match(await page.locator('.receipt').textContent(),/Alipay/);assert.match(await page.locator('.receipt').textContent(),/TEST-ALIPAY/);await page.locator('.modal-actions [data-close]').click();
 await page.locator('.product-main[data-add="p3"]').click();await page.locator('#pay-card').click();await page.locator('#payment-reference').fill('TEST-CARD-2026');await page.locator('#payment-verified').check();await page.locator('#confirm-external').click();await page.locator('#print-receipt').waitFor();assert.match(await page.locator('.receipt').textContent(),/Bank card/);await page.locator('.modal-actions [data-close]').click();
 await page.locator('#demo-cart').click();await page.setViewportSize({width:1280,height:800});await page.screenshot({path:'test-results/terminal-1280.png',fullPage:true});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'test-results/terminal-mobile.png',fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 for(const name of ['inventory','overview','orders']){await page.locator(`[data-page="${name}"]`).click();await page.locator('.standard-page').waitFor();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
 assert.deepEqual(errors,[]);console.log('PASS: compact layout, sample cart, category counts, hold/retrieve after reload, keyboard shortcuts, quantity validation, discounted checkout/refund, external payments, desktop/mobile overflow.');
}finally{await browser.close();}
