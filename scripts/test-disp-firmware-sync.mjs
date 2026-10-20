import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { parseDispEnum, parseOffsetTable } from "./sync-disp-from-simulator.mjs";
import { legacyTemplateElementSlot, templateElementAssetStem } from "../src/editor/templateElementAssets.js";
import { planTemplateAssetWrites } from "../src/editor/templateSync.js";

test("image mappings use enum values across reordered rows, holes and aliases", () => {
  const header = `enum {
    DIVOOM_DISP_CLOCK_IMAGE_OFFSET_LEFT,
    DIVOOM_DISP_CLOCK_IMAGE_OFFSET_UNUSED,
    DIVOOM_DISP_CLOCK_IMAGE_OFFSET_SHARED = 7,
    DIVOOM_DISP_CLOCK_IMAGE_OFFSET_NEXT
  };
  enum {
    DIVOOM_CLOCK_DISP_SUPPORT_LEFT = 46, // left
    DIVOOM_CLOCK_DISP_SUPPORT_SOLAR = 461, // solar
    DIVOOM_CLOCK_DISP_SUPPORT_NEXT_SOLAR = 523, // shared solar
    DIVOOM_CLOCK_DISP_SUPPORT_NEW = 540, // weekday
  };`;
  const source = `const int gdivoom_disp_image_item_table[][2] = {
    {DIVOOM_DISP_CLOCK_IMAGE_OFFSET_NEXT, DIVOOM_CLOCK_DISP_SUPPORT_NEW},
    {DIVOOM_DISP_CLOCK_IMAGE_OFFSET_SHARED, DIVOOM_CLOCK_DISP_SUPPORT_SOLAR},
    {DIVOOM_DISP_CLOCK_IMAGE_OFFSET_LEFT, DIVOOM_CLOCK_DISP_SUPPORT_LEFT},
    {DIVOOM_DISP_CLOCK_IMAGE_OFFSET_SHARED, DIVOOM_CLOCK_DISP_SUPPORT_NEXT_SOLAR},
    {DIVOOM_DISP_CLOCK_IMAGE_OFFSET_UNUSED, 0},
  };`;
  const entries = new Map([...parseDispEnum(header).values()].map(row => [row.suffix, row]));
  assert.deepEqual([...parseOffsetTable(source, entries, header)], [[540, 8], [461, 7], [46, 0], [523, 7]]);
  assert.throws(() => parseOffsetTable(source.replace('OFFSET_NEXT,', 'OFFSET_MISSING,'), entries, header), /Unresolved/);
});

