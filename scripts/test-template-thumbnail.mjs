import test from "node:test";
import assert from "node:assert/strict";
import { planTemplateAssetWrites, scanPendingTemplatesFromDevice } from "../src/editor/templateSync.js";
import { setTemplateThumbnail, templateThumbnailSources } from "../src/editor/templateThumbnail.js";

test("a downloaded dial without a preview can use its saved background thumbnail", () => {
  const sources = templateThumbnailSources(1976, {
    previewDir: "/template/33/",
    backgroundDir: "/template/15/"
  });
  const image = { src: "", onerror: null, removed: false, remove() { this.removed = true; } };
  setTemplateThumbnail(image, sources);
  while (image.src !== "/template/15/1977.jpg") {
    assert.ok(image.onerror, "a fallback source should remain");
    image.onerror();
  }
  assert.equal(image.removed, false);
});

test("an absent thumbnail stops after the final source", () => {
  const image = { src: "", onerror: null, removed: false, remove() { this.removed = true; } };
  setTemplateThumbnail(image, ["missing.png", "missing.jpg"]);
  image.onerror();
  assert.equal(image.src, "missing.jpg");
  image.onerror();
  assert.equal(image.removed, true);
  assert.equal(image.onerror, null);
});

test("the catalog thumbnail is downloaded when the dial has no preview URL", () => {
  const clock = {
    DeviceImageUrl: "group1/background.jpg",
    DevicePreviewImageUrl: "",
    ItemList: []
  };
  const writes = planTemplateAssetWrites(1976, clock, {
    getSlotByItem: () => null,
    isImageItem: () => false,
    previewImagePixelId: "group1/catalog-cover.webp"
  });
  assert.ok(writes.some(({ relPath, fileAddr }) =>
    relPath === "template/33/1977.webp" && fileAddr === "group1/catalog-cover.webp"));
});

test("AppImageUrl is saved separately and displayed before older previews", () => {
  const appImageUrl = "group1/complete-app-preview.webp";
  const writes = planTemplateAssetWrites(2415, {
    AppImageUrl: appImageUrl,
    DevicePreviewImageUrl: "group1/older-preview.jpg",
    ItemList: []
  }, { getSlotByItem: () => null, isImageItem: () => false });
  assert.deepEqual(writes, [{
    relPath: "template/33/2416.app.webp",
    fileAddr: appImageUrl
  }]);
  const sources = templateThumbnailSources(2415, {
    previewDir: "/template/33/",
    backgroundDir: "/template/15/",
    appImageUrl,
    remoteUrl: "/divoom-cdn-proxy/group1/complete-app-preview.webp",
    remoteFirst: true
  });
  assert.deepEqual(sources.slice(0, 3), [
    "/template/33/2416.app.webp",
    "/divoom-cdn-proxy/group1/complete-app-preview.webp",
    "/template/33/2416.png"
  ]);
});

test("a downloaded template missing the new APP image is offered for update", async () => {
  const storeJson = async (command, payload) => {
    if (command === "Channel/StoreClockGetClassify") {
      return { ClassifyList: [{ ClassifyId: 112, ClassifyName: "Artists" }] };
    }
    if (command === "Channel/StoreClockGetListForAI") {
      return { ClockList: [
        { ClockId: 2415, ClockName: "Angel Star" },
        { ClockId: 162, ClockName: "Legacy" }
      ] };
    }
    if (command === "Device/GetClockInfoV3") {
      return { ClockId: payload.ClockId, SysUpdateTime: 1, ItemList: [{}],
        AppImageUrl: payload.ClockId === 2415 ? "group1/app.webp" : "" };
    }
    throw new Error(`unexpected command: ${command}`);
  };
  const result = await scanPendingTemplatesFromDevice({
    storeJson,
    loadExistingCfg: async () => ({ SysUpdateTime: 1, ItemList: [{}] }),
    language: "en"
  });
  assert.equal(result.totalPending, 1);
  assert.equal(result.classifyRows[0].items[0].clockId, 2415);
  assert.equal(result.classifyRows[0].items[0].reason, "outdated");
});
