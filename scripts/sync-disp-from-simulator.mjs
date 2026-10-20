#!/usr/bin/env node
/**
 * Sync DISP_NAME_MAP, DISP_COMMENT_ZH_MAP, TEMPLATE_DISP_OFFSET_TABLE, IMAGE_DISP_IDS
 * from AstroToo firmware sources into src/editor/app.js.
 * The historical filename and explicit simulator-source argument remain supported.
 *
 * Usage:
 *   npm run sync:disp -- [path-to-firmware-src] [--check]
 *
 * Source: DIVOOM_FIRMWARE_SRC or the local AstroToo firmware checkout.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DEFAULT_FIRMWARE_SRC =
  "Z:/allwinner/AstroToo/lichee/rtos/projects/f101s3/astrotoo/src";
const appJsPath = path.join(ROOT, "src/editor/app.js");

export function parseDispEnum(header) {
  const entries = new Map();
  const re =
    /DIVOOM_CLOCK_DISP_SUPPORT_([A-Z0-9_]+)\s*=\s*(\d+)\s*,\s*(?:\/\/(.*))?/g;
  let m;
  while ((m = re.exec(header))) {
    const id = Number(m[2]);
    if (!Number.isFinite(id)) continue;
    entries.set(id, {
      id,
      suffix: m[1],
      comment: String(m[3] || "").trim()
    });
  }
  return entries;
}

export function parseOffsetTable(manageSrc, entriesBySuffix, header) {
  // Firmware uses the first column's enum value, not the row's position.
  // Rows can be reordered, omit slots, or share one slot (461 and 523).
  const enumBlock = [...header.matchAll(/enum\s*\{([\s\S]*?)\};/g)]
    .find((match) => /\bDIVOOM_DISP_CLOCK_IMAGE_OFFSET_/.test(match[1]));
  if (!enumBlock) throw new Error("Image offset enum not found");
  const offsets = new Map();
  let nextOffset = 0;
  const enumBody = enumBlock[1].replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\r\n]*/g, "");
  for (const raw of enumBody.split(",")) {
    if (!raw.trim()) continue;
    const entry = raw.trim().match(/^(DIVOOM_DISP_CLOCK_IMAGE_OFFSET_[A-Z0-9_]+)(?:\s*=\s*(0x[\da-f]+|\d+))?$/i);
    if (!entry) throw new Error(`Unsupported image offset enum: ${raw.trim()}`);
    const value = entry[2] == null ? nextOffset : Number(entry[2]);
    offsets.set(entry[1], value);
    nextOffset = value + 1;
  }
  const table = new Map();
  const blockMatch = manageSrc.match(
    /const int gdivoom_disp_image_item_table\[\]\[2\]\s*=\s*\{([\s\S]*?)\};/
  );
  if (!blockMatch) throw new Error("gdivoom_disp_image_item_table not found");
  const rows = blockMatch[1].replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\r\n]*/g, "").match(/\{[^}]+\}/g) || [];
  for (const row of rows) {
    const cols = row.match(/^\{\s*(DIVOOM_DISP_CLOCK_IMAGE_OFFSET_[A-Z0-9_]+)\s*,\s*(DIVOOM_CLOCK_DISP_SUPPORT_[A-Z0-9_]+|0)\s*\}$/);
    if (!cols) throw new Error(`Unsupported image mapping: ${row}`);
    if (cols[2] === "0") continue; // Background is not a selectable element.
    const entry = entriesBySuffix.get(cols[2].replace("DIVOOM_CLOCK_DISP_SUPPORT_", ""));
    const offset = offsets.get(cols[1]);
    if (!entry || offset == null) throw new Error(`Unresolved image mapping: ${row}`);
    table.set(entry.id, offset);
  }
  return table;
}

