// npx vite build --outDir .codex-build-check-demo
// electron scripts/smoke-bundled-templates.cjs [.codex-build-check-demo]
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { app, BrowserWindow, net, protocol } = require("electron");
const { APP_ORIGIN, handleAppRequest } = require("../desktop/routes.cjs");
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "astrotoo-bundled-"));
app.setPath("userData", profile);
protocol.registerSchemesAsPrivileged([
  { scheme: "astrotoo", privileges: { standard: true, secure: true, supportFetchAPI: true } }
]);
app.whenReady().then(async () => {
  const bundleRoot = path.resolve(__dirname, "..", process.argv[2] || ".codex-build-check-demo");
  const assetRoot = path.join(profile, "downloaded-assets");
  const requests = [];
  protocol.handle("astrotoo", async (request) => {
    requests.push(request.url);
    if (/proxy|divoom-china/.test(request.url)) return new Response("Offline test", { status: 503 });
    const response = await handleAppRequest(request, { bundleRoot, assetRoot, net });
    if (request.url === `${APP_ORIGIN}/`) {
      // The production UI omits the diagnostic log; attach its existing output sink for assertions.
      const html = (await response.text()).replace(/<body[^>]*>/, '$&<pre id="font-status" hidden></pre>');
      return new Response(html, { headers: response.headers });
    }
    return response;
  });
  const window = new BrowserWindow({ show: false, width: 1440, height: 900, webPreferences: {
    nodeIntegration: false, contextIsolation: true, sandbox: true, backgroundThrottling: false
  } });
  window.webContents.session.webRequest.onBeforeRequest({ urls: ["http://*/*", "https://*/*"] }, (details, done) => {
    requests.push(details.url);
    done({ cancel: true });
  });
  const errors = [];
  window.webContents.on("console-message", (event) => {
    // Chromium reports this during automated reloads without a trusted user gesture.
    if (event.level === "error" && !event.message.startsWith("Blocked attempt to show a 'beforeunload'")) errors.push(event.message);
    if (/OTS parsing error/.test(event.message)) errors.push(event.message);
  });
  try {
    await window.loadURL(`${APP_ORIGIN}/`);
    const result = await window.webContents.executeJavaScript(`(async () => {
      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      async function until(check, label) {
        for (let i = 0; i < 300; i++) {
          const value = await check();
          if (value) return value;
          await sleep(100);
        }
        throw new Error('Timed out: ' + label + '\\n' + document.getElementById('font-status')?.textContent);
      }
      await until(() => document.querySelectorAll('#template-list li .template-id').length === 16 &&
        document.querySelector('#local-watchface-list li'), 'startup');
      if (document.getElementById('btn-sync-templates') || document.getElementById('template-category-rail')) {
        throw new Error('Template update/category controls still exist');
      }
      document.getElementById('app-mode-template').click();
      await until(() => !document.getElementById('panel-template-shell').hidden, 'template page');
      for (const img of document.querySelectorAll('#template-list img')) img.loading = 'eager';
      const catalog = await fetch('/template/demo-catalog.json').then((r) => r.json());
      const summaries = [];
      for (let index = 0; index < catalog.ClockList.length; index++) {
        const id = catalog.ClockList[index].ClockId;
        document.querySelectorAll('#template-list li')[index].click();
        const summary = await until(() => document.getElementById('font-status')?.textContent
          .split('\\n').find((line) => line.includes(' ' + id + ' ') && /成功|loaded:/.test(line)), 'template ' + id);
        if (/缺失|未找到|missing|unmapped/i.test(summary)) throw new Error(summary);
        summaries.push(summary);
      }
      const thumbCount = await until(() => {
        const count = [...document.querySelectorAll('#template-list img')]
          .filter((img) => img.complete && img.naturalWidth > 0).length;
        return count === 16 ? count : null;
      }, 'all thumbnails');
      const copiedTemplateTitle = document.querySelector('#template-list .template-id').textContent;
      document.querySelector('#template-list li').click();
      await until(() => document.getElementById('txt-clock-title')?.textContent === copiedTemplateTitle, 'selected copy template');
      await sleep(300);
      document.getElementById('btn-apply-template').click();
      await until(() => document.getElementById('local-save-named-dialog')?.open, 'apply naming dialog');
      document.getElementById('local-save-named-input').value = 'Bundled Offline Smoke';
      document.getElementById('local-save-named-submit').click();
      async function savedRecord() {
        const db = await new Promise((resolve, reject) => {
          const req = indexedDB.open('divoom-watchface-local-library-v1');
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
        try {
          return await new Promise((resolve, reject) => {
            const req = db.transaction('watchfaces').objectStore('watchfaces').getAll();
            req.onsuccess = () => resolve(req.result.find((row) => row.name === 'Bundled Offline Smoke'));
            req.onerror = () => reject(req.error);
          });
        } finally { db.close(); }
      }
      const saved = await until(async () => {
        const record = await savedRecord();
        return record?.backgroundDataUrl && record?.localDispAssets?.length ? record : null;
      }, 'saved template resources');
      return { count: summaries.length, thumbCount, summaries, savedAssets: saved.localDispAssets.length };
    })()`);
    assert.equal(result.count, 16);
    assert.equal(result.thumbCount, 16);
    assert.ok(result.savedAssets > 0);
    const screenshotPath = path.join(profile, "templates.png");
    await window.webContents.executeJavaScript(`(async () => {
      document.getElementById('app-mode-template').click();
      await new Promise((resolve) => setTimeout(resolve, 1000));
      for (const img of document.querySelectorAll('#template-list img')) img.loading = 'eager';
      await Promise.all([...document.querySelectorAll('#template-list img')].map((img) => img.decode()));
    })()`);
    fs.writeFileSync(screenshotPath, (await window.webContents.capturePage()).toPNG());
    await window.loadURL(`${APP_ORIGIN}/`);
    const restored = await window.webContents.executeJavaScript(`new Promise((resolve, reject) => {
      let tries = 0;
      const timer = setInterval(() => {
        if (document.getElementById('txt-clock-title')?.textContent.includes('Bundled Offline Smoke') &&
            document.getElementById('txt-bg-source-path')?.value.includes('/template/demo/')) {
          clearInterval(timer); resolve(true);
        } else if (++tries > 200) { clearInterval(timer); reject(new Error('Saved design did not restore')); }
      }, 100);
    })`);
    assert.equal(restored, true);
    // The existing LAN discovery runs independently on startup; all template operations must stay local.
    const templateNetwork = requests.filter((url) => /https?:|proxy|divoom-china/.test(url) &&
      url !== `${APP_ORIGIN}/divoom-cloud-proxy/Device/ReturnSameLANDevice`);
    assert.deepEqual(templateNetwork, [], 'template operations must use bundled resources');
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ templates: result.count, thumbnails: result.thumbCount,
      savedAssets: result.savedAssets, offline: true, restored, screenshotPath }));
  } catch (error) {
    console.error(error);
    if (errors.length) console.error(errors);
    process.exitCode = 1;
  } finally {
    window.destroy();
    app.exit(process.exitCode || 0);
  }
});
