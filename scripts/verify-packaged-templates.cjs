// Verify the actual app archive, including the resources embedded in a mounted macOS DMG.
const assert = require("node:assert/strict");
const path = require("node:path");
const crypto = require("node:crypto");
const asar = require("@electron/asar");

const archive = process.argv[2];
assert.ok(archive, "Usage: node scripts/verify-packaged-templates.cjs <app.asar>");
const read = (relative) => asar.extractFile(archive, path.join("dist", ...relative.split("/")));
const catalog = JSON.parse(read("template/demo-catalog.json"));
assert.ok(catalog.ClockList.length > 0, "The installer must contain built-in templates");
for (const [relative, expected] of Object.entries(catalog.files)) {
  const actual = crypto.createHash("sha256").update(read(relative)).digest("hex");
  assert.equal(actual, expected, `Packaged resource differs from the bundled snapshot: ${relative}`);
}
for (const row of catalog.ClockList) {
  assert.ok(catalog.files[row.config], `Configuration not included: ${row.ClockId}`);
  for (const relative of Object.values(row.assets)) assert.ok(catalog.files[relative], relative);
}
console.log(`Verified installer archive: ${catalog.ClockList.length} templates, ${Object.keys(catalog.files).length} resource files.`);
