/**
 * Validate Astro Echo example watchface JSON and bundled assets.
 * Usage: node scripts/validate-astro-echo-watchface.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildFontLookup, resolveItemFontFields } from "../src/editor/fontResolve.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cfgPath = path.join(root, "docs/examples/astro-echo-watchface.json");
const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));

const fontInfoPath = path.join(root, "public/font/font_info.cfg");
const fontInfo = JSON.parse(fs.readFileSync(fontInfoPath, "utf8"));
const fontLookup = buildFontLookup(fontInfo.FontList || []);

const errors = [];
const allowedFontIds = new Set((fontInfo.FontList || []).map((f) => Number(f.id)).filter((n) => n > 0));

if (!Array.isArray(cfg.ItemList) || cfg.ItemList.length === 0) {
  errors.push("ItemList is empty");
}

const expectedDisps = {
  wave_decor: 48,
  weather_icon: 55,
  date_row: 193,
  week_row: 37,
  temp_value: 254,
  seconds_row: 1,
  time_row: 4
};

for (const item of cfg.ItemList || []) {
  const id = item.item_id;
  if (expectedDisps[id] !== undefined && item.disp !== expectedDisps[id]) {
    errors.push(`${id}: expected disp ${expectedDisps[id]}, got ${item.disp}`);
  }
  const fontId = resolveItemFontFields(item, fontLookup) || Number(item.font);
  if (!allowedFontIds.has(fontId)) {
    errors.push(`${id}: font ${item.font} (resolved ${fontId}) not in allowedFontIds`);
  }
  if (fontId === 2 && item.disp !== 48 && item.disp !== 55) {
    const h = Number(item.h);
    const size = Number(item.size);
    if (Number.isFinite(size) && size > h) {
      errors.push(`${id}: TTF size ${size} exceeds h ${h}`);
    }
  }
  for (const key of ["x", "y", "w", "h"]) {
    const v = Number(item[key]);
    if (!Number.isFinite(v) || v < 0 || v > 480) {
      errors.push(`${id}: ${key}=${item[key]} out of 480 canvas`);
    }
  }
  if (item.x + item.w > 480 || item.y + item.h > 480) {
    errors.push(`${id}: layout spills beyond 480x480`);
  }
}

const assetLeaves = new Set(["astro_echo_bg.png"]);
for (const item of cfg.ItemList || []) {
  const addr = String(item.image_addr || "").trim();
  if (addr) assetLeaves.add(addr);
}
if (cfg.DeviceImageUrl) assetLeaves.add(String(cfg.DeviceImageUrl).trim());

const missing = [];
for (const leaf of assetLeaves) {
  const candidates = [
    path.join(root, "public", leaf),
    path.join(root, "public/examples/astro-echo/assets", leaf.replace(/^astro_echo_/, "").replace("_", "_") ),
    path.join(root, "docs/examples/astro-echo/assets", leaf.replace("astro_echo_bg", "clock_bg").replace("astro_echo_weather", "weather_icon").replace("astro_echo_wave", "wave_decor"))
  ];
  const map = {
    "astro_echo_bg.png": "clock_bg.png",
    "astro_echo_weather.png": "weather_icon.png",
    "astro_echo_wave.png": "wave_decor.png"
  };
  const docName = map[leaf] || leaf;
  candidates.push(path.join(root, "docs/examples/astro-echo/assets", docName));
  if (!candidates.some((p) => fs.existsSync(p))) {
    missing.push(leaf);
  }
}

if (missing.length) errors.push(`Missing assets: ${missing.join(", ")}`);
if (cfg.ItemIdList?.length !== cfg.ItemList?.length) {
  errors.push("ItemIdList length mismatch with ItemList");
}

console.log(`Config: ${cfgPath}`);
console.log(`Items: ${cfg.ItemList.length}, Name: ${cfg.NameCn}`);
console.log(`Assets checked: ${[...assetLeaves].join(", ")}`);

if (errors.length) {
  console.error("Validation FAILED:");
  for (const e of errors) console.error(`  - ${e}`);
  process.exitCode = 1;
} else {
  console.log("Validation OK");
}
