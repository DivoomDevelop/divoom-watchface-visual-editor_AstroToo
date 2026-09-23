import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../src/editor/app.js", import.meta.url), "utf8");
const start = source.indexOf("  function flushPersistActiveWorkspace() {");
const end = source.indexOf("  async function doFlushPersistActiveWorkspace(", start);
assert(start >= 0 && end > start);

const calls = [];
let releaseFirst;
let firstStarted;
const started = new Promise((resolve) => { firstStarted = resolve; });
const gate = new Promise((resolve) => { releaseFirst = resolve; });
const context = vm.createContext({
  persistQueue: Promise.resolve(),
  activeLocalWatchfaceId: "watchface-A",
  doFlushPersistActiveWorkspace: async (id) => {
    calls.push(id);
    if (calls.length === 1) { firstStarted(); await gate; }
    return true;
  },
  alert: () => assert.fail("save should not fail"),
  t: () => "save failed",
  errorToText: String
});
vm.runInContext(source.slice(start, end), context);

const first = context.flushPersistActiveWorkspace();
await started;
const second = context.flushPersistActiveWorkspace();
assert.deepEqual(calls, ["watchface-A"], "second save must wait for first");
context.activeLocalWatchfaceId = "watchface-B";
releaseFirst();
assert.equal(await first, true);
assert.equal(await second, false, "queued A save must not run after switching to B");
assert.deepEqual(calls, ["watchface-A"]);
assert.equal(await context.flushPersistActiveWorkspace(), true);
assert.deepEqual(calls, ["watchface-A", "watchface-B"]);

const snapshotStart = source.indexOf("  async function doFlushPersistActiveWorkspace(");
const snapshotEnd = source.indexOf("  async function persistNewNamedWatchface(", snapshotStart);
const persistBody = source.slice(snapshotStart, snapshotEnd);
assert(persistBody.indexOf("const workspace = {") < persistBody.indexOf("await new Promise"),
  "workspace state and asset references must be captured before asynchronous conversion");
assert.match(persistBody, /workspaceBaselineSig = savedSig/);
console.log("PASS: local saves serialize, reject stale watchface jobs, snapshot before awaits");
