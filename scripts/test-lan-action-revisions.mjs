import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { Buffer } from "node:buffer";

const source = fs.readFileSync(new URL("../src/editor/app.js", import.meta.url), "utf8");
const assetStart = source.indexOf("  function lanAssetKey(");
const assetEnd = source.indexOf("  /** Device/CreateLocalClock", assetStart);
assert(assetStart >= 0 && assetEnd > assetStart);
const assetContext = vm.createContext({ WeakMap, Math, Number, String,
  lanAssetIdentity: new WeakMap(), nextLanAssetIdentity: 1 });
vm.runInContext(source.slice(assetStart, assetEnd), assetContext);
const priorImageKey = assetContext.lanAssetKey({ src: "blob:old-session" });
const restoredImage = { src: "data:image/jpeg;base64,new-session" };
assetContext.restoreLanAssetKey(restoredImage, priorImageKey);
assert.equal(assetContext.lanAssetKey(restoredImage), priorImageKey,
  "restored image must reuse the saved fingerprint rather than its new URL");
assetContext.restoreLanAssetKey({}, 9);
assert.equal(assetContext.lanAssetKey({}), 10,
  "restored numeric identities must not collide with new assets");
const persistStart = source.indexOf("  async function localDispAssetDataUrlForPersist(");
const persistEnd = source.indexOf("  function persistImageCacheKey(", persistStart);
assert(persistStart >= 0 && persistEnd > persistStart);
let assetFetches = 0;
class FakeFileReader {
  async readAsDataURL(blob) {
    this.result = `data:${blob.type};base64,${Buffer.from(await blob.arrayBuffer()).toString("base64")}`;
    this.onload();
  }
}
const persistContext = vm.createContext({
  WeakMap, String, FileReader: FakeFileReader,
  localDispPersistDataUrls: new WeakMap(),
  fetch: async () => { assetFetches += 1; return { ok: true, blob: async () => new Blob(["image"], { type: "image/png" }) }; }
});
vm.runInContext(source.slice(persistStart, persistEnd), persistContext);
const localAsset = { fromLocalPick: true, objectUrl: "blob:local-display-item" };
assert.equal(await persistContext.localDispAssetDataUrlForPersist(localAsset), "data:image/png;base64,aW1hZ2U=");
assert.equal(await persistContext.localDispAssetDataUrlForPersist(localAsset), "data:image/png;base64,aW1hZ2U=");
assert.equal(assetFetches, 1, "local display-item bytes should be cached between autosaves");
assert.match(source, /localDispAssets: savedLocalDispAssets/);
assert.match(source, /restoreLanAssetKey\(asset, saved\.assetKey\)/);
const start = source.indexOf("  function hasLanDeviceChanges()");
const end = source.indexOf("  /** 顶部下拉是否已选具体设备", start);
assert(start >= 0 && end > start);
const functions = source.slice(start, end);

