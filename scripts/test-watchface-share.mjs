import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
const source = fs.readFileSync(new URL("../src/editor/app.js", import.meta.url), "utf8");
function fn(name, next) {
  const start = source.indexOf(`  async function ${name}(`);
  assert(start >= 0);
  return source.slice(start, source.indexOf(next, start));
}
const binding = fn("bindLanSequentialAssets", "\n  /**");
const share = fn("onLanShareWatchfaceClick", "\n  async function lanSubmitDeviceCreateWithName");
const calls = [], errors = [], messages = [];
let failAsset = 0, assetCount = 0, failPatch = false, supported = true, ack = true;
let isUpdate = false, lastSharePayload = null, persistCount = 0;
let deviceChanged = true, uploadChanged = true, uploadBaselineCount = 0;
let sharePublic = true;
const ctx = vm.createContext({
  Blob, Uint8Array, Map, JSON, Number, String, console,
  EDITOR_CANVAS_WIDTH: 480, EDITOR_CANVAS_HEIGHT: 480,
  resolveLanDeviceCreateClockName: () => "test",
  renderWatchface: () => {},
  lanShareBusy: false, lanSyncBusy: false,
  state: { config: { ClockId: 8123, ItemList: [{}] }, appPreviewImage: { naturalWidth: 480, naturalHeight: 480 } },
  activeDeviceUploadStates: {}, activeLocalWatchfaceId: "watchface-1",
  dom: Object.fromEntries(["selectLanDevice", "btnRefreshLanDevices", "mainLayout", "appModeLocal", "appModeTemplate"].map(k => [k, { inert: false }])),
  hasLanDeviceHttpTarget: () => true, toNum: Number,
  hasLanDeviceChanges: () => deviceChanged,
  hasLanUploadChanges: () => uploadChanged,
  captureLanUploadBaseline: () => { uploadBaselineCount++; },
  refreshLocalWatchfaceStatusForDevice: async () => {},
  refreshLanActionButtons: () => {}, fontStore: { log() {} },
  t: key => key, errorToText: e => e.message,
  alert: msg => errors.push(msg), showLanCenteredMessage: msg => messages.push(msg),
  validateAppPreviewImage: image => ({ width: image.naturalWidth, height: image.naturalHeight,
    ok: image.naturalWidth > 0 && image.naturalWidth <= 480 && image.naturalHeight > 0 && image.naturalHeight <= 480 }),
  focusAppPreviewPicker: () => {},
  activeOnlineUploadState: () => isUpdate ? { clockId: 8123, shareToOthers: false } : null,
  openLanUploadConfirmDialog: async () => ({ shareToOthers: sharePublic, classifyId: sharePublic ? 30 : 0,
    messageInfo: isUpdate ? "updated from PC" : "" }),
  encodeAppPreviewWebp: async () => new Blob([new Uint8Array(300)], { type: "image/webp" }),
  resolveClockBindingDeviceId: () => 300426474,
  withDeviceUploadState: (states, deviceId, uploadState) => ({ ...states, [deviceId]: uploadState }),
  flushPersistActiveWorkspace: async () => { persistCount++; },
  LAN_MULTIPART_ENDPOINT: { asset: "/upload_local_asset" },
  collectLanBundlableDispAssetLeaves: () => new Map([
    ["element_0.bin", { itemIndex: 0, sourceLeaf: "a.png", asset: { objectUrl: "blob:a" } }],
    ["element_1.bin", { itemIndex: 1, sourceLeaf: "a.png", asset: { objectUrl: "blob:a" } }]
  ]),
  basename: value => value.split("/").at(-1),
  fetch: async () => ({ ok: true, arrayBuffer: async () => new Uint8Array(300).buffer }),
  ensureBundleSlotBytesAreSupported: async bytes => bytes,
  postLanMultipartToDevice: async (path, meta, blob, filename) => {
    calls.push(meta.Command); assetCount++;
    if (assetCount === failAsset) throw new Error("asset failed");
    if (meta.Command === "Device/UploadLocalAsset" && filename === "app-preview.webp") {
      assert.equal(blob.type, "image/webp");
    }
    return { ReturnCode: 0, FileId: `local://asset-${assetCount}.bin` };
  },
  onLanApplyWatchfaceConfigClick: async ({ forShare }) => {
    assert.equal(forShare, true); calls.push("patch");
    if (failPatch) throw new Error("patch failed");
    return true;
  },
  divoomJson: async (command, payload) => {
    calls.push(command);
    if (command === "Device/GetLanCapabilities") return { SupportsClockShare: supported };
    if (command === "Device/PatchLocalClockInfo") return { ReturnCode: 0 };
    assert.equal(command, "Device/ShareLocalClock");
    lastSharePayload = payload;
    return ack ? { ReturnCode: 0, Shared: true } : { ReturnCode: 0 };
  }
});
vm.runInContext(binding + share, ctx);
const original = { ItemList: [{ image_addr: "a.png" }, { image_addr: "a.png" }],
  ItemPatchList: [{ index: 0, patch: { bundle_image: "a.png" } }] };
