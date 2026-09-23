import assert from "node:assert/strict";
import { scanPendingFontsFromStore } from "../src/editor/fontCloudSync.js";
import { remapUnavailableItemFonts } from "../src/editor/deviceFonts.js";

const local = {
  FontList: [
    { id: 2, type: 1, url: "retired.ttf", name: "Retired font" },
    { id: 6, type: 1, url: "font-6.ttf", name: "Font 6" }
  ]
};
const remote = [
  { id: 6, type: 1, url: "font-6.ttf", name: "Font 6" },
  { id: 102, type: 0, url: "font-102.bin", name: "Font 102" }
];
const scan = await scanPendingFontsFromStore({
  storeJson: async () => ({ ReturnCode: 0, FontList: remote }),
  loadFontInfo: async () => local,
  checkFontFileExists: async (id) => id === 6
});

assert.deepEqual(scan.mergedFontInfo.FontList.map((row) => row.id), [6, 102]);
assert.equal(scan.mergedFontInfo.FontList.some((row) => row.id === 2), false);
assert.deepEqual(scan.items.map((row) => [row.id, row.reason]), [[102, "missing"]]);

const remapped = remapUnavailableItemFonts(
  [{ font: 2, disp: 6 }, { font: 102, disp: 4 }],
  [
    { id: 6, type: 1, AvailableLocally: true },
    { id: 102, type: 0, AvailableLocally: true }
  ],
  local.FontList
);
assert.deepEqual(remapped.items.map((row) => row.font), [6, 102]);
assert.deepEqual(remapped.replacements, [{ index: 0, from: 2, to: 6 }]);

console.log("PASS: authoritative font refresh removes retired IDs and remaps old watchfaces");
