/** Maintainer-only snapshot: node scripts/bundle-demo-templates.mjs [--check]. */
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { buildDivoomLanEnvelope } from "../src/editor/divoomLanJson.js";
import { sanitizeClockInfoForCfg } from "../src/editor/templateSync.js";
import { extFromAssetPath, extFromImageBytes, resolveCdnUrl } from "../src/editor/cdnAssets.js";
import { localFontFileRelPath, normalizeFontListEntry } from "../src/editor/fontSync.js";
import { normalizeBundledFont } from "./bundled-font-bytes.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../public");
const catalogPath = "template/demo-catalog.json";
const deviceId = Number(process.env.DIVOOM_DEVICE_ID || 300396998);
const api = process.env.DIVOOM_CHINA_API_TARGET || "https://appchina.divoom-gz.com";
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const read = async (rel) => fs.readFile(path.join(root, rel)).catch((e) => {
  if (e.code === "ENOENT") return null;
  throw e;
});

// Read immediately before every write; never replace differing workspace resources.
async function writeNew(rel, bytes) {
  bytes = Buffer.from(bytes);
  const current = await read(rel);
  if (current) {
    if (!current.equals(bytes)) throw new Error(`Preserving existing file with different contents: ${rel}`);
    return;
  }
  await fs.mkdir(path.dirname(path.join(root, rel)), { recursive: true });
  await fs.writeFile(path.join(root, rel), bytes, { flag: "wx" });
}

