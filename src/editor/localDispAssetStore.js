const DB_NAME = "divoom-watchface-local-assets-v1";
const STORE_NAME = "display-items";
let openPromise;

function openDatabase() {
  if (openPromise) return openPromise;
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("IndexedDB unavailable"));
  openPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB open failed"));
  }).catch((error) => {
    openPromise = undefined;
    throw error;
  });
  return openPromise;
}

function transact(db, mode, action) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode);
    const request = action(transaction.objectStore(STORE_NAME));
    let value;
    request.onsuccess = () => { value = request.result; };
    transaction.oncomplete = () => resolve(value);
    transaction.onerror = () => reject(transaction.error || request.error || new Error("IndexedDB transaction failed"));
    transaction.onabort = () => reject(transaction.error || new Error("IndexedDB transaction aborted"));
  });
}

export async function saveLocalDispAssetRecords(watchfaceId, records) {
  const db = await openDatabase();
  await transact(db, "readwrite", (store) => store.put(records, String(watchfaceId)));
}

export async function loadLocalDispAssetRecords(watchfaceId) {
  const db = await openDatabase();
  const records = await transact(db, "readonly", (store) => store.get(String(watchfaceId)));
  return Array.isArray(records) ? records : [];
}

export async function deleteLocalDispAssetRecords(watchfaceId) {
  const db = await openDatabase();
  await transact(db, "readwrite", (store) => store.delete(String(watchfaceId)));
}