function readExistingMap(appSrc, constName) {
  const needle = `const ${constName} = Object.freeze({`;
  const start = appSrc.indexOf(needle);
  if (start < 0) return new Map();
  const slice = appSrc.slice(start);
  const openIdx = slice.indexOf("{");
  let depth = 0;
  for (let i = openIdx; i < slice.length; i++) {
    const c = slice[i];
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) {
        const body = slice.slice(openIdx + 1, i);
        const map = new Map();
        const re = /^\s*(\d+)\s*:\s*"((?:\\.|[^"\\])*)"/gm;
        let m;
        while ((m = re.exec(body))) map.set(Number(m[1]), JSON.parse(`"${m[2]}"`));
        return map;
      }
    }
  }
  return new Map();
}

function readExistingSet(appSrc, constName) {
  const re = new RegExp(`const ${constName} = new Set\\(\\[([\\s\\S]*?)\\]\\);`);
  const m = appSrc.match(re);
  if (!m) return new Set();
  return new Set([...m[1].matchAll(/(\d+)/g)].map((x) => Number(x[1])));
}

function readExistingRules(appSrc) {
  const m = appSrc.match(/const LOCAL_ASSET_DISP_RULES = new Map\(\[([\s\S]*?)\]\);/);
  const map = new Map();
  if (!m) return map;
  const re = /\[(\d+),\s*\{([^}]+)\}\]/g;
  let row;
  while ((row = re.exec(m[1]))) {
    const id = Number(row[1]);
    const mode = /mode:\s*"([^"]+)"/.exec(row[2])?.[1] || "any";
    const valueMatch = /value:\s*(\d+)/.exec(row[2]);
    map.set(id, valueMatch ? { mode, value: Number(valueMatch[1]) } : { mode });
  }
  return map;
}

function toDispName(suffix) {
  return suffix
    .replace(/^DIVOOM_/, "")
    .replace(/PICTRUE/g, "PICTURE")
    .replace(/TOMMOROW/g, "TOMMOROW")
    .replace(/ROTAETE/g, "ROTATE");
}

function formatObjectMap(map, indent = "    ") {
  const lines = [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([id, val]) => `${indent}${id}: "${val.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`);
  return lines.join(",\n");
}

function formatCommentMap(map, indent = "    ") {
  const lines = [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([id, val]) => {
      const escaped = val.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      return `${indent}${id}: "${escaped}"`;
    });
  return lines.join(",\n");
}

function formatOffsetMap(map, indent = "    ") {
  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([id, off]) => `${indent}${id}: ${off}`)
    .join(",\n");
}

function formatSet(ids) {
  const sorted = [...ids].sort((a, b) => a - b);
  const lines = [];
  let row = "    ";
  for (let i = 0; i < sorted.length; i++) {
    const chunk = String(sorted[i]) + (i < sorted.length - 1 ? ", " : "");
    if (row.length + chunk.length > 108) {
      lines.push(row.trimEnd());
      row = "    ";
    }
    row += chunk;
  }
  if (row.trim()) lines.push(row.trimEnd());
  return lines.join("\n");
}

function formatRulesMap(map) {
  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([id, rule]) => {
      if (rule.value != null) return `    [${id}, { mode: "${rule.mode}", value: ${rule.value} }]`;
      return `    [${id}, { mode: "${rule.mode}" }]`;
    })
    .join(",\n");
}

function replaceBlock(appSrc, constName, kind, body) {
  let re;
  if (kind === "freeze") {
    re = new RegExp(
      `const ${constName} = Object\\.freeze\\(\\{[\\s\\S]*?\\}\\);`
    );
    return appSrc.replace(re, `const ${constName} = Object.freeze({\n${body}\n  });`);
  }
  if (kind === "set") {
    re = new RegExp(`const ${constName} = new Set\\(\\[[\\s\\S]*?\\]\\);`);
    return appSrc.replace(re, `const ${constName} = new Set([\n${body}\n  ]);`);
  }
  if (kind === "map") {
    re = new RegExp(`const ${constName} = new Map\\(\\[[\\s\\S]*?\\]\\);`);
    return appSrc.replace(re, `const ${constName} = new Map([\n${body}\n  ]);`);
  }
  throw new Error(`Unknown kind ${kind}`);
}

