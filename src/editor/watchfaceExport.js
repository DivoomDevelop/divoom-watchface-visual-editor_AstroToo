import { sanitizeClockInfoForCfg } from "./templateSync.js";

export const CLOCK_JSON_FILENAME = "clock.json";
const BG_PREFIX = "BG";
const APP_PREVIEW_PREFIX = "APP";
const ITEM_PREFIX = "ITEM";

const KNOWN_IMAGE_EXTS = /\.(png|jpe?g|webp|gif|bmp)$/i;

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

function basename(path) {
  const s = String(path || "").replace(/\\/g, "/");
  const i = s.lastIndexOf("/");
  return i >= 0 ? s.slice(i + 1) : s;
}

function stripPrefix(name, prefix) {
  const re = new RegExp(`^${prefix}`, "i");
  return String(name || "").replace(re, "");
}

function extFromFileName(name) {
  const m = String(name || "").match(/(\.[a-zA-Z0-9]+)$/);
  return m ? m[1] : "";
}

function extFromDataUrl(dataUrl) {
  const raw = String(dataUrl || "").trim();
  const m = raw.match(/^data:([^;,]+)/i);
  if (!m) return "";
  const mime = m[1].toLowerCase();
  if (mime === "image/jpeg" || mime === "image/jpg") return ".jpg";
  if (mime === "image/png") return ".png";
  if (mime === "image/webp") return ".webp";
  if (mime === "image/gif") return ".gif";
  if (mime === "image/bmp") return ".bmp";
  return "";
}

function readAscii(bytes, offset, len) {
  let out = "";
  for (let i = 0; i < len; i += 1) out += String.fromCharCode(bytes[offset + i] || 0);
  return out;
}

/** 按文件头识别图片后缀（导出命名用，避免一律 .bin）。 */
export function extFromImageBytes(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf || []);
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return ".jpg";
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return ".png";
  }
  const sig6 = bytes.length >= 6 ? readAscii(bytes, 0, 6) : "";
  if (sig6 === "GIF87a" || sig6 === "GIF89a") return ".gif";
  if (bytes.length >= 12 && readAscii(bytes, 0, 4) === "RIFF" && readAscii(bytes, 8, 4) === "WEBP") return ".webp";
  if (bytes.length >= 2 && bytes[0] === 0x42 && bytes[1] === 0x4d) return ".bmp";
  return "";
}

function normalizeImageLeaf(name, fallbackStem = "asset", fallbackExt = ".jpg") {
  const raw = String(name || "").trim();
  if (!raw) return `${fallbackStem}${fallbackExt}`;
  if (KNOWN_IMAGE_EXTS.test(raw)) return raw;
  if (/\.bin$/i.test(raw)) {
    const stem = raw.replace(/\.bin$/i, "") || fallbackStem;
    return `${stem}${fallbackExt}`;
  }
  const stem = raw.replace(/\.[a-z0-9]+$/i, "") || fallbackStem;
  return `${stem}${fallbackExt}`;
}

function prefixedExportName(prefix, rawName, fallbackStem, fallbackExt) {
  const base = normalizeImageLeaf(stripPrefix(rawName, prefix), fallbackStem, fallbackExt);
  const dot = base.lastIndexOf(".");
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const ext = dot > 0 ? base.slice(dot) : fallbackExt;
  return `${prefix}${stem}${ext}`;
}

/** 底图：BG + 原名（如 164.webp → BG164.webp） */
export function bgPrefixedExportName(rawName) {
  return prefixedExportName(BG_PREFIX, rawName, "clock_bg", ".jpg");
}

/** APP 预览图：APP + 原名（如 preview.jpg → APPpreview.jpg） */
export function appPreviewPrefixedExportName(rawName) {
  return prefixedExportName(APP_PREVIEW_PREFIX, rawName, "preview", ".jpg");
}

