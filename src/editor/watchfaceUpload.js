export const APP_PREVIEW_MAX_DIMENSION = 480;

function positiveInt(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.trunc(number) : 0;
}

export function appPreviewDimensions(image) {
  return {
    width: positiveInt(image?.naturalWidth || image?.videoWidth || image?.width),
    height: positiveInt(image?.naturalHeight || image?.videoHeight || image?.height)
  };
}

export function validateAppPreviewImage(image) {
  const { width, height } = appPreviewDimensions(image);
  return {
    width,
    height,
    ok: width > 0 && height > 0 &&
      width <= APP_PREVIEW_MAX_DIMENSION && height <= APP_PREVIEW_MAX_DIMENSION
  };
}

export function encodeAppPreviewWebp(image, { documentRef = globalThis.document, quality = 0.9 } = {}) {
  const dimensions = validateAppPreviewImage(image);
  if (!dimensions.ok || !documentRef?.createElement) return Promise.resolve(null);
  const canvas = documentRef.createElement("canvas");
  canvas.width = dimensions.width;
  canvas.height = dimensions.height;
  const context = canvas.getContext?.("2d");
  if (!context) return Promise.resolve(null);
  context.drawImage(image, 0, 0, dimensions.width, dimensions.height);
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      resolve(blob && blob.type === "image/webp" && blob.size > 0 ? blob : null);
    }, "image/webp", quality);
  });
}

export function normalizeDeviceUploadStates(record) {
  const normalized = {};
  const stored = record?.deviceUploadStates;
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) return normalized;
  for (const [rawDeviceId, rawState] of Object.entries(stored)) {
    const deviceId = positiveInt(rawDeviceId);
    const clockId = positiveInt(rawState?.clockId);
    if (!deviceId || !clockId) continue;
    normalized[String(deviceId)] = {
      clockId,
      shareToOthers: rawState?.shareToOthers === true,
      classifyId: positiveInt(rawState?.classifyId),
      uploadedAt: positiveInt(rawState?.uploadedAt),
      messageInfo: String(rawState?.messageInfo || "").slice(0, 500)
    };
  }
  return normalized;
}

export function getDeviceUploadState(states, deviceId, clockId) {
  const key = String(positiveInt(deviceId) || "");
  const expectedClockId = positiveInt(clockId);
  const state = key ? states?.[key] : null;
  return state && positiveInt(state.clockId) === expectedClockId ? state : null;
}

export function withDeviceUploadState(states, deviceId, uploadState) {
  const next = { ...(states || {}) };
  const key = String(positiveInt(deviceId) || "");
  if (!key) return next;
  const clockId = positiveInt(uploadState?.clockId);
  if (!clockId) {
    delete next[key];
    return next;
  }
  next[key] = {
    clockId,
    shareToOthers: uploadState?.shareToOthers === true,
    classifyId: positiveInt(uploadState?.classifyId),
    uploadedAt: positiveInt(uploadState?.uploadedAt) || Date.now(),
    messageInfo: String(uploadState?.messageInfo || "").slice(0, 500)
  };
  return next;
}