/** Firmware multi-frame image counts (divoom_disp_clock.c send_average_image_ptr total). */
const FIRMWARE_FRAME_RULES = new Map([
  [74, { mode: "multiple", value: 4 }],
  [310, { mode: "multiple", value: 2 }],
  [454, { mode: "multiple", value: 7 }],
  [456, { mode: "multiple", value: 12 }],
  [462, { mode: "multiple", value: 7 }],
  [463, { mode: "multiple", value: 7 }],
  [464, { mode: "multiple", value: 7 }],
  [475, { mode: "exact", value: 18 }],
  [480, { mode: "multiple", value: 10 }],
  [481, { mode: "multiple", value: 10 }],
  [482, { mode: "multiple", value: 10 }],
  [483, { mode: "multiple", value: 10 }],
  [484, { mode: "multiple", value: 10 }],
  [492, { mode: "multiple", value: 10 }],
  [495, { mode: "multiple", value: 4 }],
  [536, { mode: "multiple", value: 2 }],
  [537, { mode: "multiple", value: 30 }],
  [540, { mode: "multiple", value: 7 }],
  [541, { mode: "multiple", value: 7 }],
  [542, { mode: "multiple", value: 7 }],
  [543, { mode: "multiple", value: 7 }],
  [281, { mode: "multiple", value: 10 }],
  [282, { mode: "multiple", value: 10 }],
  [283, { mode: "multiple", value: 10 }],
  [284, { mode: "multiple", value: 10 }],
  [285, { mode: "multiple", value: 10 }],
  [286, { mode: "multiple", value: 10 }],
  [287, { mode: "multiple", value: 10 }],
  [288, { mode: "multiple", value: 10 }],
  [289, { mode: "multiple", value: 10 }],
  [290, { mode: "multiple", value: 10 }],
  [297, { mode: "multiple", value: 10 }],
  [298, { mode: "multiple", value: 10 }],
  [390, { mode: "pointer", value: 1 }],
  [391, { mode: "pointer", value: 1 }]
]);

