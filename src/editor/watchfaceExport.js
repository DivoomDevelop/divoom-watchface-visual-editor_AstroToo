import { sanitizeClockInfoForCfg } from "./templateSync.js";

export const CLOCK_JSON_FILENAME = "clock.json";
const BG_PREFIX = "BG";
const APP_PREVIEW_PREFIX = "APP";
const ITEM_PREFIX = "ITEM";
const SUB_CLOCK_ID_PREFIX = "SubClockId_";

export function isWatchfaceDirectoryExportSupported() {
  return typeof window !== "undefined" && typeof window.showDirectoryPicker === "function";
}

export function resolvePackClockIdFromRecord(rec) {
  const cfg = rec?.config;
  if (!cfg || typeof cfg !== "object") return 0;
  const pack = Number(cfg.TemplateAssetClockId);
  if (Number.isFinite(pack) && pack > 0) return pack;
  const tpl = Number(rec?.templateActiveClockId);
  if (Number.isFinite(tpl) && tpl > 0) return tpl;
  const clock = Number(cfg.ClockId);
  if (Number.isFinite(clock) && clock > 0) return clock;
  return 0;
}

function isHttpUrl(text) {
  return /^https?:\/\//i.test(String(text || "").trim());
}

function isSimpleLeaf(name) {
  const s = String(name || "").trim();
  if (!s || isHttpUrl(s) || s.includes("/") || s.includes("\\")) return false;
  return true;
}

function normalizeBinLeaf(name, fallbackStem = "asset") {
  const raw = String(name || "").trim();
  if (!raw) return `${fallbackStem}.bin`;
  if (/\.bin$/i.test(raw)) return raw.replace(/\.bin$/i, ".bin");
  const stem = raw.replace(/\.[a-z0-9]+$/i, "") || fallbackStem;
  return `${stem}.bin`;
}

function stripPrefix(name, prefix) {
  const re = new RegExp(`^${prefix}`, "i");
  return String(name || "").replace(re, "");
}

/** 底图：BG + 原名（如 164.bin → BG164.bin） */
export function bgPrefixedExportName(rawName) {
  const base = normalizeBinLeaf(stripPrefix(rawName, BG_PREFIX));
  const stem = base.replace(/\.bin$/i, "");
  return `${BG_PREFIX}${stem}.bin`;
}

function normalizePreviewLeaf(name, fallbackStem = "preview") {
  const raw = String(name || "").trim();
  if (!raw) return `${fallbackStem}.jpg`;
  if (/\.(jpg|jpeg|png|webp|gif|bin)$/i.test(raw)) return raw;
  const stem = raw.replace(/\.[a-z0-9]+$/i, "") || fallbackStem;
  return `${stem}.jpg`;
}

/** APP 预览图：APP + 原名（如 preview.jpg → APPpreview.jpg） */
export function appPreviewPrefixedExportName(rawName) {
  const base = normalizePreviewLeaf(stripPrefix(rawName, APP_PREVIEW_PREFIX));
  const dot = base.lastIndexOf(".");
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const ext = dot > 0 ? base.slice(dot) : ".jpg";
  return `${APP_PREVIEW_PREFIX}${stem}${ext}`;
}

/** 元素图：ITEM + 原名（如 19201.bin → ITEM19201.bin） */
export function itemPrefixedExportName(rawName) {
  const base = normalizeBinLeaf(stripPrefix(rawName, ITEM_PREFIX));
  const stem = base.replace(/\.bin$/i, "");
  return `${ITEM_PREFIX}${stem}.bin`;
}

