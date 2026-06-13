#!/usr/bin/env node
/**
 * Sync DISP_NAME_MAP, DISP_COMMENT_ZH_MAP, TEMPLATE_DISP_OFFSET_TABLE, IMAGE_DISP_IDS
 * from LvglAstroTooSimulator sources into src/editor/app.js.
 *
 * Usage:
 *   node scripts/sync-disp-from-simulator.mjs [path-to-simulator-src]
 *
 * Default simulator src:
 *   ../../divoom_product/timebox/trunck/device/tool_src/lv_sim_visual_studio/LvglAstroTooSimulator/src
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DEFAULT_SIM_SRC =
  "D:/work/divoom_product/timebox/trunck/device/tool_src/lv_sim_visual_studio/LvglAstroTooSimulator/src";

const simSrc = path.resolve(process.argv[2] || DEFAULT_SIM_SRC);
const headerPath = path.join(simSrc, "divoom_light/include/divoom_disp_clock.h");
const managePath = path.join(simSrc, "middle/divoom_clock_manage.c");
const appJsPath = path.join(ROOT, "src/editor/app.js");

function parseDispEnum(header) {
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

function parseOffsetTable(manageSrc, simEntriesBySuffix) {
  const table = new Map();
  const blockMatch = manageSrc.match(
    /const int gdivoom_disp_image_item_table\[\]\[2\]\s*=\s*\{([\s\S]*?)\};/
  );
  if (!blockMatch) throw new Error("gdivoom_disp_image_item_table not found");
  const rows = blockMatch[1].match(/\{[^}]+\}/g) || [];
  let offset = 0;
  for (const row of rows) {
    const cols = [...row.matchAll(/DIVOOM_[A-Z0-9_]+/g)].map((x) => x[0]);
    if (cols.length < 2) continue;
    const dispToken = cols[1];
    const dispMatch = dispToken.match(/DIVOOM_CLOCK_DISP_SUPPORT_(.+)/);
    if (!dispMatch) continue;
    const dispName = dispMatch[1];
    if (dispName === "0" || row.includes(",    0}")) {
      offset++;
      continue;
    }
    const entry = simEntriesBySuffix.get(dispName);
    if (!entry) continue;
    table.set(entry.id, offset);
    offset++;
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
        while ((m = re.exec(body))) map.set(Number(m[1]), m[2]);
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
  if (!fs.existsSync(headerPath)) throw new Error(`Missing ${headerPath}`);
  if (!fs.existsSync(managePath)) throw new Error(`Missing ${managePath}`);
  if (!fs.existsSync(appJsPath)) throw new Error(`Missing ${appJsPath}`);

  const header = fs.readFileSync(headerPath, "utf8");
  const manageSrc = fs.readFileSync(managePath, "utf8");
  let appSrc = fs.readFileSync(appJsPath, "utf8");

  const simEntries = parseDispEnum(header);
  const simEntriesBySuffix = new Map([...simEntries.values()].map((e) => [e.suffix, e]));
  const offsetTable = parseOffsetTable(manageSrc, simEntriesBySuffix);
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
    if (/^(SET_START_ID|SET_END_ID|END_NUM_INFO|DAIL_COMPONENT_START_ID|DAIL_COMPONENT_END_ID)$/.test(entry.suffix)) {
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

  fs.writeFileSync(appJsPath, appOut, "utf8");

  console.log(`Simulator disp enum: ${simEntries.size}`);
  console.log(`Added DISP_NAME_MAP entries: ${addedNames}`);
  console.log(`Added DISP_COMMENT_ZH_MAP entries: ${addedComments}`);
  console.log(`IMAGE_DISP_IDS: ${imageIds.size}`);
  console.log(`TEMPLATE_DISP_OFFSET_TABLE: ${offsetMap.size}`);
  console.log(`LOCAL_ASSET_DISP_RULES: ${rules.size}`);
  console.log(`Updated ${path.relative(ROOT, appJsPath)}`);
}

main();