async function request(url, options) {
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetch(url, { ...options, signal: AbortSignal.timeout(60000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      if (attempt >= 2) throw error;
    }
  }
}

async function store(command, payload = {}) {
  const bytes = await request(`${api.replace(/\/$/, "")}/${command}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildDivoomLanEnvelope(command, payload, () => deviceId))
  });
  const data = JSON.parse(bytes);
  if (Number(data.ReturnCode) !== 0) throw new Error(`${command}: ${data.ReturnMessage}`);
  return data;
}

function collectResources(value, assets = new Set(), fonts = new Set()) {
  if (Array.isArray(value)) {
    for (const row of value) collectResources(row, assets, fonts);
  } else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (key === "font" && Number(child) > 0) fonts.add(Number(child));
      if (typeof child === "string" && /^(?:\/?group\d+\/|https?:\/\/)/i.test(child)) assets.add(child);
      else if (key === "Config" && typeof child === "string") {
        for (const address of new URLSearchParams(child).values()) {
          if (/^(?:\/?group\d+\/|https?:\/\/)/i.test(address)) assets.add(address);
        }
      }
      else collectResources(child, assets, fonts);
    }
  }
  return { assets, fonts };
}

async function check() {
  const catalog = JSON.parse(await read(catalogPath));
  if (!catalog.ClockList?.length) throw new Error("Empty bundled template catalog");
  for (const [rel, digest] of Object.entries(catalog.files)) {
    const bytes = await read(rel);
    if (!bytes?.length || hash(bytes) !== digest) throw new Error(`Missing or changed bundled resource: ${rel}`);
  }
  const fontInfo = JSON.parse(await read("font/font_info.cfg"));
  for (const row of catalog.ClockList) {
    const cfg = JSON.parse(await read(row.config));
    const { assets, fonts } = collectResources(cfg);
    for (const addr of assets) {
      if (row.unavailableAssets?.includes(addr)) {
        if (addr !== cfg.DeviceImageUrl || !cfg.ItemList.some((item) => Number(item.x) === 0 &&
            Number(item.y) === 0 && Number(item.w) === 480 && Number(item.h) === 480 && row.assets[item.image_addr])) {
          throw new Error(`Unavailable resource has no full-size replacement layer: ${addr}`);
        }
        continue;
      }
      if (!row.assets[addr] || !catalog.files[row.assets[addr]]) throw new Error(`Unbundled resource: ${addr}`);
    }
    for (const id of fonts) {
      if (catalog.fallbackFontIds.includes(id)) continue;
      if (!fontInfo.FontList.some((font) => Number(font.id) === id) ||
          !catalog.files[catalog.fontOverrides?.[id] || localFontFileRelPath(id)]) throw new Error(`Unbundled font: ${id}`);
    }
  }
  console.log(`Verified ${catalog.ClockList.length} templates and ${Object.keys(catalog.files).length} bundled files.`);
}

async function bundle() {
  const list = await store("Device/GetDemoClockList");
  const ids = [...new Set((list.ClockList || []).map((row) => Number(row.ClockId)).filter((id) => id > 0))];
  if (!ids.length) throw new Error(`GetDemoClockList returned no templates for DeviceId ${deviceId}`);
  const catalog = { source: "Device/GetDemoClockList", deviceId, ClockList: [], files: {}, fallbackFontIds: [] };
  const fontIds = new Set();
  async function save(rel, bytes) {
    await writeNew(rel, bytes);
    catalog.files[rel] = hash(bytes);
  }
  for (const id of ids) {
    const raw = await store("Device/GetClockInfoV3", { ClockId: id, ParentItemId: 0, ParentClockId: 0 });
    if (!raw.ItemList?.length) throw new Error(`Template ${id} has no configuration`);
    const cfg = sanitizeClockInfoForCfg(raw);
    const row = { ClockId: id, config: `template/demo/${id}.cfg`, assets: {} };
    const { assets, fonts } = collectResources(cfg);
    for (const font of fonts) fontIds.add(font);
    for (const addr of assets) {
      const bytes = await request(resolveCdnUrl(addr));
      if (!bytes.length) throw new Error(`Empty resource: ${addr}`);
      if (/^\s*</.test(bytes.subarray(0, 100).toString())) {
        const fullSizeLayer = cfg.ItemList.some((item) => Number(item.x) === 0 && Number(item.y) === 0 &&
          Number(item.w) === 480 && Number(item.h) === 480 && item.image_addr && item.image_addr !== addr);
        if (addr !== cfg.DeviceImageUrl || !fullSizeLayer) throw new Error(`Server returned HTML for resource: ${addr}`);
        row.unavailableAssets = [...(row.unavailableAssets || []), addr];
        console.warn(`Template ${id}: server background is HTML; use the existing full-size image layer.`);
        continue;
      }
      const ext = extFromImageBytes(bytes) ||
        (bytes.toString("ascii", 4, 8) === "ftyp" ? ".mp4" : extFromAssetPath(addr));
      const rel = `template/demo/assets/${hash(bytes)}${ext}`;
      await save(rel, bytes);
      row.assets[addr] = rel;
    }
    await save(row.config, Buffer.from(JSON.stringify(cfg, null, 2) + "\n"));
    catalog.ClockList.push(row);
    console.log(`Bundled ${id}: ${cfg.NameEn || cfg.NameCn}, ${assets.size} resources`);
  }
  const originalInfo = await read("font/font_info.cfg");
  const fontInfo = JSON.parse(originalInfo);
  const missingMeta = [...fontIds].filter((id) => !fontInfo.FontList.some((row) => Number(row.id) === id));
  if (missingMeta.length) {
    const data = await store("Device/GetSomeFontInfoV2", { FontIds: missingMeta.map((id) => ({ id })) });
    const unavailable = new Set(Object.values(data.FontNotList || {}).map(Number));
    catalog.fallbackFontIds = missingMeta.filter((id) => unavailable.has(id));
    for (const raw of data.FontList || []) {
      const font = normalizeFontListEntry(raw);
      if (font && missingMeta.includes(font.id)) fontInfo.FontList.push(font);
    }
  }
  for (const id of fontIds) {
    if (catalog.fallbackFontIds.includes(id)) {
      console.warn(`Font ${id} is unavailable on the server; retain the editor's system font fallback.`);
      continue;
    }
    const font = fontInfo.FontList.find((row) => Number(row.id) === id);
    if (!font?.url) throw new Error(`No font metadata: ${id}`);
    const rel = localFontFileRelPath(id);
    const bytes = await read(rel) || await request(resolveCdnUrl(font.url));
    await save(rel, bytes);
    const normalized = Number(font.type) === 1 ? normalizeBundledFont(bytes) : bytes;
    if (!normalized.equals(bytes)) {
      const override = `template/demo/fonts/${id + 1}.bin`;
      await save(override, normalized);
      catalog.fontOverrides = { ...catalog.fontOverrides, [id]: override };
    }
  }
  if (fontInfo.FontList.length !== JSON.parse(originalInfo).FontList.length) {
    const current = await read("font/font_info.cfg");
    if (!current.equals(originalInfo)) throw new Error("Font catalog changed during download; retry to preserve external edits");
    await fs.writeFile(path.join(root, "font/font_info.cfg"), JSON.stringify(fontInfo, null, 4) + "\n");
  }
  await writeNew(catalogPath, JSON.stringify(catalog, null, 2) + "\n");
  await check();
}

(process.argv.includes("--check") ? check() : bundle()).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