function makeSession(record, dial = "original dial", preview = "preview") {
  let deviceId = 300426474;
  let deviceContent = dial;
  let uploadContent = `${dial} + ${preview}`;
  const context = vm.createContext({
    Map, Object, Math, Number,
    lanDeviceRevision: 0,
    lanUploadRevision: 0,
    lastLanDeviceSnapshot: "",
    lastLanUploadSnapshot: "",
    lanDeviceAppliedRevisions: new Map(),
    lanUploadedRevisions: new Map(),
    lanDeviceBaselineSnapshots: new Map(),
    lanUploadBaselineSnapshots: new Map(),
    activeLocalWatchfaceId: "local-design",
    activeDeviceClockIds: record?.deviceClockIds || {},
    getDeviceClockId: (bindings, id) => Number(bindings?.[id] || 0),
    getLanDeviceSnapshot: () => deviceContent,
    getLanUploadSnapshot: () => uploadContent,
    resolveClockBindingDeviceId: () => deviceId,
    refreshLanActionButtons() {},
    toNum: (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback
  });
  vm.runInContext(functions, context);
  context.restoreLanActionRevisions(record);
  return {
    context,
    editDial(value) {
      deviceContent = value;
      uploadContent = `${value} + preview`;
      context.noteLanContentEdited();
    },
    editPreview(value) {
      uploadContent = `${deviceContent} + ${value}`;
      context.noteLanContentEdited();
    },
    selectDevice(id) { deviceId = id; },
    saveRecord() {
      return {
        lanActionRevisions: {
          device: context.lanDeviceRevision,
          upload: context.lanUploadRevision,
          appliedByDevice: Object.fromEntries(context.lanDeviceAppliedRevisions),
          uploadedByDevice: Object.fromEntries(context.lanUploadedRevisions),
          deviceSnapshots: Object.fromEntries(context.lanDeviceBaselineSnapshots),
          uploadSnapshots: Object.fromEntries(context.lanUploadBaselineSnapshots)
        },
        deviceClockIds: context.activeDeviceClockIds
      };
    }
  };
}

const first = makeSession(null);
assert.equal(first.context.hasLanDeviceChanges(), false);
assert.equal(first.context.hasLanUploadChanges(), false);
first.editDial("temporary dial");
first.editDial("original dial");
assert.equal(first.context.hasLanDeviceChanges(), false, "reverting the edit must be clean");
assert.equal(first.context.hasLanUploadChanges(), false, "reverting the edit must not enable upload");
first.editDial("changed dial");
assert.equal(first.context.hasLanDeviceChanges(), true);
assert.equal(first.context.hasLanUploadChanges(), true);
first.context.captureLanBaseline();
assert.equal(first.context.hasLanDeviceChanges(), false);
assert.equal(first.context.hasLanUploadChanges(), true);

const savedAfterApply = first.saveRecord();
savedAfterApply.deviceClockIds = { 300426474: 60003 };
const reopened = makeSession(savedAfterApply, "changed dial");
assert.equal(reopened.context.hasLanDeviceChanges(), false);
assert.equal(reopened.context.hasLanUploadChanges(), true,
  "autosaved watchface must remain uploadable after reopening");
reopened.selectDevice(300426475);
assert.equal(reopened.context.hasLanDeviceChanges(), true,
  "another device has not received the edited dial");
const unchangedOnOtherDevice = makeSession({ deviceClockIds: { 300426474: 60003 } });
unchangedOnOtherDevice.selectDevice(300426475);
assert.equal(unchangedOnOtherDevice.context.hasLanDeviceChanges(), true,
  "an unchanged saved dial still needs creating on a different device");
reopened.selectDevice(300426474);
reopened.editPreview("new preview");
assert.equal(reopened.context.hasLanDeviceChanges(), false,
  "APP preview changes must not enable device apply");
assert.equal(reopened.context.hasLanUploadChanges(), true);
reopened.context.captureLanUploadBaseline();
assert.equal(reopened.context.hasLanUploadChanges(), false);

const savedAfterUpload = reopened.saveRecord();
const reopenedAgain = makeSession(savedAfterUpload, "changed dial", "new preview");
assert.equal(reopenedAgain.context.hasLanDeviceChanges(), false);
assert.equal(reopenedAgain.context.hasLanUploadChanges(), false);

const twoDevices = makeSession({ deviceClockIds: { 300426474: 60003, 300426475: 60004 } });
twoDevices.context.captureLanBaseline();
twoDevices.context.captureLanUploadBaseline();
twoDevices.selectDevice(300426475);
twoDevices.context.captureLanBaseline();
twoDevices.context.captureLanUploadBaseline();
twoDevices.selectDevice(300426474);
twoDevices.editDial("temporary dial");
twoDevices.editDial("original dial");
twoDevices.selectDevice(300426475);
assert.equal(twoDevices.context.hasLanDeviceChanges(), false,
  "reverting on device A must leave identical device B clean");
assert.equal(twoDevices.context.hasLanUploadChanges(), false,
  "reverting on device A must leave identical upload on B clean");
const restoredTwoDevices = makeSession(twoDevices.saveRecord());
restoredTwoDevices.selectDevice(300426475);
assert.equal(restoredTwoDevices.context.hasLanDeviceChanges(), false);
assert.equal(restoredTwoDevices.context.hasLanUploadChanges(), false);

const restoredAsset = makeSession({
  deviceClockIds: { 300426474: 60003, 300426475: 60004 },
  lanActionRevisions: {
    device: 2, upload: 2,
    appliedByDevice: { 300426474: 2, 300426475: 2 },
    uploadedByDevice: { 300426474: 2, 300426475: 2 },
    deviceSnapshots: { 300426474: "dial blob:url", 300426475: "dial blob:url" },
    uploadSnapshots: { 300426474: "dial blob:url + preview", 300426475: "dial blob:url + preview" }
  }
}, "dial data:url");
restoredAsset.editDial("temporary dial");
restoredAsset.editDial("dial data:url");
restoredAsset.selectDevice(300426475);
assert.equal(restoredAsset.context.hasLanDeviceChanges(), false,
  "blob-to-data URL restore must rebase clean device snapshots before edit/revert");
assert.equal(restoredAsset.context.hasLanUploadChanges(), false,
  "blob-to-data URL restore must rebase clean upload snapshots before edit/revert");

const dirtyRestoredAsset = makeSession({
  deviceClockIds: { 300426474: 60003 },
  backgroundAssetKey: "stable-image-key",
  lanActionRevisions: {
    device: 2, upload: 2,
    appliedByDevice: { 300426474: 1 },
    uploadedByDevice: { 300426474: 1 },
    deviceSnapshots: { 300426474: "original dial + stable-image-key" },
    uploadSnapshots: { 300426474: "original dial + stable-image-key + preview" }
  }
}, "edited text + stable-image-key");
assert.equal(dirtyRestoredAsset.context.hasLanDeviceChanges(), true);
dirtyRestoredAsset.editDial("original dial + stable-image-key");
assert.equal(dirtyRestoredAsset.context.hasLanDeviceChanges(), false,
  "dirty restored text edit must become clean when reverted with the persisted image key");
assert.equal(dirtyRestoredAsset.context.hasLanUploadChanges(), false);

console.log("PASS: no-change gating, persistent multi-device revisions, edit/revert, preview-only edits");
