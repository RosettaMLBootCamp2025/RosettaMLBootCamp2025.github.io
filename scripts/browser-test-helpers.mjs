export async function localOnly(page, baseUrl) {
  await page.setRequestInterception(true);
  page.on('request', request => {
    if (new URL(request.url()).origin === new URL(baseUrl).origin || /^(data|blob):/.test(request.url())) request.continue();
    else request.abort();
  });
}

export async function readProgress(page) {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open('bootcamp-progress', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction('progress');
      const get = transaction.objectStore('progress').get('state');
      transaction.oncomplete = () => { db.close(); resolve(get.result); };
      transaction.onabort = () => { db.close(); reject(transaction.error); };
    };
  }));
}
