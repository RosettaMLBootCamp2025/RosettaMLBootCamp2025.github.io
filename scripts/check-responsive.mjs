import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import puppeteer from 'puppeteer';

const siteRoot = path.resolve('_site');
const baseUrl = (process.env.A11Y_BASE_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');

function htmlFiles(directory) {
  if (!fs.existsSync(directory)) {
    throw new Error(`Rendered site not found at ${directory}. Run \`quarto render\` first.`);
  }

  return fs.readdirSync(directory, {withFileTypes: true}).flatMap(entry => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return htmlFiles(absolute);
    return entry.isFile() && entry.name.endsWith('.html') ? [absolute] : [];
  });
}

const urls = htmlFiles(siteRoot)
  .sort()
  .map(file => {
    const relative = path.relative(siteRoot, file).split(path.sep).map(encodeURIComponent).join('/');
    return `${baseUrl}/${relative}`;
  });

const browser = await puppeteer.launch({headless: true});
const failures = [];

try {
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(30_000);

  for (const viewport of [
    {name: 'mobile', width: 375, height: 812},
    {name: 'desktop', width: 1280, height: 900}
  ]) {
    await page.setViewport({width: viewport.width, height: viewport.height, deviceScaleFactor: 1});

    for (const url of urls) {
      await page.goto(url, {waitUntil: 'domcontentloaded'});
      const overflow = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        unnamedFrames: document.querySelectorAll('iframe:not([title]), iframe[title=""]').length
      }));

      if (overflow.scrollWidth > overflow.clientWidth + 2) {
        failures.push(
          `${viewport.name}: ${url} is ${overflow.scrollWidth - overflow.clientWidth}px wider than its viewport`
        );
      }
      if (overflow.unnamedFrames) {
        failures.push(`${viewport.name}: ${url} has ${overflow.unnamedFrames} unnamed iframe(s)`);
      }
    }
  }

  await page.setViewport({width: 375, height: 812, deviceScaleFactor: 1});
  await page.goto(`${baseUrl}/tuesday/3-alphafold2.html`, {waitUntil: 'domcontentloaded'});
  await page.waitForSelector('[data-quiz-ready="true"] .quiz-radio');

  const quizSetup = await page.evaluate(() => {
    const quiz = document.querySelector('[data-quiz-ready="true"]');
    return {
      hasFieldset: Boolean(quiz && quiz.querySelector('fieldset > legend')),
      allNativeRadios: Boolean(quiz) && Array.from(quiz.querySelectorAll('.quiz-option')).every(option =>
        option.matches('label') && option.querySelector('input[type="radio"]')
      ),
      liveFeedback: quiz && quiz.querySelector('.quiz-feedback')?.getAttribute('role') === 'status'
    };
  });

  if (!quizSetup.hasFieldset || !quizSetup.allNativeRadios || !quizSetup.liveFeedback) {
    failures.push('quiz: expected a native fieldset/radio group with a status feedback region');
  }

  await page.focus('[data-quiz-ready="true"] .quiz-radio');
  await page.keyboard.press('Space');
  await page.keyboard.press('ArrowDown');
  const selectedByKeyboard = await page.evaluate(() =>
    document.querySelectorAll('[data-quiz-ready="true"] .quiz-radio:checked').length === 1 &&
    !document.querySelector('[data-quiz-ready="true"] .check-btn').disabled
  );
  if (!selectedByKeyboard) failures.push('quiz: radio choices could not be selected from the keyboard');

  await page.focus('[data-quiz-ready="true"] .check-btn');
  await page.keyboard.press('Enter');
  const announcedResult = await page.evaluate(() => {
    const feedback = document.querySelector('[data-quiz-ready="true"] .quiz-feedback');
    return feedback && !feedback.hidden && feedback.textContent.trim().length > 0;
  });
  if (!announcedResult) failures.push('quiz: submitting from the keyboard did not expose feedback');

  await page.goto(`${baseUrl}/tuesday/index.html`, {waitUntil: 'domcontentloaded'});
  const unlabeledTasks = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.module-checkbox')).filter(input => {
      const label = input.closest('label');
      return !input.id || !label || label.htmlFor !== input.id;
    }).length
  );
  if (unlabeledTasks) failures.push(`tasks: ${unlabeledTasks} progress checkboxes do not have explicit labels`);

  await page.goto(`${baseUrl}/monday/prework-2-pymol-vscode.html`, {waitUntil: 'domcontentloaded'});
  await page.waitForSelector('.lesson-contract');
  await page.evaluate(() => localStorage.clear());
  await page.reload({waitUntil: 'domcontentloaded'});
  await page.waitForSelector('.mastery-checkbox');
  const journeySetup = await page.evaluate(() => ({
    hasDayPosition: document.querySelector('.day-progress-chip')?.textContent.includes('Monday') || false,
    nextHref: document.querySelector('.mastery-next-link')?.getAttribute('href') || '',
    contractHasEvidence: document.querySelector('.lesson-contract')?.textContent.includes('You will produce') || false
  }));
  if (!journeySetup.hasDayPosition) failures.push('journey: Monday pre-work is missing its day-position indicator');
  if (!journeySetup.nextHref.endsWith('/monday/reproducibility.html')) {
    failures.push(`journey: core route continued to the wrong lesson (${journeySetup.nextHref || 'no link'})`);
  }
  if (!journeySetup.contractHasEvidence) failures.push('journey: manifest lesson contract is missing its evidence artifact');

  await page.click('.mastery-checkbox');
  await page.reload({waitUntil: 'domcontentloaded'});
  await page.waitForSelector('.mastery-checkbox');
  const masteryPersisted = await page.$eval('.mastery-checkbox', checkbox => checkbox.checked);
  if (!masteryPersisted) failures.push('progress: lesson evidence completion did not persist after reload');

  await page.goto(`${baseUrl}/index.html`, {waitUntil: 'domcontentloaded'});
  const progressTotals = await page.evaluate(() => {
    const course = window.BOOTCAMP_COURSE || {};
    const lessons = Array.isArray(course.lessons) ? course.lessons : [];
    const milestones = Array.isArray(course.milestones) ? course.milestones : [];
    const expected = lessons.filter(item => (item.route || 'core') === 'core').length +
      milestones.filter(item => (item.route || 'core') === 'core').length;
    return {
      expected,
      displayed: Number(document.querySelector('#checkpoint-total')?.textContent || 0)
    };
  });
  if (!progressTotals.expected || progressTotals.displayed !== progressTotals.expected) {
    failures.push(`progress: homepage shows ${progressTotals.displayed} of ${progressTotals.expected} required checkpoints`);
  }

  await page.goto(`${baseUrl}/thursday/2-cpu-vs-gpu.html`, {waitUntil: 'domcontentloaded'});
  const notebookDownload = await page.$eval('a[download]', link => link.getAttribute('href'));
  if (!notebookDownload?.endsWith('.ipynb')) {
    failures.push(`downloads: CPU/GPU notebook link does not preserve the .ipynb file (${notebookDownload || 'missing'})`);
  }
  if (!fs.existsSync(path.join(siteRoot, 'thursday', 'files', 'activity-CPUvsGPU.ipynb'))) {
    failures.push('downloads: rendered site is missing the CPU/GPU .ipynb resource');
  }

  const molstarRequests = [];
  const performancePage = await browser.newPage();
  performancePage.on('request', request => {
    if (request.url().includes('pdbe-molstar')) molstarRequests.push(request.url());
  });
  await performancePage.goto(`${baseUrl}/index.html`, {waitUntil: 'networkidle2'});
  if (molstarRequests.length) failures.push('performance: Mol* loaded on a page without a molecular viewer');
  await performancePage.close();

  const targetPage = await browser.newPage();
  const targetMolstarRequests = [];
  await targetPage.setRequestInterception(true);
  targetPage.on('request', request => {
    if (request.url().includes('pdbe-molstar')) {
      targetMolstarRequests.push(request.url());
      request.abort();
    } else {
      request.continue();
    }
  });
  await targetPage.goto(`${baseUrl}/capstone/targets/pd-l1.html`, {waitUntil: 'domcontentloaded'});
  const hasStaticAlternative = await targetPage.$('.molstar-alternative a[href*="rcsb.org/structure/"]');
  if (!targetMolstarRequests.length) failures.push('performance: Mol* did not load on a page containing a viewer');
  if (!hasStaticAlternative) failures.push('molecular viewer: the persistent non-interactive alternative is missing');
  await targetPage.close();
} finally {
  await browser.close();
}

if (failures.length) {
  console.error(`Responsive/accessibility checks failed (${failures.length}):`);
  failures.forEach(failure => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log(`Responsive/accessibility checks passed for ${urls.length} HTML pages at mobile and desktop widths.`);
}
