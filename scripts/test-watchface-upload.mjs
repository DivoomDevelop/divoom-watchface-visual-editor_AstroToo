import assert from "node:assert/strict";
import {
  encodeAppPreviewWebp,
  getDeviceUploadState,
  normalizeDeviceUploadStates,
  validateAppPreviewImage,
  withDeviceUploadState
} from "../src/editor/watchfaceUpload.js";

assert.deepEqual(validateAppPreviewImage({ naturalWidth: 480, naturalHeight: 320 }), {
  width: 480, height: 320, ok: true
});
assert.equal(validateAppPreviewImage({ naturalWidth: 481, naturalHeight: 320 }).ok, false);
assert.equal(validateAppPreviewImage({ naturalWidth: 320, naturalHeight: 481 }).ok, false);
assert.equal(validateAppPreviewImage({ naturalWidth: 0, naturalHeight: 320 }).ok, false);

let drawArgs = null;
const documentRef = {
  createElement(name) {
    assert.equal(name, "canvas");
    return {
      width: 0,
      height: 0,
      getContext: () => ({ drawImage: (...args) => { drawArgs = args; } }),
      toBlob: (callback, type, quality) => {
        assert.equal(type, "image/webp");
        assert.equal(quality, 0.9);
        callback(new Blob([new Uint8Array([1, 2, 3])], { type }));
      }
    };
  }
};
const image = { naturalWidth: 400, naturalHeight: 300 };
const webp = await encodeAppPreviewWebp(image, { documentRef });
assert.equal(webp.type, "image/webp");
assert.equal(webp.size, 3);
assert.deepEqual(drawArgs, [image, 0, 0, 400, 300]);
assert.equal(await encodeAppPreviewWebp({ naturalWidth: 800, naturalHeight: 300 }, { documentRef }), null);

const states = withDeviceUploadState({}, 300426474, {
  clockId: 60003,
  shareToOthers: true,
  classifyId: 30,
  uploadedAt: 123,
  messageInfo: "first update"
});
assert.equal(getDeviceUploadState(states, 300426474, 60003)?.shareToOthers, true);
assert.equal(getDeviceUploadState(states, 300426474, 60003)?.classifyId, 30);
assert.equal(getDeviceUploadState(states, 999, 60003), null);
assert.equal(getDeviceUploadState(states, 300426474, 60004), null);

const normalized = normalizeDeviceUploadStates({
  deviceUploadStates: {
    300426474: { clockId: 60003, shareToOthers: true, classifyId: 30, uploadedAt: 123, messageInfo: "ok" },
    invalid: { clockId: 1 }
  }
});
assert.deepEqual(Object.keys(normalized), ["300426474"]);
assert.equal(withDeviceUploadState(states, 300426474, null)[300426474], undefined);

console.log("PASS: APP preview <=480 validation, WebP conversion, and DeviceId+ClockId upload-state binding");
