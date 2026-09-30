import test from "node:test";
import assert from "node:assert/strict";
import { animationFrameDurations, animationFrameIndex } from "../src/editor/backgroundAnimation.js";

test("animated background follows decoded frame durations and loops", () => {
  const durations = animationFrameDurations([
    { duration: 50_000 },
    { duration: 200_000 },
    { duration: 100_000 }
  ]);
  assert.deepEqual(durations, [50, 200, 100]);
  assert.equal(animationFrameIndex(durations, 0), 0);
  assert.equal(animationFrameIndex(durations, 50), 1);
  assert.equal(animationFrameIndex(durations, 249), 1);
  assert.equal(animationFrameIndex(durations, 250), 2);
  assert.equal(animationFrameIndex(durations, 350), 0);
});

test("a frame without timing metadata uses the preview interval", () => {
  assert.deepEqual(animationFrameDurations([{}, { duration: 0 }], 100), [100, 100]);
});
