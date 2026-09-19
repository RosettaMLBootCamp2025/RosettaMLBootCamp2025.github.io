import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import {readProgress} from './browser-test-helpers.mjs';

const baseUrl = process.env.A11Y_BASE_URL || 'http://127.0.0.1:8000';
const browser = await puppeteer.launch({headless: true, args: process.env.CI ? ['--no-sandbox', '--disable-setuid-sandbox'] : []});
try {
  const page = await browser.newPage();
  await page.setRequestInterception(true);
  page.on('request', request => {
    if (new URL(request.url()).origin === new URL(baseUrl).origin || /^(data|blob):/.test(request.url())) request.continue();
    else request.abort();
  });
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem('bootcamp_progress_v2', JSON.stringify({completed: ['hpc-setup'], tasks: ['v2-task']}));
    localStorage.setItem('bootcamp2025_progress', JSON.stringify({completed: ['older-task']}));
  });
  await page.goto(`${baseUrl}/index.html`, {waitUntil: 'domcontentloaded'});
  await page.evaluate(() => { window.alerts = []; window.alert = text => window.alerts.push(text); });
  async function importState(state) {
    await page.evaluate(value => {
      window.alerts = [];
      window.importCourseProgress(new File([JSON.stringify(value)], 'progress.json'));
    }, state);
    await page.waitForFunction(() => window.alerts.length > 0, {polling: 25});
    return page.evaluate(() => window.alerts[0]);
  }
  await page.waitForFunction(() => Number(document.querySelector('#checkpoint-total').textContent) > 0);
  assert.deepEqual((await readProgress(page)).tasks, ['v2-task'], 'v2 progress takes precedence over legacy state');
  const original = {completed: ['hpc-setup'], tasks: ['legacy-task']};
  assert.match(await importState(original), /successfully/);
  const exported = await page.evaluate(async () => {
    const create = URL.createObjectURL;
    const click = HTMLAnchorElement.prototype.click;
    let payload;
    URL.createObjectURL = blob => { payload = blob; return create(blob); };
    HTMLAnchorElement.prototype.click = () => {};
    try { await window.exportCourseProgress(); return JSON.parse(await payload.text()); }
    finally { URL.createObjectURL = create; HTMLAnchorElement.prototype.click = click; }
  });
  assert.deepEqual(exported.completed, original.completed);
  assert.deepEqual(exported.tasks, original.tasks);
  assert.equal(exported.version, 2);
  assert.equal('revision' in exported, false, 'internal transaction revisions stay out of exports');
  const stored = await readProgress(page);
  assert.match(await importState({completed: [], tasks: ['x'.repeat(129)]}), /not a valid/);
  assert.match(await importState({completed: [], tasks: Array(1001).fill('task')}), /not a valid/);
  assert.deepEqual(await readProgress(page), stored);
  // Oversized inputs must not even allocate a FileReader.
  const oversized = await page.evaluate(() => {
    const Reader = window.FileReader;
    window.FileReader = class { constructor() { throw new Error('Must reject before reading'); } };
    try {
      window.importCourseProgress(new File(['x'.repeat(6 * 1024 * 1024)], 'large.json'));
      return window.alerts.at(-1);
    } finally { window.FileReader = Reader; }
  });
  assert.match(oversized, /256 KiB/);
  await page.evaluate(() => {
    window.originalPut = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function() { throw new DOMException('Full', 'QuotaExceededError'); };
  });
  assert.match(await importState({completed: [], tasks: []}), /could not be saved/);
  assert.deepEqual(await readProgress(page), stored);
  const readError = await page.evaluate(() => {
    const Reader = window.FileReader;
    window.FileReader = class extends EventTarget {
      readAsText() { this.dispatchEvent(new Event('error')); }
    };
    try { window.importCourseProgress(new File(['{}'], 'unreadable.json')); return window.alerts.at(-1); }
    finally { window.FileReader = Reader; }
  });
  assert.match(readError, /could not be read/);
  await page.evaluate(() => {
    IDBObjectStore.prototype.put = window.originalPut;
    window.confirm = () => true;
    localStorage.setItem('bootcamp2025_lastpage', JSON.stringify({path: '/monday/1-hpc-setup.html', title: 'HPC setup'}));
    const banner = document.querySelector('#resume-banner');
    banner.hidden = false; banner.style.display = '';
  });
  await page.evaluate(() => window.clearProgress());
  assert.equal(await page.$eval('#resume-banner', node => node.hidden), true);
  assert.deepEqual((await readProgress(page)).completed, []);
  console.log('Progress import checks passed: valid round-trip, size/schema limits, quota failure, and read errors.');
} finally { await browser.close(); }
