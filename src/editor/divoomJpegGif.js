/** Pack JPEG frames in the DIVM layout used by DIVOOM_RESOURCE_TYPE_JPEG_GIF. */
export function packDivoomJpegGifFrames(frames, frameDelayMs = 100) {
  if (!Array.isArray(frames) || frames.length < 2 || frames.length > 2000) {
    throw new RangeError("DIVM requires 2–2000 JPEG frames");
  }
  if (!Number.isInteger(frameDelayMs) || frameDelayMs < 0 || frameDelayMs > 0xffff) {
    throw new RangeError("invalid DIVM frame delay");
  }
  const jpegFrames = frames.map((frame) => frame instanceof Uint8Array ? frame : new Uint8Array(frame));
  let dataSize = 0;
  for (const frame of jpegFrames) {
    if (frame.length < 4 || frame[0] !== 0xff || frame[1] !== 0xd8 ||
        frame[frame.length - 2] !== 0xff || frame[frame.length - 1] !== 0xd9) {
      throw new TypeError("every DIVM frame must contain JPEG data");
    }
    dataSize += frame.length;
  }
  if (dataSize > 0xffffffff) throw new RangeError("DIVM image data is too large");
  const dataStart = 8 + jpegFrames.length * 4;
  const packed = new Uint8Array(dataStart + dataSize);
  const view = new DataView(packed.buffer);
  packed.set([0x44, 0x49, 0x56, 0x4d]); // DIVM
  view.setUint16(4, jpegFrames.length, true);
  view.setUint16(6, frameDelayMs, true);
  let offset = 0;
  jpegFrames.forEach((frame, index) => {
    view.setUint32(8 + index * 4, offset, true);
    packed.set(frame, dataStart + offset);
    offset += frame.length;
  });
  return packed;
}

/** Return a browser-displayable thumbnail from a DIVM animation, if its first frame is JPEG. */
export function firstDivoomJpegGifFrame(bytesLike) {
  const bytes = bytesLike instanceof Uint8Array ? bytesLike : new Uint8Array(bytesLike || []);
  if (bytes.length < 16 || bytes[0] !== 0x44 || bytes[1] !== 0x49 ||
      bytes[2] !== 0x56 || bytes[3] !== 0x4d) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const frameCount = view.getUint16(4, true);
  const dataStart = 8 + frameCount * 4;
  if (frameCount < 1 || frameCount > 2000 || dataStart > bytes.length) return null;
  const start = view.getUint32(8, true);
  const end = frameCount > 1 ? view.getUint32(12, true) : bytes.length - dataStart;
  if (start >= end || end > bytes.length - dataStart) return null;
  const frame = bytes.subarray(dataStart + start, dataStart + end);
  if (frame.length < 4 || frame[0] !== 0xff || frame[1] !== 0xd8 ||
      frame[frame.length - 2] !== 0xff || frame[frame.length - 1] !== 0xd9) return null;
  return frame;
}
