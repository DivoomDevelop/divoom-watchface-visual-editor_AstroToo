import encodeJpeg from "@jsquash/jpeg/encode.js";

export const DEVICE_JPEG_MAX_BYTES = 500 * 1024;

const DEVICE_JPEG_OPTIONS = Object.freeze({
  baseline: true,
  progressive: false,
  arithmetic: false,
  optimize_coding: false,
  smoothing: 0,
  color_space: 3,
  quant_table: 0,
  trellis_multipass: false,
  trellis_opt_zero: false,
  trellis_opt_table: false,
  trellis_loops: 1,
  auto_subsample: false,
  chroma_subsample: 2,
  separate_chroma_quality: false
});

function toUint8Array(bytesLike) {
  if (bytesLike instanceof Uint8Array) return bytesLike;
  if (bytesLike instanceof ArrayBuffer) return new Uint8Array(bytesLike);
  if (ArrayBuffer.isView(bytesLike)) {
    return new Uint8Array(bytesLike.buffer, bytesLike.byteOffset, bytesLike.byteLength);
  }
  return new Uint8Array();
}

/** Verify the exact baseline YCbCr 4:2:0 profile accepted by AstroToo's JPEG decoder. */
export function inspectDeviceJpeg(bytesLike) {
  const bytes = toUint8Array(bytesLike);
  if (bytes.length < 16 || bytes[0] !== 0xff || bytes[1] !== 0xd8 ||
      bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9) {
    throw new Error("JPEG SOI/EOI marker missing");
  }

  let offset = 2;
  while (offset + 3 < bytes.length) {
    while (offset < bytes.length && bytes[offset] !== 0xff) offset += 1;
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.length) break;
    const marker = bytes[offset++];
    if (marker === 0xd9) break;
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 1 >= bytes.length) break;
    const segmentLength = (bytes[offset] << 8) | bytes[offset + 1];
    if (segmentLength < 2 || offset + segmentLength > bytes.length) {
      throw new Error("JPEG segment length invalid");
    }
    if (marker === 0xc2) throw new Error("progressive JPEG is not supported by AstroToo");
    if (marker === 0xc0) {
      const data = offset + 2;
      if (segmentLength < 17 || data + 14 >= bytes.length) throw new Error("JPEG SOF0 invalid");
      const height = (bytes[data + 1] << 8) | bytes[data + 2];
      const width = (bytes[data + 3] << 8) | bytes[data + 4];
      const componentCount = bytes[data + 5];
      const ySampling = bytes[data + 7];
      const cbSampling = bytes[data + 10];
      const crSampling = bytes[data + 13];
      if (componentCount !== 3 || ySampling !== 0x22 || cbSampling !== 0x11 || crSampling !== 0x11) {
        throw new Error("JPEG must use YCbCr 4:2:0 sampling");
      }
      return { width, height, baseline: true, subsampling: "4:2:0" };
    }
    if (marker === 0xda) break;
    offset += segmentLength;
  }
  throw new Error("JPEG baseline SOF0 marker missing");
}

export async function encodeImageDataForAstroToo(imageData, quality = 82) {
  if (!imageData || imageData.width <= 0 || imageData.height <= 0 || !imageData.data) {
    throw new Error("image data unavailable");
  }
  const normalizedQuality = Math.max(1, Math.min(95, Math.round(Number(quality) || 82)));
  const buffer = await encodeJpeg(imageData, {
    ...DEVICE_JPEG_OPTIONS,
    quality: normalizedQuality,
    chroma_quality: normalizedQuality
  });
  const profile = inspectDeviceJpeg(buffer);
  if (profile.width !== imageData.width || profile.height !== imageData.height) {
    throw new Error(`JPEG dimensions changed to ${profile.width}x${profile.height}`);
  }
  return buffer;
}

export async function encodeCanvasForAstroToo(canvas, quality = 82) {
  const ctx = canvas?.getContext?.("2d", { willReadFrequently: true });
  if (!ctx || canvas.width <= 0 || canvas.height <= 0) throw new Error("canvas unavailable");
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const buffer = await encodeImageDataForAstroToo(imageData, quality);
  return new Blob([buffer], { type: "image/jpeg" });
}
