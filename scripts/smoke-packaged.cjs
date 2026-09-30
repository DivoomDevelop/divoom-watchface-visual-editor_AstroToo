const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const net = require("node:net");
const path = require("node:path");

const executable = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.resolve(__dirname, "..", "out-desktop", "win-unpacked", "AstroToo Watchface Editor.exe");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function pageTarget(port) {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      const pages = await response.json();
      const target = pages.find((item) => item.type === "page" && item.url.startsWith("astrotoo://app/"));
      if (target) return target;
    } catch { /* application is starting */ }
    await sleep(250);
  }
  throw new Error("packaged editor page did not open");
}

async function evaluate(webSocketUrl, expression) {
  const ws = new WebSocket(webSocketUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });
  try {
    const response = new Promise((resolve, reject) => {
      ws.addEventListener("message", (event) => {
        const data = JSON.parse(event.data);
        if (data.id !== 1) return;
        if (data.error || data.result?.exceptionDetails) reject(new Error(JSON.stringify(data)));
        else resolve(data.result.result.value);
      });
    });
    ws.send(JSON.stringify({
      id: 1,
      method: "Runtime.evaluate",
      params: { expression, awaitPromise: true, returnByValue: true }
    }));
    return await response;
  } finally {
    ws.close();
  }
}

(async () => {
  const port = await freePort();
  const child = spawn(executable, [`--remote-debugging-port=${port}`], { windowsHide: true, stdio: "ignore" });
  try {
    const target = await pageTarget(port);
    let ready = false;
    for (let attempt = 0; attempt < 60 && !ready; attempt++) {
      try {
        ready = await evaluate(target.webSocketDebuggerUrl,
          "location.href.startsWith('astrotoo://app/') && Boolean(document.getElementById('btn-new-watchface')?.textContent.trim())");
      } catch { /* navigation is still in progress */ }
      if (!ready) await sleep(250);
    }
    assert.equal(ready, true, "packaged editor did not render");
    const result = await evaluate(target.webSocketDebuggerUrl, `(async () => ({
      origin: location.origin,
      editor: Boolean(document.getElementById('watchface-canvas')),
      scriptsRan: Boolean(document.getElementById('btn-new-watchface')?.textContent.trim()),
      health: (await fetch('/api/template-sync/health').then(r => r.json())).ok,
      fontStatus: (await fetch('/font/font_info.cfg')).status
    }))()`);
    assert.deepEqual(result, { origin: "astrotoo://app", editor: true, scriptsRan: true, health: true, fontStatus: 200 });
    console.log(JSON.stringify(result));
  } finally {
    child.kill();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
