import assert from "node:assert/strict";
import {
  saveLocalDispAssetRecords,
  loadLocalDispAssetRecords,
  deleteLocalDispAssetRecords
} from "../src/editor/localDispAssetStore.js";

const rows = new Map();
const objectStore = {
  put(value, key) { return makeRequest(() => rows.set(key, structuredClone(value))); },
  get(key) { return makeRequest(() => structuredClone(rows.get(key))); },
  delete(key) { return makeRequest(() => rows.delete(key)); }
};
let activeTransaction;
function makeRequest(action) {
  const request = {};
  queueMicrotask(() => {
    request.result = action();
    request.onsuccess?.();
    activeTransaction.oncomplete?.();
  });
  return request;
}
globalThis.indexedDB = {
  open() {
    const request = {};
    queueMicrotask(() => {
      request.result = {
        objectStoreNames: { contains: () => false },
        createObjectStore: () => objectStore,
        transaction() {
          activeTransaction = { objectStore: () => objectStore };
          return activeTransaction;
        }
      };
      request.onupgradeneeded?.();
      request.onsuccess?.();
    });
    return request;
  }
};

const assets = [{ itemId: "DispItem_1", assetKey: 9, dataUrl: "data:image/png;base64,AAAA" }];
await saveLocalDispAssetRecords("watchface:one", assets);
assert.deepEqual(await loadLocalDispAssetRecords("watchface:one"), assets);
assert.deepEqual(await loadLocalDispAssetRecords("watchface:two"), []);
await saveLocalDispAssetRecords("watchface:two", [{ ...assets[0], itemId: "DispItem_2" }]);
await deleteLocalDispAssetRecords("watchface:one");
assert.deepEqual(await loadLocalDispAssetRecords("watchface:one"), []);
assert.equal((await loadLocalDispAssetRecords("watchface:two"))[0].itemId, "DispItem_2");
console.log("PASS: IndexedDB display-item assets save, load, isolate, and delete");
