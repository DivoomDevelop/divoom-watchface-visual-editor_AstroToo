#!/usr/bin/env node
/**
 * Verify GetDispItemList → normalize → cfg → picker groups loses zero API items.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildDivoomLanEnvelope } from "../src/editor/divoomLanJson.js";
import {
  GET_DISP_ITEM_LIST_PAYLOAD,
  fetchDispItemList,
  normalizeDispCatalogPayload,
  remoteDispCatalogToCfg,
  summarizeDispCatalogSync
} from "../src/editor/dispCloudSync.js";
import { DispCatalogStore } from "../src/editor/dispCatalogStore.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const CFG_PATH = path.join(ROOT, "public/disp/disp_info.cfg");

function countRawItems(data) {
  let n = 0;
  for (const cls of data?.ClassifyList || []) {
    n += (cls.DispItemList || []).length;
  }
  return n;
}

function countClassifyItems(classifyList, classifyId) {
  const cls = classifyList.find((row) => row.id === classifyId);
  return cls?.dispItemList?.length ?? 0;
}

function collectPickerCounts(store) {
  const catalogIds = new Set();
  let categoryItems = 0;
  for (const cls of store.classifyList) {
    const rows = cls.dispItemList || [];
    categoryItems += rows.length;
    for (const row of rows) catalogIds.add(row.id);
  }
  return { categoryItems, catalogIds: catalogIds.size, categories: store.classifyList.length };
}

async function fetchRawApi() {
  const envelope = buildDivoomLanEnvelope("Device/GetDispItemList", GET_DISP_ITEM_LIST_PAYLOAD, () => 300396998);
  const res = await fetch("http://appchina.divoom-gz.com:9506/Device/GetDispItemList", {
    method: "POST",
    headers: { "Content-Type": "application/json;charset=UTF-8" },
    body: JSON.stringify(envelope)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function main() {
  const localRaw = JSON.parse(fs.readFileSync(CFG_PATH, "utf8"));
  const localNorm = normalizeDispCatalogPayload(localRaw);
  console.log("local cfg items:", localNorm.DispList.length, "杂项:", countClassifyItems(localNorm.ClassifyList, 28));

  const rawApi = await fetchRawApi();
  const rawCount = countRawItems(rawApi);
  const storeJson = async (_cmd, _payload) => rawApi;
  const remote = await fetchDispItemList(storeJson);
  const stats = summarizeDispCatalogSync(localRaw, remote);
  const cfgShape = remoteDispCatalogToCfg(remote);
  const roundTrip = normalizeDispCatalogPayload(cfgShape);

  const store = new DispCatalogStore(() => "zh-CN");
  store.applyRemoteCatalog(remote);
  const picker = collectPickerCounts(store);

  console.log("API raw items:", rawCount);
  console.log("normalized remote:", remote.DispList.length, "杂项:", countClassifyItems(remote.ClassifyList, 28));
  console.log("cfg round-trip:", roundTrip.DispList.length);
  console.log("picker category items:", picker.categoryItems, "unique:", picker.catalogIds);
  console.log("sync stats:", stats);

  const ok =
    rawCount === remote.DispList.length &&
    remote.DispList.length === roundTrip.DispList.length &&
    picker.categoryItems === remote.DispList.length;
  if (!ok) {
    console.error("FAIL: item count mismatch in pipeline");
    process.exit(1);
  }
  console.log("OK: zero client-side item loss");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
