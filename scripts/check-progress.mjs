import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import {localOnly, readProgress} from './browser-test-helpers.mjs';

const baseUrl = process.env.A11Y_BASE_URL || 'http://127.0.0.1:8000';
const browser = await puppeteer.launch({headless: true, args: process.env.CI ? ['--no-sandbox', '--disable-setuid-sandbox'] : []});
try {
  const page = await browser.newPage();
  await localOnly(page, baseUrl);
  await page.goto(`${baseUrl}/index.html`, {waitUntil: 'domcontentloaded'});
  await page.waitForSelector('#learning-plan');
  async function importState(state, mode = 'Merge progress') {
    await page.evaluate(value => window.importCourseProgress(new File([JSON.stringify(value)], 'progress.json')), state);
    await page.waitForSelector('#import-preview');
    await page.evaluate(mode => [...document.querySelectorAll('#import-preview button')].find(button => button.textContent === mode).click(), mode);
    await page.waitForFunction(() => !document.querySelector('#import-preview'));
    return readProgress(page);
  }
  let state = await importState({completed:['hpc-setup'],tasks:['legacy-task']});
  assert.deepEqual(state.completed,['hpc-setup']);
  state = await importState({completed:['localcolabfold'],tasks:[]});
  assert.deepEqual(state.completed.sort(),['hpc-setup','localcolabfold']);
  const original = state;
  // Merely selecting a backup must never change persistent evidence.
  await page.evaluate(() => window.importCourseProgress(new File([JSON.stringify({completed:[],tasks:[]})], 'older.json')));
  await page.waitForSelector('#import-preview');
  assert.deepEqual(await readProgress(page), original);
  await page.evaluate(() => [...document.querySelectorAll('#import-preview button')].find(b=>b.textContent==='Cancel').click());
  state = await importState({completed:[],tasks:[]}, 'Replace progress');
  assert.deepEqual(state.completed,[]);
  await page.click('#undo-progress');
  await page.waitForFunction(() => document.querySelector('#undo-progress')?.hidden);
  assert.deepEqual((await readProgress(page)).completed.sort(),['hpc-setup','localcolabfold']);
  const stored = await readProgress(page);
  for (const value of [{completed:[],tasks:['x'.repeat(129)]},{completed:[],tasks:Array(1001).fill('task')},{version:900,completed:[],tasks:[]}]) {
    await page.evaluate(value => window.importCourseProgress(new File([JSON.stringify(value)],'bad.json')), value);
    await page.waitForFunction(() => document.querySelector('#progress-notice')?.textContent.includes('not a valid'));
    assert.deepEqual(await readProgress(page),stored);
  }
  await page.evaluate(() => {
    const Reader=window.FileReader; window.FileReader=class {constructor(){throw Error('Must reject before reading');}};
    try{window.importCourseProgress(new File(['x'.repeat(6*1024*1024)],'large.json'));}finally{window.FileReader=Reader;}
  });
  assert.match(await page.$eval('#progress-notice',e=>e.textContent),/256 KiB/);
  // A failing transaction keeps pending evidence visible and exportable, then retries it.
  await page.goto(`${baseUrl}/monday/prework-2-pymol-vscode.html`,{waitUntil:'domcontentloaded'});
  await page.waitForSelector('.mastery-checkbox');
  await page.evaluate(()=>{window.originalPut=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(){throw new DOMException('Full','QuotaExceededError');};});
  await page.click('.mastery-checkbox');
  await page.waitForSelector('.progress-notice-error');
  assert.equal(await page.$eval('.mastery-checkbox',e=>e.checked),true);
  assert.equal((await readProgress(page)).completed.includes('prework-pymol-vscode'),false);
  const pendingExport = await page.evaluate(async()=>{
    const original=URL.createObjectURL; const originalClick=HTMLAnchorElement.prototype.click; let exported;
    URL.createObjectURL=blob=>{exported=blob;return original(blob);}; HTMLAnchorElement.prototype.click=function(){};
    try{await window.exportCourseProgress();return JSON.parse(await exported.text());}finally{URL.createObjectURL=original;HTMLAnchorElement.prototype.click=originalClick;}
  });
  assert.equal(pendingExport.completed.includes('prework-pymol-vscode'),true);
  await page.evaluate(()=>{IDBObjectStore.prototype.put=window.originalPut;});
  await page.click('.progress-recovery button');
  await page.waitForFunction(()=>!document.querySelector('.progress-notice-error'));
  assert.equal((await readProgress(page)).completed.includes('prework-pymol-vscode'),true);
  // File-read errors are actionable and preserve the existing state.
  await page.evaluate(()=>{const Reader=window.FileReader;window.FileReader=class extends EventTarget{readAsText(){this.dispatchEvent(new Event('error'));}};try{window.importCourseProgress(new File(['{}'],'unreadable.json'));}finally{window.FileReader=Reader;}});
  assert.match(await page.$eval('#progress-notice',e=>e.textContent),/could not be read/);
  console.log('Progress checks passed: preview, cancel, merge, replace/undo, size/schema limits, pending evidence, retry, and read errors.');
} finally { await browser.close(); }
