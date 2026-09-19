import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';

const baseUrl = (process.env.A11Y_BASE_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
const browser = await puppeteer.launch({
  headless: true,
  args: process.env.CI ? ['--no-sandbox', '--disable-setuid-sandbox'] : []
});

try {
  const page = await browser.newPage();
  await page.setRequestInterception(true);
  page.on('request', request => {
    if (request.url().includes('pdbe-molstar')) {
      request.respond({contentType: 'text/javascript', body: "customElements.define('pdbe-molstar', class extends HTMLElement {});"});
    } else if (new URL(request.url()).origin !== new URL(baseUrl).origin) {
      request.abort();
    } else {
      request.continue();
    }
  });
  await page.goto(`${baseUrl}/monday/prework-2-pymol-vscode.html`, {waitUntil: 'domcontentloaded'});
  await page.waitForSelector('.mastery-checkbox');

  const nestedAssets = await page.$$eval('script[src*="/scripts/"]', scripts => scripts.map(script => script.src));
  assert.equal(nestedAssets.length, 6);
  await page.goto(`${baseUrl}/index.html`, {waitUntil: 'domcontentloaded'});
  assert.deepEqual(await page.$$eval('script[src*="/scripts/"]', scripts => scripts.map(script => script.src)), nestedAssets);
  assert.equal(await page.evaluate(() => [...document.scripts].some(script => !script.src && script.textContent.includes('window.BOOTCAMP_COURSE ='))), false);

  await page.goto(`${baseUrl}/capstone/targets/pd-l1.html`, {waitUntil: 'domcontentloaded'});
  await page.waitForSelector('.molstar-ready');
  const scans = await page.evaluate(async () => {
    const viewer = document.querySelector('pdbe-molstar');
    const settle = () => new Promise(resolve => setTimeout(resolve, 0));
    const tree = document.createElement('div');
    for (let i = 0; i < 5000; i++) tree.appendChild(document.createElement('span'));
    viewer.appendChild(tree);
    await settle();
    let fullScans = 0;
    const querySelectorAll = viewer.querySelectorAll.bind(viewer);
    viewer.querySelectorAll = selector => {
      fullScans++;
      return querySelectorAll(selector);
    };
    const logo = document.createElement('a');
    logo.className = 'msp-logo';
    viewer.appendChild(logo);
    const group = document.createElement('div');
    viewer.appendChild(group);
    const pdbe = document.createElement('a');
    pdbe.className = 'msp-pdbe-link';
    group.appendChild(pdbe);
    await settle();
    const replacement = logo.cloneNode();
    replacement.removeAttribute('aria-label');
    logo.replaceWith(replacement);
    await settle();
    assertLabel(replacement, 'Open the Mol* project website');
    if (!pdbe.getAttribute('aria-label')?.includes('on PDBe')) throw new Error('PDBe link lacks label');
    return fullScans;

    function assertLabel(link, label) {
      if (link.getAttribute('aria-label') !== label) throw new Error('Replacement link lacks label');
    }
  });
  assert.equal(scans, 0, 'viewer mutations must not rescan the whole tree');
  console.log('Performance checks passed: shared assets and zero full-tree scans for viewer updates.');
} finally {
  await browser.close();
}
