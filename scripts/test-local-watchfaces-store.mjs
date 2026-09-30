import assert from "node:assert/strict";

const legacyKey = "divoom_local_watchfaces_v1";
const localValues = new Map([[legacyKey, JSON.stringify([
  { id: "older", updatedAt: 1, name: "legacy copy" },
  { id: "migrate", updatedAt: 2, name: "existing design" }
])]]);
globalThis.localStorage = {
  getItem: (key) => localValues.get(key) ?? null,
  removeItem: (key) => localValues.delete(key),
  setItem: (key, value) => {
    if (key === legacyKey) throw new Error("localStorage quota exceeded");
    localValues.set(key, value);
  }
};

const rows = new Map([["older", { id: "older", updatedAt: 3, name: "newer database copy" }]]);
let failId = "";
function makeRequest(transaction, action) {
  const request = {};
  transaction.pending += 1;
  queueMicrotask(() => {
    try {
      request.result = action();
      request.onsuccess?.();
    } catch (error) {
      request.error = error;
      transaction.error = error;
      transaction.failed = true;
      transaction.onerror?.();
    }
    transaction.pending -= 1;
    if (!transaction.pending && !transaction.failed) {
      queueMicrotask(() => transaction.oncomplete?.());
    }
  });
  return request;
}
const db = {
  objectStoreNames: { contains: () => false },
  createObjectStore() {},
  transaction() {
    const transaction = { pending: 0, failed: false };
    transaction.objectStore = () => ({
      getAll: () => makeRequest(transaction, () => structuredClone([...rows.values()])),
      put: (record) => makeRequest(transaction, () => {
        if (record.id === failId) throw new Error("database write failed");
        rows.set(record.id, structuredClone(record));
      }),
      delete: (id) => makeRequest(transaction, () => rows.delete(id))
    });
    return transaction;
  }
};
globalThis.indexedDB = {
  open() {
    const request = {};
    queueMicrotask(() => {
      request.result = db;
      request.onupgradeneeded?.();
      request.onsuccess?.();
    });
    return request;
  }
};

const store = await import("../src/editor/localWatchfacesStore.js");
await store.initializeWatchfacesStore();
assert.equal(store.getWatchface("older").name, "newer database copy");
assert.equal(store.getWatchface("migrate").name, "existing design");
assert.equal(rows.size, 2);
assert.equal(localValues.has(legacyKey), false, "legacy data is removed only after migration");

const largeImage = `data:image/png;base64,${"A".repeat(6_000_000)}`;
await store.upsert({ id: "large", updatedAt: 4, backgroundDataUrl: largeImage });
assert.equal(store.getWatchface("large").backgroundDataUrl, largeImage);
assert.equal(localValues.has(legacyKey), false, "large records must bypass localStorage");

failId = "broken";
await assert.rejects(store.upsert({ id: failId, updatedAt: 5 }), /database write failed/);
assert.equal(store.getWatchface(failId), null, "failed writes must not appear saved");
await Promise.all([
  store.upsert({ id: "concurrent-a", updatedAt: 6 }),
  store.upsert({ id: "concurrent-b", updatedAt: 7 })
]);
assert.equal(store.getWatchface("concurrent-a")?.id, "concurrent-a");
assert.equal(store.getWatchface("concurrent-b")?.id, "concurrent-b");

await store.removeWatchface("large");
assert.equal(store.getWatchface("large"), null);
assert.equal(rows.has("large"), false);
console.log("PASS: legacy watchfaces migrate to IndexedDB; large, concurrent, and failed saves remain consistent");
