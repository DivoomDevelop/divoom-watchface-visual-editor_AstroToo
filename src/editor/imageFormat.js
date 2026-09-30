const DIVOOM_JPEG_GIF_MIME = "application/x-divoom-jpeg-gif";

function ascii(bytes, offset, length) {
  let value = "";
  for (let i = 0; i < length; i += 1) value += String.fromCharCode(bytes[offset + i]);
  return value;
}

/** Detect the resource type from its bytes, regardless of filename or declared MIME. */
export function imageMimeFromBytes(bytesLike) {
  const bytes = bytesLike instanceof Uint8Array ? bytesLike : new Uint8Array(bytesLike || []);
  if (bytes.length >= 8 && ascii(bytes, 0, 4) === "DIVM") return DIVOOM_JPEG_GIF_MIME;
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && bytes[0] === 0x89 && ascii(bytes, 1, 3) === "PNG" &&
      bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return "image/png";
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") return "image/webp";
  if (bytes.length >= 6 && (ascii(bytes, 0, 6) === "GIF87a" || ascii(bytes, 0, 6) === "GIF89a")) return "image/gif";
  return "application/octet-stream";
}

export function imageMimeFromDataUrl(dataUrl) {
  const source = String(dataUrl || "");
  const comma = source.indexOf(",");
  if (!source.startsWith("data:") || comma < 0) return "application/octet-stream";
  try {
    const metadata = source.slice(0, comma);
    const prefix = source.slice(comma + 1, comma + 65);
    const binary = /;base64/i.test(metadata)
      ? atob(prefix.slice(0, prefix.length - (prefix.length % 4)))
      : decodeURIComponent(prefix);
    return imageMimeFromBytes(Uint8Array.from(binary.slice(0, 32), (char) => char.charCodeAt(0)));
  } catch {
    return "application/octet-stream";
  }
}
