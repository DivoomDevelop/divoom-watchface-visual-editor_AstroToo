import test from "node:test";
import assert from "node:assert/strict";
import { deleteWatchfaceRemoteBindings, watchfaceDeletionTargets } from "../src/editor/watchfaceDeletion.js";

test("deletion targets only device-bound clock IDs", () => {
  assert.deepEqual(watchfaceDeletionTargets({ deviceClockIds: { 123: 60100, 456: 60200 } }, 123), [
    { deviceId: 123, clockId: 60100 }, { deviceId: 456, clockId: 60200 }
  ]);
  assert.deepEqual(watchfaceDeletionTargets({ config: { ClockId: 0 } }, 0), []);
  assert.throws(() => watchfaceDeletionTargets({ config: { ClockId: 60100 } }, 0));
});

test("server and device deletion are sequenced and resumable", async () => {
  let record = { deviceClockIds: { 123: 60100 }, config: { ClockId: 60100 } };
  const calls = [];
  const targets = watchfaceDeletionTargets(record, 123);
  const deps = {
    async deleteServer(deviceId, clockId) { calls.push(`server:${deviceId}:${clockId}`); },
    async deleteDevice(deviceId, clockId) {
      calls.push(`device:${deviceId}:${clockId}`);
      if (calls.length === 2) throw new Error("device offline");
    },
    async saveProgress(next) { record = next; }
  };
  await assert.rejects(deleteWatchfaceRemoteBindings(record, targets, deps), /device offline/);
  assert.equal(record.remoteDeleteProgress["123:60100"].serverDone, true);
  assert.deepEqual(calls, ["server:123:60100", "device:123:60100"]);
  await deleteWatchfaceRemoteBindings(record, targets, deps);
  assert.deepEqual(calls, ["server:123:60100", "device:123:60100", "device:123:60100"]);
  assert.equal(record.remoteDeleteProgress["123:60100"].deviceDone, true);
});
