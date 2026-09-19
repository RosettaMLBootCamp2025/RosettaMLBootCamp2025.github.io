import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import {localOnly, readProgress} from './browser-test-helpers.mjs';

const baseUrl = process.env.A11Y_BASE_URL || 'http://127.0.0.1:8000';
const browser = await puppeteer.launch({headless: true, args: process.env.CI ? ['--no-sandbox', '--disable-setuid-sandbox'] : []});
try {
  async function open(path, seed) {
    const page = await browser.newPage();
    await localOnly(page, baseUrl);
    if (seed) await page.evaluateOnNewDocument(value => localStorage.setItem('bootcamp2025_progress', JSON.stringify(value)), seed);
    await page.goto(`${baseUrl}/${path}`, {waitUntil: 'domcontentloaded'});
    await page.waitForSelector('.mastery-checkbox');
    await page.evaluate(() => {
      window.alerts = []; window.alert = text => window.alerts.push(text); window.confirm = () => true;
      window.startedWrites = 0;
      const transaction = IDBDatabase.prototype.transaction;
      IDBDatabase.prototype.transaction = function(...args) {
        if (args[1] === 'readwrite') window.startedWrites++;
        return transaction.apply(this, args);
      };
    });
    return page;
  }
  const first = await open('monday/prework-2-pymol-vscode.html', {completed: ['legacy-task']});
  assert.deepEqual((await readProgress(first)).tasks, ['legacy-task']);
  const second = await open('monday/1-hpc-setup.html');
  const mirror = await open('monday/prework-2-pymol-vscode.html');
  const controller = await browser.newPage();
  await localOnly(controller, baseUrl);
  await controller.goto(`${baseUrl}/about.html`, {waitUntil: 'domcontentloaded'});

  // Keep a real transaction active while app writers queue in other tabs.
  async function hold() {
    await controller.evaluate(() => {
      window.holding = false;
      const request = indexedDB.open('bootcamp-progress', 1);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction('progress', 'readwrite');
        const store = tx.objectStore('progress');
        window.keepTransaction = true;
        const next = () => {
          store.get('state').onsuccess = () => {
            window.holding = true;
            if (window.keepTransaction) next();
          };
        };
        tx.oncomplete = () => db.close();
        next();
      };
    });
    await controller.waitForFunction(() => window.holding, {polling: 25});
  }
  async function queue(page, action) {
    const before = await page.evaluate(() => window.startedWrites);
    await action();
    await page.waitForFunction(before => window.startedWrites > before, {polling: 25}, before);
  }
  async function click(page, checked) {
    await queue(page, () => page.evaluate(checked => {
      const input = document.querySelector('.mastery-checkbox');
      input.checked = checked; input.dispatchEvent(new Event('change'));
    }, checked));
  }
  async function release() {
    await controller.evaluate(() => { window.keepTransaction = false; });
    return readProgress(controller); // Queues behind all already-started writers.
  }
  await hold();
  await Promise.all([click(first, true), click(second, true)]);
  assert.deepEqual((await release()).completed.sort(), ['hpc-setup', 'prework-pymol-vscode']);
  await mirror.waitForFunction(() => document.querySelector('.mastery-checkbox').checked, {polling: 25});

  await hold();
  await queue(first, () => first.evaluate(() => window.importCourseProgress(new File([
    JSON.stringify({completed: [], tasks: ['imported-task']})
  ], 'progress.json'))));
  await click(second, true);
  const imported = await release();
  assert.deepEqual(imported.completed, ['hpc-setup']);
  assert.deepEqual(imported.tasks, ['imported-task']);
  await mirror.waitForFunction(() => !document.querySelector('.mastery-checkbox').checked, {polling: 25});

  await hold();
  await queue(first, () => first.evaluate(() => { void window.clearProgress(); }));
  await click(second, true);
  const reset = await release();
  assert.deepEqual(reset.completed, ['hpc-setup']);
  assert.deepEqual(reset.tasks, []);
  // An old tab/old storage key cannot restore pre-migration state after reset.
  await mirror.evaluate(() => localStorage.setItem('bootcamp2025_progress', JSON.stringify({completed: ['resurrected']})));
  await mirror.reload({waitUntil: 'domcontentloaded'});
  await mirror.waitForSelector('.mastery-checkbox');
  assert.deepEqual((await readProgress(mirror)).tasks, []);
  console.log('Concurrency checks passed: legacy migration, overlapping edits, live tabs, ordered import/reset, and no resurrection.');
} finally { await browser.close(); }
