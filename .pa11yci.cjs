'use strict';

const fs = require('node:fs');
const path = require('node:path');
const baseConfig = require('./.pa11yci.json');

const siteRoot = path.join(__dirname, '_site');
const baseUrl = (process.env.A11Y_BASE_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');

function htmlFiles(directory) {
  if (!fs.existsSync(directory)) {
    throw new Error('Rendered site not found at ' + directory + '. Run `quarto render` first.');
  }

  return fs.readdirSync(directory, {withFileTypes: true}).flatMap(entry => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return htmlFiles(absolute);
    return entry.isFile() && entry.name.endsWith('.html') ? [absolute] : [];
  });
}

const pageUrls = htmlFiles(siteRoot)
  .sort()
  .map(file => {
    const relative = path.relative(siteRoot, file).split(path.sep).map(encodeURIComponent).join('/');
    return baseUrl + '/' + relative;
  });

const urls = pageUrls.flatMap(url => [
  {
    url,
    viewport: {width: 1280, height: 900, deviceScaleFactor: 1, isMobile: false}
  },
  {
    url: url + '?a11y-viewport=mobile',
    viewport: {width: 375, height: 812, deviceScaleFactor: 1, isMobile: true}
  }
]);

module.exports = {
  ...baseConfig,
  urls
};
