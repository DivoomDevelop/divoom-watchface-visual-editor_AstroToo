export const STORAGE_KEY = "divoom_local_watchfaces_v1";
export const LAST_ACTIVE_ID_KEY = "divoom_last_active_watchface_id";
/** Stable id for the bundled 「立体方块2」preset seeded on first launch (empty library). */
export const BUNDLED_STARTER_WATCHFACE_ID = "wf-bundled-starter-v1";

const DB_NAME = "divoom-watchface-local-library-v1";
const STORE_NAME = "watchfaces";
let database;
let initialization;
let cachedRows;
let writeQueue = Promise.resolve();

function readLegacyWatchfaces() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function sortRows(rows) {
  return rows.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

function openDatabase() {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("IndexedDB unavailable"));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB open failed"));
  });
}

function transact(mode, action) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
    let result;
    action(store, (value) => { result = value; });
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => reject(transaction.error || new Error("IndexedDB transaction failed"));
    transaction.onabort = () => reject(transaction.error || new Error("IndexedDB transaction aborted"));
  });
}

export function initializeWatchfacesStore() {
  if (initialization) return initialization;
  initialization = (async () => {
    const legacyRows = readLegacyWatchfaces();
    try {
      database = await openDatabase();
    } catch {
      // Keep the old storage path available when IndexedDB is blocked.
      cachedRows = sortRows(legacyRows);
      return;
    }
    const storedRows = await transact("readonly", (store, setResult) => {
      const request = store.getAll();
      request.onsuccess = () => setResult(request.result);
    });
    const merged = new Map(storedRows.map((row) => [row.id, row]));
    const toMigrate = legacyRows.filter((row) => {
      if (!row?.id) return false;
      const stored = merged.get(row.id);
      if (stored && (stored.updatedAt || 0) >= (row.updatedAt || 0)) return false;
      merged.set(row.id, row);
      return true;
    });
    if (toMigrate.length) {
      await transact("readwrite", (store) => {
        for (const row of toMigrate) store.put(row);
      });
    }
    cachedRows = sortRows([...merged.values()]);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Migration is already committed; a stale legacy copy is harmless.
    }
  })();
  return initialization;
}

export function listWatchfaces() {
  return cachedRows ? [...cachedRows] : sortRows(readLegacyWatchfaces());
}

function queueWrite(action) {
  const result = writeQueue.then(action);
  writeQueue = result.catch(() => {});
  return result;
}

export function upsert(record) {
  return queueWrite(async () => {
    await initializeWatchfacesStore();
    const next = { ...record, updatedAt: record.updatedAt || Date.now() };
    const arr = listWatchfaces();
    const i = arr.findIndex((x) => x.id === next.id);
    if (i >= 0) arr[i] = next;
    else arr.push(next);
    sortRows(arr);
    if (database) await transact("readwrite", (store) => { store.put(next); });
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
    cachedRows = arr;
  });
}

export function removeWatchface(id) {
  return queueWrite(async () => {
    await initializeWatchfacesStore();
    const arr = listWatchfaces().filter((x) => x.id !== id);
    if (database) await transact("readwrite", (store) => { store.delete(id); });
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
    cachedRows = arr;
  });
}

export function getWatchface(id) {
  return listWatchfaces().find((x) => x.id === id) || null;
}

export function setLastActiveId(id) {
  try {
    if (id) localStorage.setItem(LAST_ACTIVE_ID_KEY, String(id));
    else localStorage.removeItem(LAST_ACTIVE_ID_KEY);
  } catch {
    /* ignore */
  }
}

export function getLastActiveId() {
  try {
    return localStorage.getItem(LAST_ACTIVE_ID_KEY) || "";
  } catch {
    return "";
  }
}

export function newWatchfaceId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `wf_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}