const source = fs.readFileSync(new URL("../src/editor/app.js", import.meta.url), "utf8");
const context = vm.createContext({
  toNum: (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback,
  legacyTemplateElementSlot, templateElementAssetStem
});
for (const name of ["DISP_NAME_MAP", "DISP_COMMENT_ZH_MAP", "TEMPLATE_DISP_OFFSET_TABLE", "LOCAL_ASSET_DISP_RULES", "IMAGE_DISP_IDS"]) {
  const block = source.match(new RegExp(`const ${name} = [\\s\\S]*?\\n  (?:\\}|\\])\\);`))?.[0];
  assert.ok(block, name);
  vm.runInContext(block, context);
}
const slotCount = source.match(/const TEMPLATE_IMAGE_SLOT_COUNT = \d+;/)[0];
vm.runInContext(slotCount, context);
for (const name of ["getDispFrameSlot", "getTemplateSlotByItem"]) {
  const start = source.indexOf(`  function ${name}(`);
  const end = source.indexOf("\n  }", start) + 4;
  vm.runInContext(source.slice(start, end), context);
}

test("new firmware elements are selectable with correct image rules and shared slots", () => {
  for (let id = 535; id <= 543; id++) {
    assert.ok(vm.runInContext(`DISP_NAME_MAP[${id}] && DISP_COMMENT_ZH_MAP[${id}]`, context));
  }
  assert.equal(vm.runInContext("DISP_NAME_MAP[1000]", context), undefined);
  for (const [id, frames] of [[495, 4], [536, 2], [537, 30], [540, 7], [541, 7], [542, 7], [543, 7]]) {
    assert.equal(vm.runInContext(`IMAGE_DISP_IDS.has(${id}) && LOCAL_ASSET_DISP_RULES.get(${id}).value`, context), frames);
  }
  assert.equal(vm.runInContext("TEMPLATE_DISP_OFFSET_TABLE[461]", context), vm.runInContext("TEMPLATE_DISP_OFFSET_TABLE[523]", context));
  assert.equal(context.getTemplateSlotByItem(10, { disp: 46 }), 2561);
  assert.notEqual(context.getTemplateSlotByItem(10, { disp: 13 }), context.getTemplateSlotByItem(10, { disp: 46 }));
});

test("weekday images start on Monday and future days wrap through Sunday", () => {
  for (let day = 18; day <= 24; day++) {
    const date = new Date(2026, 9, day, 12);
    assert.equal(context.getDispFrameSlot(66, date), (date.getDay() + 6) % 7);
    for (let id = 540; id <= 543; id++) {
      assert.equal(context.getDispFrameSlot(id, date), (date.getDay() + 6 + id - 539) % 7);
    }
  }
  assert.equal(context.getDispFrameSlot(537, new Date(2026, 9, 19)), 18);
});

test("new cache filenames avoid old numeric files while legacy slots stay readable", () => {
  assert.equal(legacyTemplateElementSlot(10, { disp: 13 }), 1323);
  assert.equal(legacyTemplateElementSlot(10, { disp: 131 }), 1287);
  assert.equal(legacyTemplateElementSlot(10, { disp: 999, image_id: 4 }), 1284);
  const writes = planTemplateAssetWrites(10, { ItemList: [{ disp: 540, image_addr: "group1/week.bin" }] }, {
    getSlotByItem: context.getTemplateSlotByItem, isImageItem: () => true
  });
  assert.equal(writes[0].relPath, `template/29/${templateElementAssetStem(context.getTemplateSlotByItem(10, { disp: 540 }))}.bin`);
  assert.match(writes[0].relPath, /\/astrotoo-\d+\.bin$/);
});

test("template loading falls back to old cache and prefers the new cache after download", async () => {
  const start = source.indexOf("  async function applyTemplateImageAssetsByClockId(");
  const end = source.indexOf("\n  async function previewTemplateWatchface(", start);
  const item = { disp: 13 };
  const attempts = [];
  let hasNewAsset = false;
  let loadedAsset;
  Object.assign(context, {
    state: { config: { ItemList: [item] } }, templateState: { loadToken: 1 },
    bundledTemplateRow: () => null,
    TEMPLATE_DIR_29: "/template/29/", TEMPLATE_IMG_EXT_CANDIDATES: ["bin"],
    isTemplateImageItem: () => true, releaseStandaloneAsset: () => {},
    setLocalDispAsset: (_item, asset) => { loadedAsset = asset; },
    loadFirstTemplateAsset: async (_dir, stem) => {
      attempts.push(stem);
      return { asset: !stem.startsWith("astrotoo-") || hasNewAsset ? { name: `${stem}.bin` } : null };
    }
  });
  vm.runInContext(source.slice(start, end), context);
  await context.applyTemplateImageAssetsByClockId(10, 1);
  assert.deepEqual(attempts, ["astrotoo-2590", "1323"]);
  assert.equal(loadedAsset.name, "1323.bin");
  attempts.length = 0;
  hasNewAsset = true;
  await context.applyTemplateImageAssetsByClockId(10, 1);
  assert.deepEqual(attempts, ["astrotoo-2590"]);
  assert.equal(loadedAsset.name, "astrotoo-2590.bin");
});
