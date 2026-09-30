import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { exportWatchfaceToDirectory } from "../src/editor/watchfaceExport.js";

async function exportMislabeledBackground(assetPath, expectedFileName) {
  const bytes = readFileSync(new URL(assetPath, import.meta.url));
  const written = new Map();
  const dirHandle = {
    async getFileHandle(name) {
      return {
        async createWritable() {
          return {
            async write(data) { written.set(name, data); },
            async close() {}
          };
        }
      };
    }
  };
  const rec = {
    config: { ClockId: 0, ItemList: [], ItemIdList: [], DeviceImageUrl: "" },
    backgroundName: "174.png",
    backgroundDataUrl: `data:image/png;base64,${bytes.toString("base64")}`
  };
  const result = await exportWatchfaceToDirectory(rec, dirHandle, {});
  assert.deepEqual(result.missing, []);
  assert.ok(result.written.includes(expectedFileName));
  assert.deepEqual(Buffer.from(written.get(expectedFileName)), bytes);
  assert.equal(JSON.parse(Buffer.from(written.get("clock.json")).toString()).DeviceImageUrl, expectedFileName);
}

test("export names an animated WebP by its header, not its PNG label", async () => {
  await exportMislabeledBackground("../public/template/15/174.webp", "BG174.webp");
});

test("export names a Divoom JPEG GIF resource by its header", async () => {
  await exportMislabeledBackground("../public/template/15/2416.bin", "BG174.bin");
});