function main() {
  const args = process.argv.slice(2);
  const sourceDir = path.resolve(args.find((arg) => arg !== "--check") || process.env.DIVOOM_FIRMWARE_SRC || DEFAULT_FIRMWARE_SRC);
  const headerPath = path.join(sourceDir, "divoom_light/include/divoom_disp_clock.h");
  const managePath = path.join(sourceDir, "middle/divoom_clock_manage.c");
  const configPath = path.join(sourceDir, "middle/include/divoom.h");
  if (!fs.existsSync(headerPath)) throw new Error(`Missing ${headerPath}`);
  if (!fs.existsSync(managePath)) throw new Error(`Missing ${managePath}`);
  if (!fs.existsSync(appJsPath)) throw new Error(`Missing ${appJsPath}`);

  const header = fs.readFileSync(headerPath, "utf8");
  const manageSrc = fs.readFileSync(managePath, "utf8");
  const configSrc = fs.readFileSync(configPath, "utf8");
  const slotCount = Number(configSrc.match(/^\s*#define\s+DIVOOM_DEVICE_CLOCK_CUSTOME_MAX_IMAGE\s+(\d+)/m)?.[1]);
  if (!Number.isSafeInteger(slotCount) || slotCount <= 0) throw new Error("Invalid firmware image slot count");
  let appSrc = fs.readFileSync(appJsPath, "utf8");

  const simEntries = parseDispEnum(header);
  const simEntriesBySuffix = new Map([...simEntries.values()].map((e) => [e.suffix, e]));
  const offsetTable = parseOffsetTable(manageSrc, simEntriesBySuffix, header);
  const imageDispIds = new Set(offsetTable.keys());

  const nameMap = readExistingMap(appSrc, "DISP_NAME_MAP");
  const commentMap = readExistingMap(appSrc, "DISP_COMMENT_ZH_MAP");
  const imageIds = readExistingSet(appSrc, "IMAGE_DISP_IDS");
  const pointerIds = readExistingSet(appSrc, "POINTER_DISP_IDS");
  const rules = readExistingRules(appSrc);
  const offsetMap = new Map();
  const offsetRe = /const TEMPLATE_DISP_OFFSET_TABLE = Object\.freeze\(\{([\s\S]*?)\}\);/;
  const offsetBody = appSrc.match(offsetRe)?.[1] || "";
  for (const m of offsetBody.matchAll(/(\d+):\s*(\d+)/g)) {
    offsetMap.set(Number(m[1]), Number(m[2]));
  }

  let addedNames = 0;
  let addedComments = 0;
  for (const [id, entry] of simEntries) {
    if (/^(SET_START_ID|SET_END_ID|END_NUM_INFO|DAIL_COMPONENT_START_ID|DAIL_COMPONENT_END_ID|HTTP_UPLOAD_PROGRESS)$/.test(entry.suffix)) {
      continue;
    }
    if (!nameMap.has(id)) {
      nameMap.set(id, toDispName(entry.suffix));
      addedNames++;
    }
    if (!commentMap.has(id) && entry.comment) {
      commentMap.set(id, entry.comment);
      addedComments++;
    }
  }

  for (const [id, off] of offsetTable) {
    offsetMap.set(id, off);
    imageIds.add(id);
  }

  for (const [id, rule] of FIRMWARE_FRAME_RULES) {
    rules.set(id, rule);
    if (rule.mode === "pointer") pointerIds.add(id);
  }

  for (const id of imageDispIds) {
    if (!rules.has(id)) rules.set(id, { mode: "any" });
  }

  let appOut = replaceBlock(appSrc, "DISP_NAME_MAP", "freeze", formatObjectMap(nameMap));
  appOut = replaceBlock(appOut, "DISP_COMMENT_ZH_MAP", "freeze", formatCommentMap(commentMap));
  appOut = replaceBlock(appOut, "TEMPLATE_DISP_OFFSET_TABLE", "freeze", formatOffsetMap(offsetMap));
  appOut = replaceBlock(appOut, "IMAGE_DISP_IDS", "set", formatSet(imageIds));
  appOut = replaceBlock(appOut, "LOCAL_ASSET_DISP_RULES", "map", formatRulesMap(rules));

  // Extend POINTER_DISP_IDS with world-time pointers if missing
  pointerIds.add(390);
  pointerIds.add(391);
  appOut = replaceBlock(appOut, "POINTER_DISP_IDS", "set", formatSet(pointerIds));
  appOut = appOut.replace(/const TEMPLATE_IMAGE_SLOT_COUNT = \d+;/, `const TEMPLATE_IMAGE_SLOT_COUNT = ${slotCount};`);

  appOut = appOut.replace(/\r?\n/g, appSrc.includes("\r\n") ? "\r\n" : "\n");
  const changed = appOut !== appSrc;
  if (!args.includes("--check") && changed) {
    if (fs.readFileSync(appJsPath, "utf8") !== appSrc) {
      throw new Error("app.js changed during sync; rerun to preserve concurrent edits");
    }
    fs.writeFileSync(appJsPath, appOut, "utf8");
  }

  console.log(`Firmware source: ${sourceDir}`);
  console.log(`Firmware disp enum: ${simEntries.size}`);
  console.log(`Image slots per watchface: ${slotCount}`);
  console.log(`Added DISP_NAME_MAP entries: ${addedNames}`);
  console.log(`Added DISP_COMMENT_ZH_MAP entries: ${addedComments}`);
  console.log(`IMAGE_DISP_IDS: ${imageIds.size}`);
  console.log(`TEMPLATE_DISP_OFFSET_TABLE: ${offsetMap.size}`);
  console.log(`LOCAL_ASSET_DISP_RULES: ${rules.size}`);
  console.log(`${changed ? (args.includes("--check") ? "Needs sync:" : "Updated") : "Already synced:"} ${path.relative(ROOT, appJsPath)}`);
  if (args.includes("--check") && changed) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
