const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { app, BrowserWindow, net, protocol } = require("electron");
const { APP_ORIGIN, handleAppRequest } = require("../desktop/routes.cjs");

const profile = fs.mkdtempSync(path.join(os.tmpdir(), "astrotoo-animation-"));
app.setPath("userData", profile);
protocol.registerSchemesAsPrivileged([
  { scheme: "astrotoo", privileges: { standard: true, secure: true, supportFetchAPI: true } }
]);

app.whenReady().then(async () => {
  const bundleRoot = path.join(__dirname, "..", "dist");
  const assetRoot = path.join(profile, "downloaded-assets");
  protocol.handle("astrotoo", (request) => handleAppRequest(request, { bundleRoot, assetRoot, net }));
  const window = new BrowserWindow({ show: false, webPreferences: {
    nodeIntegration: false, contextIsolation: true, sandbox: true, backgroundThrottling: false
  } });
  try {
    await window.loadURL(`${APP_ORIGIN}/`);
    const before = await window.webContents.executeJavaScript(`(async () => {
      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      async function until(check, label) {
        for (let i = 0; i < 300; i++) {
          const value = await check();
          if (value) return value;
          await sleep(100);
        }
        throw new Error('timed out waiting for ' + label);
      }
      function canvasHash() {
        const canvas = document.getElementById('watchface-canvas');
        const bytes = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
        let hash = 2166136261;
        for (let i = 0; i < bytes.length; i += 64) hash = Math.imul(hash ^ bytes[i], 16777619);
        return hash >>> 0;
      }
      async function sampleAnimation() {
        const hashes = new Set();
        for (let i = 0; i < 8; i++) {
          hashes.add(canvasHash());
          await sleep(150);
        }
        return hashes.size;
      }
      await until(() => document.querySelector('#local-watchface-list li'), 'initialized design list');
      document.getElementById('btn-new-watchface').click();
      await until(() => document.getElementById('local-save-named-dialog')?.open, 'new design dialog');
      document.getElementById('local-save-named-input').value = 'Animation Smoke';
      document.getElementById('local-save-named-submit').click();
      await until(() => [...document.querySelectorAll('#local-watchface-list li')]
        .some((item) => item.textContent.includes('Animation Smoke')), 'new design');
      const bytes = await fetch('/template/15/174.webp').then((response) => response.arrayBuffer());
      const file = new File([bytes], 'misnamed.png', { type: 'image/png' });
      const transfer = new DataTransfer();
      transfer.items.add(file);
      const input = document.getElementById('input-bg-file');
      input.files = transfer.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      await until(() => document.getElementById('txt-bg-source-path')?.value.includes('misnamed.png'), 'loaded animated background');
      const liveFrames = await sampleAnimation();
      async function savedRecord() {
        const db = await new Promise((resolve, reject) => {
          const req = indexedDB.open('divoom-watchface-local-library-v1');
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
        try {
          return await new Promise((resolve, reject) => {
            const req = db.transaction('watchfaces').objectStore('watchfaces').getAll();
            req.onsuccess = () => resolve(req.result.find((row) => row.name === 'Animation Smoke'));
            req.onerror = () => reject(req.error);
          });
        } finally { db.close(); }
      }
      const record = await until(async () => {
        const value = await savedRecord();
        return value?.backgroundDataUrl?.startsWith('data:image/webp;base64,') ? value : null;
      }, 'saved animated background');
      return { liveFrames, savedMime: record.backgroundDataUrl.slice(0, 30), hasWebp: true };
    })()`);
    assert.ok(before.liveFrames > 1, "misnamed WebP background did not animate");
    assert.equal(before.hasWebp, true, "saved design flattened the animated WebP");

    await window.loadURL(`${APP_ORIGIN}/`);
    const restoredFrames = await window.webContents.executeJavaScript(`(async () => {
      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      let row;
      for (let i = 0; i < 300; i++) {
        row = [...document.querySelectorAll('#local-watchface-list li')]
          .find((item) => item.textContent.includes('Animation Smoke'));
        if (row) break;
        await sleep(100);
      }
      if (!row) throw new Error('saved design not found after reload');
      row.querySelector('button').click();
      await sleep(1500);
      const canvas = document.getElementById('watchface-canvas');
      const hashes = new Set();
      for (let n = 0; n < 8; n++) {
        const bytes = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
        let hash = 2166136261;
        for (let i = 0; i < bytes.length; i += 64) hash = Math.imul(hash ^ bytes[i], 16777619);
        hashes.add(hash >>> 0);
        await sleep(150);
      }
      return hashes.size;
    })()`);
    assert.ok(restoredFrames > 1, "restored design background did not animate");
    const divm = await window.webContents.executeJavaScript(`(async () => {
      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const bytes = await fetch('/template/15/2416.bin').then((response) => response.arrayBuffer());
      const transfer = new DataTransfer();
      transfer.items.add(new File([bytes], 'divm-with-png-name.png', { type: 'image/png' }));
      const input = document.getElementById('input-bg-file');
      input.files = transfer.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      for (let i = 0; i < 100; i++) {
        if (document.getElementById('txt-bg-source-path')?.value.includes('divm-with-png-name.png')) break;
        await sleep(100);
      }
      const canvas = document.getElementById('watchface-canvas');
      const hashes = new Set();
      for (let n = 0; n < 8; n++) {
        const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
        let hash = 2166136261;
        for (let i = 0; i < data.length; i += 64) hash = Math.imul(hash ^ data[i], 16777619);
        hashes.add(hash >>> 0);
        await sleep(150);
      }
      const db = await new Promise((resolve, reject) => {
        const req = indexedDB.open('divoom-watchface-local-library-v1');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      let savedMime = '';
      for (let i = 0; i < 100; i++) {
        const row = await new Promise((resolve, reject) => {
          const req = db.transaction('watchfaces').objectStore('watchfaces').getAll();
          req.onsuccess = () => resolve(req.result.find((item) => item.name === 'Animation Smoke'));
          req.onerror = () => reject(req.error);
        });
        savedMime = row?.backgroundDataUrl?.slice(0, 45) || '';
        if (savedMime.startsWith('data:application/octet-stream;base64,')) break;
        await sleep(100);
      }
      db.close();
      return { frames: hashes.size, savedMime };
    })()`);
    assert.ok(divm.frames > 1, "DIVOOM JPEG_GIF background did not animate");
    assert.ok(divm.savedMime.startsWith("data:application/octet-stream;base64,"), "DIVOOM JPEG_GIF bytes were not saved");
    await window.loadURL(`${APP_ORIGIN}/`);
    const restoredDivmFrames = await window.webContents.executeJavaScript(`(async () => {
      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      let row;
      for (let i = 0; i < 300; i++) {
        row = [...document.querySelectorAll('#local-watchface-list li')]
          .find((item) => item.textContent.includes('Animation Smoke'));
        if (row) break;
        await sleep(100);
      }
      if (!row) throw new Error('DIVOOM design not found after reload');
      row.querySelector('button').click();
      await sleep(1500);
      const canvas = document.getElementById('watchface-canvas');
      const hashes = new Set();
      for (let n = 0; n < 8; n++) {
        const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
        let hash = 2166136261;
        for (let i = 0; i < data.length; i += 64) hash = Math.imul(hash ^ data[i], 16777619);
        hashes.add(hash >>> 0);
        await sleep(150);
      }
      return hashes.size;
    })()`);
    assert.ok(restoredDivmFrames > 1, "restored DIVOOM JPEG_GIF background did not animate");
    const staticFormats = await window.webContents.executeJavaScript(`(async () => {
      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      async function select(bytes, name, declaredType) {
        const transfer = new DataTransfer();
        transfer.items.add(new File([bytes], name, { type: declaredType }));
        const input = document.getElementById('input-bg-file');
        input.files = transfer.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
        for (let i = 0; i < 100; i++) {
          if (document.getElementById('txt-bg-source-path')?.value.includes(name)) return true;
          await sleep(100);
        }
        return false;
      }
      const jpeg = await fetch('/template/15/1889.jpg').then((response) => response.arrayBuffer());
      const jpegLoaded = await select(jpeg, 'jpeg-misnamed.webp', 'image/webp');
      const source = document.createElement('canvas');
      source.width = source.height = 32;
      source.getContext('2d').fillRect(0, 0, 32, 32);
      const png = await new Promise((resolve) => source.toBlob(resolve, 'image/png'));
      const pngLoaded = await select(await png.arrayBuffer(), 'png-misnamed.jpg', 'image/jpeg');
      return { jpegLoaded, pngLoaded };
    })()`);
    assert.deepEqual(staticFormats, { jpegLoaded: true, pngLoaded: true });
    await window.webContents.executeJavaScript(`(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      const db = await new Promise((resolve, reject) => {
        const req = indexedDB.open('divoom-watchface-local-library-v1');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      const rows = await new Promise((resolve, reject) => {
        const req = db.transaction('watchfaces').objectStore('watchfaces').getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      const row = rows.find((item) => item.name === 'Animation Smoke');
      if (!row) throw new Error('legacy fixture record missing');
      const still = document.createElement('canvas');
      still.width = still.height = 32;
      row.backgroundDataUrl = still.toDataURL('image/jpeg');
      row.backgroundName = '174.png';
      row.backgroundSourceLabel = 'astrotoo://app/template/15/174.webp';
      row.config.TemplateAssetClockId = 173;
      await new Promise((resolve, reject) => {
        const tx = db.transaction('watchfaces', 'readwrite');
        tx.objectStore('watchfaces').put(row);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    })()`);
    await window.loadURL(`${APP_ORIGIN}/`);
    const recoveredLegacyFrames = await window.webContents.executeJavaScript(`(async () => {
      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      for (let i = 0; i < 300; i++) {
        if (document.getElementById('txt-bg-source-path')?.value.includes('174.webp')) break;
        await sleep(100);
      }
      if (!document.getElementById('txt-bg-source-path')?.value.includes('174.webp')) {
        throw new Error('legacy animation was not recovered');
      }
      const canvas = document.getElementById('watchface-canvas');
      const hashes = new Set();
      for (let n = 0; n < 8; n++) {
        const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
        let hash = 2166136261;
        for (let i = 0; i < data.length; i += 64) hash = Math.imul(hash ^ data[i], 16777619);
        hashes.add(hash >>> 0);
        await sleep(150);
      }
      return hashes.size;
    })()`);
    assert.ok(recoveredLegacyFrames > 1, "legacy JPEG record did not recover its animated background");
    console.log(JSON.stringify({ ...before, restoredFrames, divm, restoredDivmFrames, staticFormats, recoveredLegacyFrames }));
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    window.destroy();
    app.exit(process.exitCode || 0);
  }
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
  app.exit(process.exitCode || 0);
});

app.on("quit", () => {
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* Windows may hold Chromium files */ }
});
