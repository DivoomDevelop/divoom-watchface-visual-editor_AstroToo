import assert from "node:assert/strict";
import { resolveChinaStoreApiUrl } from "../src/editor/divoomCloudApi.js";
import { downloadWatchfaceAsset, syncDeviceWatchfaces } from "../src/editor/deviceWatchfaceSync.js";

assert.equal(resolveChinaStoreApiUrl("Channel/GetDeviceClockIdList"),
  "/divoom-china-review-api/Channel/GetDeviceClockIdList");
assert.equal(resolveChinaStoreApiUrl("Device/GetClockInfoV3"),
  "/divoom-china-review-api/Device/GetClockInfoV3");

const originalFetch = globalThis.fetch;
const originalFileReader = globalThis.FileReader;
try {
  globalThis.fetch = async (url) => {
    assert.equal(url, "http://localhost:5173/divoom-cdn-proxy/group/image.png");
    return { ok: true, arrayBuffer: async () => Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]).buffer };
  };
  globalThis.FileReader = class {
    readAsDataURL(blob) {
      blob.arrayBuffer().then((buffer) => {
        this.result = `data:${blob.type};base64,${Buffer.from(buffer).toString("base64")}`;
        this.onload();
      });
    }
  };
  const image = await downloadWatchfaceAsset("group/image.png", "http://localhost:5173");
  assert.equal(image, "data:image/png;base64,iVBORw0KGgo=");
} finally {
  globalThis.fetch = originalFetch;
  globalThis.FileReader = originalFileReader;
}

const deviceId = 300426474;
const calls = [];
const downloads = [];
const rows = [{ id: "existing", name: "Edited locally", config: { ClockId: 7 },
  deviceClockIds: { [deviceId]: 7 } }];
let failAsset = "";
const details = { ClockList: [
  { ClockId: 7, Name: "Server copy", ItemList: [] },
  { ClockId: 8, Name: "New cloud dial", PreviewImageUrl: "group/preview.jpg",
    DeviceImageId: "group/background.webp", Status: 3,
    ItemList: [{ item_id: "image", image_addr: "group/element.png" }] },
  { ClockId: 9, Name: "Retry after failure", DeviceImageId: "group/missing.png", ItemList: [] }
] };
const storeJson = async (command, payload) => {
  calls.push(command);
  assert.equal(payload.DeviceId, deviceId);
  return command === "Channel/GetDeviceClockIdList"
    ? { ClockList: [{ ClockId: 7 }, { ClockId: 8 }, { ClockId: 8 }, { ClockId: 9 }] }
    : details;
};
const options = {
  deviceId, storeJson,
  list: () => rows,
  save: async (row) => { rows.push(row); },
  loadAsset: async (path) => {
    downloads.push(path);
    if (path === failAsset) throw new Error("download failed");
    return `data:image/png;base64,${Buffer.from(path).toString("base64")}`;
  }
};
failAsset = "group/missing.png";
const first = await syncDeviceWatchfaces(options);
assert.deepEqual(calls, ["Channel/GetDeviceClockIdList", "Channel/GetDeviceClockInfo"]);
assert.equal(first.imported, 1);
assert.equal(first.errors[0].clockId, 9);
assert.equal(rows[0].name, "Edited locally");
assert.equal(rows[1].source, "deviceCloud");
assert.equal(rows[1].config.ClockId, 8);
assert.equal(rows[1].deviceClockIds[deviceId], 8);
assert.equal(rows[1].localDispAssets[0].dataUrl.startsWith("data:"), true);
assert.deepEqual(downloads, ["group/background.webp", "group/preview.jpg", "group/element.png", "group/missing.png"]);

calls.length = 0;
failAsset = "";
const retry = await syncDeviceWatchfaces(options);
assert.equal(retry.imported, 1);
assert.equal(rows.length, 3);
assert.deepEqual(calls, ["Channel/GetDeviceClockIdList", "Channel/GetDeviceClockInfo"]);

calls.length = 0;
const complete = await syncDeviceWatchfaces(options);
assert.equal(complete.imported, 0);
assert.deepEqual(calls, ["Channel/GetDeviceClockIdList"]);
console.log("PASS: device clocks import with assets, preserve local edits, and retry incomplete downloads");
