import { downloadAssetBytes, extFromImageBytes } from "./cdnAssets.js";
import { getDeviceClockId, normalizeDeviceClockBindings } from "./deviceClockBindings.js";
import { deviceUploadStateFromClock } from "./watchfaceUpload.js";

function positiveId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : 0;
}

function assetMime(bytes, path) {
  const ext = extFromImageBytes(bytes) || String(path || "").match(/\.(png|jpe?g|gif|webp|bmp|bin)(?:\?.*)?$/i)?.[0]?.toLowerCase();
  return ({ ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
    ".gif": "image/gif", ".webp": "image/webp", ".bmp": "image/bmp" })[ext] || "application/octet-stream";
}

export async function downloadWatchfaceAsset(path, origin = "") {
  const bytes = await downloadAssetBytes(path, { useCdnProxy: true, origin });
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error(`asset read failed: ${path}`));
    reader.readAsDataURL(new Blob([bytes], { type: assetMime(bytes, path) }));
  });
}

/** Import only cloud clocks absent from the selected device's local library. */
export async function syncDeviceWatchfaces({ deviceId, storeJson, list, save, loadAsset }) {
  const id = positiveId(deviceId);
  if (!id) return { imported: 0, errors: [], clockInfo: null };
  const idResult = await storeJson("Channel/GetDeviceClockIdList", { DeviceId: id });
  if (!Array.isArray(idResult?.ClockList)) throw new Error("Invalid device clock ID list");
  const cloudIds = [...new Set(idResult.ClockList.map((row) => positiveId(row?.ClockId)).filter(Boolean))];
  const localIds = () => new Set(list().map((row) =>
    getDeviceClockId(normalizeDeviceClockBindings(row, id), id)).filter(Boolean));
  const missing = cloudIds.filter((clockId) => !localIds().has(clockId));
  if (!missing.length) return { imported: 0, errors: [], clockInfo: null };

  const clockInfo = await storeJson("Channel/GetDeviceClockInfo", { DeviceId: id });
  if (!Array.isArray(clockInfo?.ClockList)) throw new Error("Invalid device clock details");
  const details = new Map(clockInfo.ClockList.map((row) => [positiveId(row?.ClockId), row]));
  const errors = [];
  let imported = 0;
  for (const clockId of missing) {
    if (localIds().has(clockId)) continue;
    const row = details.get(clockId);
    if (!row || !Array.isArray(row.ItemList)) {
      errors.push({ clockId, error: new Error("Clock configuration missing from response") });
      continue;
    }
    try {
      const name = String(row.Name || row.NameCn || row.NameEn || `Clock ${clockId}`).trim();
      const bgPath = String(row.DeviceImageUrl || row.DeviceImageId || "").trim();
      const previewPath = String(row.AppImageUrl || row.PreviewImageUrl || "").trim();
      const config = {
        ...row, ClockId: clockId, NameCn: row.NameCn || name, NameEn: row.NameEn || name,
        DeviceImageUrl: bgPath, AppImageUrl: previewPath,
        ItemList: row.ItemList.map((item) => ({ ...item }))
      };
      const assets = new Map();
      async function asset(path) {
        if (!path) return "";
        if (!assets.has(path)) assets.set(path, await loadAsset(path));
        return assets.get(path);
      }
      const backgroundDataUrl = await asset(bgPath);
      const appPreviewDataUrl = await asset(previewPath);
      const localDispAssets = [];
      for (let index = 0; index < config.ItemList.length; index += 1) {
        const item = config.ItemList[index];
        const path = String(item?.image_addr || "").trim();
        if (!path) continue;
        localDispAssets.push({
          index, itemId: String(item.item_id || ""),
          name: path.replace(/\\/g, "/").split("/").pop() || `item-${index}.bin`,
          mimeType: "", dataUrl: await asset(path)
        });
      }
      if (localIds().has(clockId)) continue;
      const uploadState = deviceUploadStateFromClock(row);
      await save({
        id: `wf-device-${id}-${clockId}`, source: "deviceCloud", name, updatedAt: Date.now(), config,
        backgroundDataUrl, backgroundName: bgPath.split("/").pop() || "",
        backgroundSourceLabel: bgPath,
        appPreviewDataUrl, appPreviewName: previewPath.split("/").pop() || "",
        appPreviewSourceLabel: previewPath,
        localDispAssets, width: 480, height: 480, zoom: 55,
        previewOverrides: {}, templateActiveClockId: null,
        deviceClockIds: { [id]: clockId },
        deviceUploadStates: uploadState ? { [id]: uploadState } : {}
      });
      imported += 1;
    } catch (error) {
      errors.push({ clockId, error });
    }
  }
  return { imported, errors, clockInfo };
}
