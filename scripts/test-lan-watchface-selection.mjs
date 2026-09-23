import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import {
  getDeviceClockId,
  getUnboundLegacyClockId,
  normalizeDeviceClockBindings,
  withDeviceClockId
} from "../src/editor/deviceClockBindings.js";

const source = fs.readFileSync(new URL("../src/editor/app.js", import.meta.url), "utf8");

function functionSource(signature, nextSignature) {
  const start = source.indexOf(signature);
  assert(start >= 0, `missing ${signature}`);
  const end = source.indexOf(nextSignature, start);
  assert(end > start, `missing terminator ${nextSignature}`);
  return source.slice(start, end);
}

const refreshSource = functionSource(
  "  function refreshLanActionButtons()",
  "\n  function refreshSidebarBrowseChrome()"
);
const selectSource = functionSource(
  "  async function selectLocalWatchfaceOnDevice(",
  "\n  async function loadLocalWatchfaceById("
);
const loadSource = functionSource(
  "  async function loadLocalWatchfaceById(",
  "\n  async function deleteLocalWatchface("
);

const dom = {
  btnLanCreateOnDevice: {},
  btnLanShowCurrentClockOnDevice: {},
  btnLanShareWatchface: { setAttribute() {} }
};
let deviceChanged = false, uploadChanged = false;
const buttonContext = vm.createContext({
  dom,
  state: { config: { ClockId: 60001 } },
  lanShareBusy: false,
  lanSyncBusy: false,
  sidebarBrowseMode: "local",
  toNum: Number,
  isLanDeviceSelectedInUi: () => true,
  hasLanDeviceHttpTarget: () => true,
  hasLanDeviceChanges: () => deviceChanged,
  hasLanUploadChanges: () => uploadChanged,
  lanUploadButtonTranslationKey: () => "ui.btn.lanShare",
  t: value => value,
  setNodeText: (element, label) => { element.textContent = label; }
});
vm.runInContext(refreshSource, buttonContext);
buttonContext.refreshLanActionButtons();
assert.equal(dom.btnLanCreateOnDevice.textContent, "ui.btn.lanApplyWatchfaceConfig");
assert.equal(dom.btnLanCreateOnDevice.disabled, true, "unchanged clock cannot be applied");
assert.equal(dom.btnLanShareWatchface.disabled, true, "unchanged clock cannot be uploaded");

deviceChanged = true; uploadChanged = true;
buttonContext.refreshLanActionButtons();
assert.equal(dom.btnLanCreateOnDevice.disabled, false, "changed clock can be applied");
assert.equal(dom.btnLanShareWatchface.disabled, false, "changed clock can be uploaded");

deviceChanged = false;
buttonContext.refreshLanActionButtons();
assert.equal(dom.btnLanCreateOnDevice.disabled, true, "applying changes disables the merged button");
assert.equal(dom.btnLanShareWatchface.disabled, false, "unuploaded changes remain uploadable");

buttonContext.state.config.ClockId = 0;
buttonContext.refreshLanActionButtons();
assert.equal(dom.btnLanCreateOnDevice.textContent, "ui.btn.lanCreate");
assert.equal(dom.btnLanCreateOnDevice.disabled, true, "unchanged new clock cannot be created");
assert.equal(dom.btnLanShareWatchface.disabled, true, "clock without id cannot be uploaded");
deviceChanged = true;
buttonContext.refreshLanActionButtons();
assert.equal(dom.btnLanCreateOnDevice.disabled, false, "changed new clock can be created");

const calls = [];
const logs = [];
const selectContext = vm.createContext({
  Number,
  toNum: Number,
  hasLanDeviceHttpTarget: () => true,
  divoomJson: async (command, payload) => {
    calls.push({ command, payload });
    return { ReturnCode: 0 };
  },
  fontStore: { log: message => logs.push(message) },
  t: (_key, values) => `selected ${values.id}`,
  errorToText: error => error.message
});
vm.runInContext(selectSource, selectContext);
assert.equal(await selectContext.selectLocalWatchfaceOnDevice(60001), true);
assert.equal(calls.length, 1);
assert.equal(calls[0].command, "Channel/SetClockSelectId");
assert.equal(calls[0].payload.ClockId, 60001);
assert.deepEqual(logs, ["selected 60001"]);
assert.equal(await selectContext.selectLocalWatchfaceOnDevice(0), false);
assert.equal(calls.length, 1);

const selectedIds = [];
const loadContext = vm.createContext({
  activeLocalWatchfaceId: "",
  namingPromptDismissed: false,
  lanSyncBusy: false,
  lanShareBusy: false,
  state: { config: { ClockId: 60002 } },
  ensureWorkspaceHandledBeforeSwitch: async () => true,
  getWatchface: id => ({ id, config: { ClockId: 60002 } }),
  setLastActiveId() {},
  restoreWorkspaceFromRecord: async () => {},
  refreshLocalWatchfaceListUi() {},
  selectLocalWatchfaceOnDevice: async id => { selectedIds.push(id); return true; }
});
vm.runInContext(loadSource, loadContext);
await loadContext.loadLocalWatchfaceById("saved-clock");
assert.deepEqual(selectedIds, [60002], "selecting a saved clock must switch the device immediately");

let bindings = normalizeDeviceClockBindings({ config: { ClockId: 60003 } }, 300426474);
assert.equal(getDeviceClockId(bindings, 300426474), 60003, "legacy ClockId migrates only to the selected device");
assert.equal(getDeviceClockId(bindings, 300426475), 0, "a second device must not reuse the first device ClockId");
bindings = withDeviceClockId(bindings, 300426475, 70001);
assert.equal(getDeviceClockId(bindings, 300426474), 60003);
assert.equal(getDeviceClockId(bindings, 300426475), 70001);
bindings = withDeviceClockId(bindings, 300426474, 0);
assert.equal(getDeviceClockId(bindings, 300426474), 0);
assert.equal(getDeviceClockId(bindings, 300426475), 70001);

const restoreBeforeRefresh = { config: { ClockId: 61000 } };
bindings = normalizeDeviceClockBindings(restoreBeforeRefresh, 0);
assert.deepEqual(bindings, {}, "legacy id stays unbound while no device is known");
let pendingLegacyId = getUnboundLegacyClockId(restoreBeforeRefresh, bindings);
assert.equal(pendingLegacyId, 61000);
bindings = withDeviceClockId(bindings, 300426474, pendingLegacyId);
pendingLegacyId = 0;
assert.equal(getDeviceClockId(bindings, 300426474), 61000, "first concrete device consumes pending legacy id");
assert.equal(pendingLegacyId, 0);

const persistedPending = {
  config: { ClockId: 0 },
  deviceClockIds: {},
  unboundLegacyClockId: 62000
};
bindings = normalizeDeviceClockBindings(persistedPending, 300426475);
assert.equal(getDeviceClockId(bindings, 300426475), 62000,
  "refresh-before-restore binds the persisted pending legacy id");

console.log("PASS: per-device ClockId binding, button state and automatic Channel/SetClockSelectId");
