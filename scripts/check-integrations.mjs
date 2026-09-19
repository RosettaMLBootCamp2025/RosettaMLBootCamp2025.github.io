import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';

// Deliberately separate from the offline accessibility sweep: this checks live
// third-party availability and uses the actual viewer, not a substitute element.
const baseUrl = process.env.A11Y_BASE_URL || 'http://127.0.0.1:8000';
const browser = await puppeteer.launch({
  headless: true,
  args: ['--enable-unsafe-swiftshader', ...(process.env.CI ? ['--no-sandbox', '--disable-setuid-sandbox'] : [])]
});
try {
  const viewerPage = await browser.newPage();
  const start = performance.now();
  await viewerPage.goto(`${baseUrl}/capstone/targets/pd-l1.html`, {waitUntil: 'domcontentloaded', timeout: 45_000});
  await viewerPage.waitForFunction(() =>
    document.querySelector('pdbe-molstar')?.viewerInstance?.plugin?.managers?.structure?.hierarchy?.current?.structures.length > 0,
  {timeout: 45_000, polling: 100});
  assert.ok(await viewerPage.$('pdbe-molstar canvas'), 'real viewer must create a rendering canvas');
  const client = await viewerPage.createCDPSession();
  await client.send('Performance.enable');
  const {metrics} = await client.send('Performance.getMetrics');
  const heap = metrics.find(metric => metric.name === 'JSHeapUsedSize')?.value;
  console.log(`Real Mol* structure loaded in ${Math.round(performance.now() - start)} ms; JS heap snapshot ${Math.round(heap / 1024 / 1024)} MiB (excludes GPU memory).`);
  await client.detach();
  await viewerPage.close();

  const videoPage = await browser.newPage();
  let embedStatus;
  videoPage.on('response', response => {
    if (response.request().resourceType() === 'document' && response.url().includes('youtube-nocookie.com/embed/')) {
      embedStatus = response.status();
    }
  });
  await videoPage.goto(`${baseUrl}/tuesday/3-alphafold2.html`, {waitUntil: 'domcontentloaded', timeout: 45_000});
  await videoPage.$eval('iframe[src*="youtube-nocookie.com/embed/"]', frame => frame.scrollIntoView());
  const deadline = Date.now() + 45_000;
  while (embedStatus === undefined && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.equal(embedStatus, 200, 'YouTube embed document must load successfully; this does not assert video playback');
  await videoPage.close();
  console.log('Live integration checks passed: real molecular structure and video embed document.');
} finally { await browser.close(); }