/** 元素图：ITEM + 原名（如 19201.webp → ITEM19201.webp） */
export function itemPrefixedExportName(rawName) {
  return prefixedExportName(ITEM_PREFIX, rawName, "asset", ".jpg");
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

/** 重名时追加 _1、_2…（前缀保留，如 BG164_1.webp） */
function uniqueFileName(used, preferred) {
  let name = String(preferred || "").trim() || "asset.jpg";
  if (!used.has(name)) {
    used.add(name);
    return name;
  }
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : ".jpg";
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

function reconcileExportFileName(plannedName, preferredExt) {
  const ext = String(preferredExt || "").trim();
  if (!ext) return plannedName;
  const normalized = ext.startsWith(".") ? ext : `.${ext}`;
  const dot = plannedName.lastIndexOf(".");
  const stem = dot > 0 ? plannedName.slice(0, dot) : plannedName;
  const currentExt = dot > 0 ? plannedName.slice(dot) : "";
  if (currentExt.toLowerCase() === normalized.toLowerCase()) return plannedName;
  if (/\.bin$/i.test(currentExt) || !KNOWN_IMAGE_EXTS.test(plannedName)) {
    return `${stem}${normalized}`;
  }
  return plannedName;
}

function remapClockObjAssetRefs(clockObj, nameMap) {
  if (!nameMap?.size) return;
  if (clockObj.DeviceImageUrl && nameMap.has(clockObj.DeviceImageUrl)) {
    clockObj.DeviceImageUrl = nameMap.get(clockObj.DeviceImageUrl);
  }
  if (clockObj.AppImageUrl && nameMap.has(clockObj.AppImageUrl)) {
    clockObj.AppImageUrl = nameMap.get(clockObj.AppImageUrl);
  }
  for (const item of clockObj.ItemList || []) {
    const addr = String(item?.image_addr || "").trim();
    if (addr && nameMap.has(addr)) item.image_addr = nameMap.get(addr);
  }
}

/** 导出时保持默认 item_id 为空，与编辑面板默认值一致。 */
export function clearExportItemIds(clockObj) {
  const itemList = Array.isArray(clockObj?.ItemList) ? clockObj.ItemList : [];
  const ids = [];
  for (let i = 0; i < itemList.length; i += 1) {
    const item = itemList[i];
    if (item && typeof item === "object") item.item_id = "";
    ids.push("");
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
        ? `${packId + 1}.jpg`
        : "clock_bg.jpg";
    const fileName = allocBgName(usedNames, rawBase);
    assets.push({ fileName, spec: { kind: "data-url", dataUrl: rec.backgroundDataUrl } });
    clockObj.DeviceImageUrl = fileName;
  } else if (packId > 0) {
    const fileName = allocBgName(usedNames, `${packId + 1}.jpg`);
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
    clockObj.AppImageUrl = fileName;
  } else if (isSimpleLeaf(clockObj.AppImageUrl)) {
    const leaf = String(clockObj.AppImageUrl).trim();
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
    clockObj.AppImageUrl = fileName;
  } else {
    clockObj.AppImageUrl = "";
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
      const fileName = allocItemName(usedNames, `${slot}.jpg`);
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

  clearExportItemIds(clockObj);

  return { clockObj, assets, usedNames };
}

function normalizeResolvedFetch(result) {
  if (!result) return null;
  if (result instanceof Uint8Array) {
    return { bytes: result, sourceLeaf: "" };
  }
  const bytes = result.bytes;
  if (!(bytes instanceof Uint8Array) || !bytes.length) return null;
  return { bytes, sourceLeaf: String(result.sourceLeaf || "") };
}

function pickExportExt({ sourceLeaf, dataUrl, bytes }) {
  const fromLeaf = extFromFileName(sourceLeaf);
  if (fromLeaf && KNOWN_IMAGE_EXTS.test(`x${fromLeaf}`)) return fromLeaf;
  const fromDataUrl = extFromDataUrl(dataUrl);
  if (fromDataUrl) return fromDataUrl;
  return extFromImageBytes(bytes) || "";
}

async function resolveAssetBytes(spec, deps) {
  if (spec.kind === "data-url") {
    const bytes = dataUrlToBytes(spec.dataUrl);
    if (!bytes?.length) return null;
    return {
      bytes,
      ext: pickExportExt({ dataUrl: spec.dataUrl, bytes })
    };
  }
  if (spec.kind === "template-asset") {
    const got = normalizeResolvedFetch(
      await deps.fetchTemplateAsset(spec.relPrefix, spec.baseName, spec.extCandidates)
    );
    if (!got) return null;
    return {
      bytes: got.bytes,
      ext: pickExportExt({ sourceLeaf: got.sourceLeaf, bytes: got.bytes })
    };
  }
  if (spec.kind === "public-leaf") {
    if (typeof deps.fetchLiveItemAsset === "function" && spec.itemKey) {
      const live = normalizeResolvedFetch(await deps.fetchLiveItemAsset(spec.itemKey));
      if (live) {
        return {
          bytes: live.bytes,
          ext: pickExportExt({ sourceLeaf: live.sourceLeaf, bytes: live.bytes })
        };
      }
    }
    for (const rel of spec.relPaths || []) {
      const got = normalizeResolvedFetch(await deps.fetchPublicFile(rel));
      if (got) {
        return {
          bytes: got.bytes,
          ext: pickExportExt({ sourceLeaf: got.sourceLeaf || basename(rel), bytes: got.bytes })
        };
      }
    }
  }
  return null;
}

/**
 * 扁平导出：clock.json + 同目录资源；底图 BG*、元素 ITEM*（后缀与图片格式一致）；不导出字体。
 */
export async function exportWatchfaceToDirectory(rec, dirHandle, deps) {
  const { clockObj, assets } = planFlatWatchfaceExport(rec, deps);
  const written = [];
  const missing = [];
  const nameMap = new Map();

  for (const asset of assets) {
    try {
      const resolved = await resolveAssetBytes(asset.spec, deps);
      if (!resolved?.bytes?.length) {
        missing.push(asset.fileName);
        continue;
      }
      let outName = asset.fileName;
      if (resolved.ext) {
        const reconciled = reconcileExportFileName(asset.fileName, resolved.ext);
        if (reconciled !== asset.fileName) nameMap.set(asset.fileName, reconciled);
        outName = reconciled;
      }
      await writeBytesToDirectory(dirHandle, outName, resolved.bytes);
      written.push(outName);
    } catch {
      missing.push(asset.fileName);
    }
  }

  remapClockObjAssetRefs(clockObj, nameMap);

  await writeBytesToDirectory(
    dirHandle,
    CLOCK_JSON_FILENAME,
    new TextEncoder().encode(JSON.stringify(clockObj, null, "\t"))
  );
  written.unshift(CLOCK_JSON_FILENAME);

  return { written, missing, clockObj };
}
