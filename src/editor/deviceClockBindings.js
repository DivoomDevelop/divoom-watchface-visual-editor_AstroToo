function normalizePositiveId(value) {
  const id = Number(value);
  return Number.isFinite(id) && id > 0 ? Math.trunc(id) : 0;
}

function normalizeDeviceKey(value) {
  const id = normalizePositiveId(value);
  return id > 0 ? String(id) : "";
}

export function normalizeDeviceClockBindings(record, currentDeviceId = 0) {
  const normalized = {};
  const stored = record?.deviceClockIds;
  if (stored && typeof stored === "object" && !Array.isArray(stored)) {
    for (const [rawDeviceId, rawClockId] of Object.entries(stored)) {
      const deviceId = normalizeDeviceKey(rawDeviceId);
      const clockId = normalizePositiveId(rawClockId);
      if (deviceId && clockId > 0) normalized[deviceId] = clockId;
    }
  }

  // v1 records only had config.ClockId. Bind that legacy id once to the
  // currently selected device; never expose it to every discovered device.
  if (Object.keys(normalized).length === 0) {
    const deviceId = normalizeDeviceKey(currentDeviceId);
    const legacyClockId = normalizePositiveId(record?.unboundLegacyClockId) ||
      normalizePositiveId(record?.config?.ClockId);
    if (deviceId && legacyClockId > 0) normalized[deviceId] = legacyClockId;
  }
  return normalized;
}

/** Keep a v1 ClockId pending until a concrete DeviceId is known. */
export function getUnboundLegacyClockId(record, bindings = {}) {
  if (Object.keys(bindings || {}).length > 0) return 0;
  return normalizePositiveId(record?.unboundLegacyClockId) || normalizePositiveId(record?.config?.ClockId);
}

export function getDeviceClockId(bindings, deviceId) {
  const key = normalizeDeviceKey(deviceId);
  return key ? normalizePositiveId(bindings?.[key]) : 0;
}

export function withDeviceClockId(bindings, deviceId, clockId) {
  const next = { ...(bindings || {}) };
  const key = normalizeDeviceKey(deviceId);
  if (!key) return next;
  const normalizedClockId = normalizePositiveId(clockId);
  if (normalizedClockId > 0) next[key] = normalizedClockId;
  else delete next[key];
  return next;
}
