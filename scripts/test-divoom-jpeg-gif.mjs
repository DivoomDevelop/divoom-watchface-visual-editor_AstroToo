import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { firstDivoomJpegGifFrame, packDivoomJpegGifFrames } from "../src/editor/divoomJpegGif.js";

test("JPEG frames repack byte-for-byte into the device's existing DIVM layout", async () => {
  const existing = await readFile(new URL("../public/template/15/2416.bin", import.meta.url));
  const view = new DataView(existing.buffer, existing.byteOffset, existing.byteLength);
  const count = view.getUint16(4, true);
  const delay = view.getUint16(6, true);
  const dataStart = 8 + count * 4;
  const offsets = Array.from({ length: count }, (_, i) => view.getUint32(8 + i * 4, true));
  const frames = offsets.map((offset, i) => existing.subarray(
    dataStart + offset,
    dataStart + (offsets[i + 1] ?? existing.length - dataStart)
  ));
  assert.equal(count, 16);
  assert.deepEqual(packDivoomJpegGifFrames(frames, delay), new Uint8Array(existing));
  assert.deepEqual(firstDivoomJpegGifFrame(existing), frames[0]);
  assert.deepEqual(await readFile(new URL("../public/template/33/2416.jpg", import.meta.url)), frames[0]);
});

test("DIVM packer rejects invalid frame sequences", () => {
  const jpeg = Uint8Array.of(0xff, 0xd8, 0xff, 0xd9);
  assert.throws(() => packDivoomJpegGifFrames([jpeg]), RangeError);
  assert.throws(() => packDivoomJpegGifFrames([jpeg, Uint8Array.of(1, 2, 3, 4)]), TypeError);
  assert.equal(firstDivoomJpegGifFrame(Uint8Array.of(1, 2, 3, 4)), null);
});
