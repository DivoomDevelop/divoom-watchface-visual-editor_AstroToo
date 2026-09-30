import { normalizeDeviceClockBindings } from "./deviceClockBindings.js";

function positiveId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : 0;
}

export function watchfaceDeletionTargets(record, selectedDeviceId = 0) {
  const bindings = normalizeDeviceClockBindings(record, selectedDeviceId);
  const targets = Object.entries(bindings).map(([deviceId, clockId]) => ({
    deviceId: positiveId(deviceId),
    clockId: positiveId(clockId)
  })).filter(({ deviceId, clockId }) => deviceId && clockId);
  if (!targets.length &&
      (positiveId(record?.unboundLegacyClockId) || positiveId(record?.config?.ClockId))) {
    throw new Error("Select the device associated with this ClockId before deleting it.");
  }
  return targets;
}

/** Persist each confirmed remote step so a failed device request can be retried safely. */
export async function deleteWatchfaceRemoteBindings(record, targets, deps) {
  let current = record;
  for (const { deviceId, clockId } of targets) {
    const key = `${deviceId}:${clockId}`;
    let progress = current.remoteDeleteProgress?.[key] || {};
    if (!progress.serverDone) {
      await deps.deleteServer(deviceId, clockId);
      progress = { ...progress, serverDone: true };
      current = { ...current, remoteDeleteProgress: { ...current.remoteDeleteProgress, [key]: progress } };
      await deps.saveProgress(current);
    }
    if (!progress.deviceDone) {
      await deps.deleteDevice(deviceId, clockId);
      progress = { ...progress, deviceDone: true };
      current = { ...current, remoteDeleteProgress: { ...current.remoteDeleteProgress, [key]: progress } };
      await deps.saveProgress(current);
    }
  }
  return current;
}
