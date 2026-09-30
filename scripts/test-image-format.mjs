import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { imageMimeFromBytes, imageMimeFromDataUrl } from "../src/editor/imageFormat.js";

test("image type comes from the header even when the filename or data MIME is wrong", () => {
  const mislabeledWebp = readFileSync(new URL("../public/template/33/102.png", import.meta.url));
  assert.equal(imageMimeFromBytes(mislabeledWebp), "image/webp");
  assert.equal(imageMimeFromDataUrl(`data:image/png;base64,${mislabeledWebp.toString("base64")}`), "image/webp");
  assert.equal(imageMimeFromBytes(readFileSync(new URL("../public/template/15/1889.jpg", import.meta.url))), "image/jpeg");
  assert.equal(imageMimeFromBytes(readFileSync(new URL("../public/template/15/2416.bin", import.meta.url))),
    "application/x-divoom-jpeg-gif");
});

test("PNG signature is recognized without a filename", () => {
  assert.equal(imageMimeFromBytes(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), "image/png");
  assert.equal(imageMimeFromBytes(Uint8Array.from([0, 1, 2, 3])), "application/octet-stream");
});
