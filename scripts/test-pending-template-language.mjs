import assert from "node:assert/strict";
import {
  classifyCatalogNeedsNameEnrichment,
  enrichClassifyCatalogNames
} from "../src/editor/templateSync.js";
import {
  parsePendingTemplateCache,
  serializePendingTemplateCache
} from "../src/editor/pendingTemplateCache.js";

const catalog = { ClassifyList: [{
  ClassifyId: 112, ClassifyName: "艺术家联名", ClassifyNameEn: "艺术家联名"
}] };
assert.equal(classifyCatalogNeedsNameEnrichment(catalog), true);
const enriched = enrichClassifyCatalogNames(catalog, new Map([[
  112, { ClassifyName: "艺术家联名", ClassifyNameEn: "Artist Collaborations" }
]]));
assert.equal(enriched.ClassifyList[0].ClassifyNameEn, "Artist Collaborations");

const saved = serializePendingTemplateCache({ classifyRows: [{
  ClassifyId: 112,
  ClassifyName: "艺术家联名",
  ClassifyNameEn: "Artist Collaborations",
  items: [{ clockId: 2415, clockName: "小猫", clockNameCn: "小猫",
    clockNameEn: "Kitten", imagePixelId: "", classifyId: 112, reason: "missing" }]
}] });
const loaded = parsePendingTemplateCache(saved);
assert.equal(loaded.classifyRows[0].items[0].clockNameCn, "小猫");
assert.equal(loaded.classifyRows[0].items[0].clockNameEn, "Kitten");
console.log("PASS: bilingual template category enrichment and pending-name cache round-trip");
