import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import {localOnly,readProgress} from './browser-test-helpers.mjs';
const baseUrl=process.env.A11Y_BASE_URL||'http://127.0.0.1:8000';
const browser=await puppeteer.launch({headless:true,args:process.env.CI?['--no-sandbox','--disable-setuid-sandbox']:[]});
try {
 const page=await browser.newPage();await localOnly(page,baseUrl);
 const errors=[];page.on('pageerror',e=>errors.push(page.url()+': '+e.message));
 async function go(path){await page.goto(baseUrl+'/'+path,{waitUntil:'domcontentloaded'});await page.waitForSelector('#learning-plan');}
 async function choose(route,compute){await go('start-here.html');await page.select('#learning-route',route);await page.select('#compute-mode',compute);await page.click('#route-form button');await page.waitForFunction(()=>document.querySelector('#route-saved').textContent.includes('saved'));}
 await choose('full','local');await go('monday/prework-2-pymol-vscode.html');
 assert.match(await page.$eval('.mastery-next-link',e=>e.href),/prework-3-python/);
 await choose('core','hosted');await go('monday/prework-2-pymol-vscode.html');
 assert.match(await page.$eval('.mastery-next-link',e=>e.href),/reproducibility/);
 await go('index.html');let initial=Number(await page.$eval('#completed-count',e=>e.textContent));
 await go('monday/index.html');await page.click('#module-checkbox-monday-readiness-evidence');
 await page.waitForFunction(()=>document.querySelector('#progress-notice')?.textContent.includes('saved'));
 await go('index.html');assert.equal(Number(await page.$eval('#completed-count',e=>e.textContent)),initial+1);
 await go('tuesday/index.html');await page.click('#module-checkbox-tuesday-af2-evidence');
 await page.waitForFunction(()=>document.querySelector('#progress-notice')?.textContent.includes('saved'));
 await go('tuesday/3-alphafold2.html');assert.equal(await page.$eval('.mastery-checkbox',e=>e.checked),true);
 // Wrong answer -> explanation -> retry restores native controls and focus.
 await page.click('.quiz-radio');await page.click('.check-btn');
 assert.equal(await page.$eval('.quiz-retry',e=>e.hidden),false);
 await page.click('.quiz-retry');assert.equal(await page.$eval('.quiz-radio',e=>e.disabled),false);
 assert.equal(await page.$eval('.check-btn',e=>e.disabled),true);
 assert.equal(await page.evaluate(()=>document.activeElement.classList.contains('quiz-radio')),true);
 await choose('core','analysis');await go('index.html');
 const plan=await page.$eval('.journey-list',e=>e.textContent);assert.equal(plan.includes('Common HPC Setup'),false);assert.equal(plan.includes('LocalColabFold'),false);
 await page.click('#short-session');assert.match(await page.$eval('#short-session-result',e=>e.textContent),/20 minutes/);
 // Explicit work survives reference browsing and restores a section anchor.
 await go('tuesday/4-esmfold.html');await page.evaluate(()=>[...document.querySelectorAll('#learning-plan button')].find(e=>e.textContent==='Work on this lesson').click());
 await page.evaluate(()=>document.querySelector('main section[id] > h2').scrollIntoView());
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('bootcamp-active-work')).hash);
 const active=await page.evaluate(()=>JSON.parse(localStorage.getItem('bootcamp-active-work')));
 await go('capstone/rubric.html');assert.equal((await page.$eval('.day-progress-chip',e=>e.textContent)).includes('Target'),true);
 await go('index.html');assert.ok((await page.$eval('.journey-next a',e=>e.href)).endsWith(active.hash));assert.match(await page.$eval('.journey-next a',e=>e.href),/4-esmfold/);
 await choose('reference','analysis');await go('index.html');assert.equal(await page.$('.journey-next a'),null);
 await page.setViewport({width:375,height:812});await go('monday/index.html');
 assert.equal(await page.$eval('.desktop-tool-table',e=>getComputedStyle(e).display),'none');
 assert.equal(await page.$$eval('.mobile-tool-card',e=>e.length),12);
 assert.equal(await page.$eval('.mobile-tool-card',e=>e.textContent.includes('Key resource constraint')),true);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));
 const saved=await readProgress(page);assert.deepEqual(saved.preferences,{route:'reference',compute:'analysis',chosen:true});
 assert.deepEqual(errors,[]);
 console.log('Journey checks passed: saved routes, core/full handoffs, compute exclusions, shared evidence, quiz retry, section resume, short tasks, and mobile cards.');
}finally{await browser.close();}
