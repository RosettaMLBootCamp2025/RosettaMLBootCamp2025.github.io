import assert from 'node:assert/strict';
import path from 'node:path';
import puppeteer from 'puppeteer';
const browser = await puppeteer.launch({headless: true, args: process.env.CI ? ['--no-sandbox', '--disable-setuid-sandbox'] : []});
try {
  const page = await browser.newPage();
  await page.setContent('<main><section><h2>Delayed diagram</h2><div id="diagram"><pre class="mermaid-js">source</pre></div></section><pre id="overflow" style="width:80px;overflow:auto">A deliberately long line that overflows</pre></main>');
  await page.evaluate(() => {
    window.fullScans = 0;
    const query = document.querySelectorAll.bind(document);
    document.querySelectorAll = selector => {
      if (selector === '.workshop-companion') window.fullScans++;
      return query(selector);
    };
  });
  await page.addScriptTag({path: path.resolve('scripts/molstar.js')});
  await page.waitForFunction(() => document.querySelector('#overflow').tabIndex === 0, {polling: 25});
  // Rendering later than the former 1.5-second retry must still get a name.
  await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 1700)));
  await page.evaluate(() => {
    document.querySelector('#diagram').innerHTML = '<svg class="mermaid-js"><text class="nodeLabel">Start</text><text class="nodeLabel">Start</text><text class="nodeLabel">Finish</text></svg>';
  });
  await page.waitForSelector('svg[aria-labelledby][aria-describedby]');
  assert.equal(await page.$eval('svg desc', node => node.textContent), 'The flowchart contains these labeled steps: Start; Finish.');
  await page.$eval('#overflow', node => { node.style.width = '1000px'; });
  await page.waitForFunction(() => !document.querySelector('#overflow').hasAttribute('tabindex'), {polling: 25});
  assert.equal(await page.evaluate(() => window.fullScans), 1, 'late rendering/resizing must not restart full-page accessibility scans');
  console.log('Accessibility update checks passed: late diagrams, unique labels, resize focus, and one startup scan.');
} finally { await browser.close(); }