function dataUrlToBytes(dataUrl) {
  const raw = String(dataUrl || "").trim();
  const m = raw.match(/^data:([^;,]+)?(;base64)?,(.*)$/is);
  if (!m) return null;
  const payload = m[3];
  if (m[2]) {
    const bin = atob(payload);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  return new TextEncoder().encode(decodeURIComponent(payload));
}

/** 重名时追加 _1、_2…（前缀保留，如 BG164_1.bin） */
function uniqueFileName(used, preferred) {
  let name = String(preferred || "").trim() || "asset.bin";
  if (!used.has(name)) {
    used.add(name);
    return name;
  }
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : ".bin";
  let i = 1;
  while (used.has(`${stem}_${i}${ext}`)) i += 1;
  name = `${stem}_${i}${ext}`;
  used.add(name);
  return name;
}

/** 扁平导出：仅文件名，不含子目录。 */
export async function writeBytesToDirectory(dirHandle, fileName, bytes) {
  const name = String(fileName || "").replace(/\\/g, "/").replace(/^\/+/, "");
  if (!name || name.includes("..") || name.includes("/")) {
    throw new Error(`invalid export file name: ${fileName}`);
  }
  const fh = await dirHandle.getFileHandle(name, { create: true });
  const w = await fh.createWritable();
  await w.write(bytes);
  await w.close();
}

function clearRemotePreviewFields(clockObj) {
  for (const k of [
    "DevicePreviewImageUrl",
    "DevicePreviewImageUrl2",
    "DevPreviewSmallImgUrl",
    "DevPreviewSmallImgUrl2"
  ]) {
    if (k in clockObj) clockObj[k] = "";
  }
}

function allocBgName(usedNames, rawStemOrLeaf) {
  const fileName = uniqueFileName(usedNames, bgPrefixedExportName(rawStemOrLeaf));
  return fileName;
}

function allocAppPreviewName(usedNames, rawStemOrLeaf) {
  const fileName = uniqueFileName(usedNames, appPreviewPrefixedExportName(rawStemOrLeaf));
  return fileName;
}

function allocItemName(usedNames, rawStemOrLeaf) {
  const fileName = uniqueFileName(usedNames, itemPrefixedExportName(rawStemOrLeaf));
  return fileName;
}

/** 导出时保证 ItemList[].item_id 与 ItemIdList 唯一：SubClockId_1、SubClockId_2… */
export function assignUniqueExportItemIds(clockObj) {
  const itemList = Array.isArray(clockObj?.ItemList) ? clockObj.ItemList : [];
  const ids = [];
  for (let i = 0; i < itemList.length; i += 1) {
    const id = `${SUB_CLOCK_ID_PREFIX}${i + 1}`;
    const item = itemList[i];
    if (item && typeof item === "object") item.item_id = id;
    ids.push(id);
  }
  clockObj.ItemIdList = ids;
  return clockObj;
}

/**
 * @returns {{ clockObj: object, assets: { fileName: string, spec: object }[] }}
 */
export function planFlatWatchfaceExport(rec, deps) {
  const packId = resolvePackClockIdFromRecord(rec);
  const clockObj = sanitizeClockInfoForCfg(JSON.parse(JSON.stringify(rec?.config || {})));
  clearRemotePreviewFields(clockObj);

  const usedNames = new Set([CLOCK_JSON_FILENAME]);
  /** @type {{ fileName: string, spec: object }[]} */
  const assets = [];

  if (rec?.backgroundDataUrl) {
    const rawBase = isSimpleLeaf(rec.backgroundName)
      ? rec.backgroundName
      : packId > 0
        ? `${packId + 1}.bin`
        : "clock_bg.bin";
    const fileName = allocBgName(usedNames, rawBase);
    assets.push({ fileName, spec: { kind: "data-url", dataUrl: rec.backgroundDataUrl } });
    clockObj.DeviceImageUrl = fileName;
  } else if (packId > 0) {
    const fileName = allocBgName(usedNames, `${packId + 1}.bin`);
    assets.push({
      fileName,
      spec: {
        kind: "template-asset",
        relPrefix: "template/15/",
        baseName: String(packId + 1),
        extCandidates: deps.bgExtCandidates
      }
    });
    clockObj.DeviceImageUrl = fileName;
  } else if (isSimpleLeaf(clockObj.DeviceImageUrl)) {
    const leaf = String(clockObj.DeviceImageUrl).trim();
    const fileName = allocBgName(usedNames, leaf);
    assets.push({
      fileName,
      spec: {
        kind: "public-leaf",
        relPaths: [`template/15/${leaf}`, `template/29/${leaf}`, leaf]
      }
    });
    clockObj.DeviceImageUrl = fileName;
  } else {
    clockObj.DeviceImageUrl = "";
  }

  if (rec?.appPreviewDataUrl) {
    const rawBase = isSimpleLeaf(rec.appPreviewName)
      ? rec.appPreviewName
      : packId > 0
        ? `${packId + 1}.jpg`
        : "app_preview.jpg";
    const fileName = allocAppPreviewName(usedNames, rawBase);
    assets.push({ fileName, spec: { kind: "data-url", dataUrl: rec.appPreviewDataUrl } });
    clockObj.AppPreviewImageUrl = fileName;
  } else if (isSimpleLeaf(clockObj.AppPreviewImageUrl)) {
    const leaf = String(clockObj.AppPreviewImageUrl).trim();
    const fileName = allocAppPreviewName(usedNames, leaf);
    const relPaths = [`template/33/${leaf}`, leaf];
    if (packId > 0) {
      assets.push({
        fileName,
        spec: {
          kind: "template-asset",
          relPrefix: "template/33/",
          baseName: String(packId + 1),
          extCandidates: deps.previewExtCandidates
        }
      });
    } else {
      assets.push({
        fileName,
        spec: {
          kind: "public-leaf",
          relPaths
        }
      });
    }
    clockObj.AppPreviewImageUrl = fileName;
  } else {
    clockObj.AppPreviewImageUrl = "";
  }

  const itemList = Array.isArray(clockObj.ItemList) ? clockObj.ItemList : [];
  for (let idx = 0; idx < itemList.length; idx++) {
    const item = itemList[idx];
    if (!deps.isTemplateImageItem(item)) continue;

    const slot = deps.getTemplateSlotByItem(packId, item);
    const addr = String(item?.image_addr || "").trim();
    const itemKey = deps.itemKey ? deps.itemKey(item, idx) : String(idx);

    if (isSimpleLeaf(addr)) {
      const fileName = allocItemName(usedNames, addr);
      assets.push({
        fileName,
        spec: {
          kind: "public-leaf",
          relPaths: [`template/29/${addr}`, `assets/${addr}`, addr],
          itemKey
        }
      });
      item.image_addr = fileName;
      continue;
    }

    if (Number.isFinite(slot) && slot > 0 && !isHttpUrl(addr)) {
      const fileName = allocItemName(usedNames, `${slot}.bin`);
      assets.push({
        fileName,
        spec: {
          kind: "template-asset",
          relPrefix: "template/29/",
          baseName: String(slot),
          extCandidates: deps.imgExtCandidates,
          itemKey
        }
      });
      item.image_addr = fileName;
    } else if (addr && !isHttpUrl(addr)) {
      item.image_addr = "";
    }
  }

  assignUniqueExportItemIds(clockObj);

  return { clockObj, assets, usedNames };
}

async function resolveAssetBytes(spec, deps) {
  if (spec.kind === "data-url") return dataUrlToBytes(spec.dataUrl);
  if (spec.kind === "template-asset") {
    return deps.fetchTemplateAsset(spec.relPrefix, spec.baseName, spec.extCandidates);
  }
  if (spec.kind === "public-leaf") {
    if (typeof deps.fetchLiveItemAsset === "function" && spec.itemKey) {
      const live = await deps.fetchLiveItemAsset(spec.itemKey);
      if (live?.length) return live;
    }
    for (const rel of spec.relPaths || []) {
      const bytes = await deps.fetchPublicFile(rel);
      if (bytes?.length) return bytes;
    }
  }
  return null;
}

/**
 * 扁平导出：clock.json + 同目录资源；底图 BG*.bin，元素 ITEM*.bin；不导出字体。
 */
export async function exportWatchfaceToDirectory(rec, dirHandle, deps) {
  const { clockObj, assets } = planFlatWatchfaceExport(rec, deps);
  const written = [];
  const missing = [];

  for (const asset of assets) {
    try {
      const bytes = await resolveAssetBytes(asset.spec, deps);
      if (!bytes?.length) {
        missing.push(asset.fileName);
        continue;
      }
      await writeBytesToDirectory(dirHandle, asset.fileName, bytes);
      written.push(asset.fileName);
    } catch {
      missing.push(asset.fileName);
    }
  }

  await writeBytesToDirectory(
    dirHandle,
    CLOCK_JSON_FILENAME,
    new TextEncoder().encode(JSON.stringify(clockObj, null, "\t"))
  );
  written.unshift(CLOCK_JSON_FILENAME);

  return { written, missing, clockObj };
}