const result = await ctx.bindLanSequentialAssets(original);
assert.equal(assetCount, 2);
assert.notEqual(result.ItemList[0].image_addr, result.ItemList[1].image_addr);
assert.equal(result.ItemPatchList, undefined);
assert.equal(original.ItemList[0].image_addr, "a.png");
const patch = await ctx.bindLanSequentialAssets({ ItemPatchList: [{ index: 0, patch: { bundle_image: "element_0.bin", image_addr: "a.png" } }] });
assert.equal(patch.ItemPatchList[0].patch.bundle_image, undefined);
assert.match(patch.ItemPatchList[0].patch.image_addr, /^local:\/\//);
failAsset = assetCount + 1;
await assert.rejects(ctx.bindLanSequentialAssets(original), /asset failed/);
failAsset = 0;
calls.length = 0;
await ctx.onLanShareWatchfaceClick();
assert.deepEqual(calls, ["Device/GetLanCapabilities", "patch", "Device/UploadLocalAsset", "Device/PatchLocalClockInfo", "Device/ShareLocalClock"]);
assert.equal(messages.length, 1);
assert.equal(lastSharePayload.ShareToOthers, true);
assert.equal(lastSharePayload.ClassifyId, 30);
assert.equal(lastSharePayload.MessageInfo, "");
assert.equal(persistCount, 1);
assert.equal(uploadBaselineCount, 1);
assert.equal(ctx.activeDeviceUploadStates[300426474].clockId, 8123);
isUpdate = true; calls.length = 0;
deviceChanged = false;
await ctx.onLanShareWatchfaceClick();
assert.equal(lastSharePayload.MessageInfo, "updated from PC");
assert.equal(lastSharePayload.ShareToOthers, true);
assert.equal(persistCount, 2);
assert(!calls.includes("patch"), "upload-only changes must not reapply device configuration");
sharePublic = false; calls.length = 0;
await ctx.onLanShareWatchfaceClick();
assert.equal(lastSharePayload.ShareToOthers, false);
assert.equal(lastSharePayload.ClassifyId, 0);
assert.equal(ctx.activeDeviceUploadStates[300426474].shareToOthers, false);
deviceChanged = true;
failPatch = true; calls.length = 0;
await ctx.onLanShareWatchfaceClick();
assert.deepEqual(calls, ["Device/GetLanCapabilities", "patch"]);
assert.equal(errors.at(-1), "patch failed");
failPatch = false; supported = false; calls.length = 0;
await ctx.onLanShareWatchfaceClick();
assert.deepEqual(calls, ["Device/GetLanCapabilities"]);
supported = true; ack = false;
await ctx.onLanShareWatchfaceClick();
assert.equal(messages.length, 3);
assert.equal(errors.at(-1), "lan.share.invalidResponse");
assert.equal(ctx.lanShareBusy, false);
assert(Object.values(ctx.dom).every(el => !el.inert));
ctx.lanSyncBusy = true; calls.length = 0;
await ctx.onLanShareWatchfaceClick();
assert.equal(calls.length, 0);
ctx.lanSyncBusy = false; uploadChanged = false;
await ctx.onLanShareWatchfaceClick();
assert.equal(calls.length, 0, "unchanged watchface cannot upload again");
console.log("PASS: public/private forwarding, sequential assets, patch-before-share, failure stops publish, capability, ACK, busy guard and UI recovery");
