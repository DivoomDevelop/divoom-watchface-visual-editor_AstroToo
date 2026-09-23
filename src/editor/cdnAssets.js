/** Divoom 静态资源 CDN（与固件 DIVOOM_SERVER_DEFAULT_URL 一致）。 */
export const DIVOOM_CDN_BASE = "https://f.divoom-gz.com/";

export function resolveCdnUrl(fileAddr) {
  const path = String(fileAddr || "").trim();
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  return DIVOOM_CDN_BASE + path.replace(/^\//, "");
}

/** 开发态经 Vite 代理拉 CDN，避免浏览器跨域。 */
export function resolveCdnFetchUrl(fileAddr, { useProxy = false, origin = "" } = {}) {
  const url = resolveCdnUrl(fileAddr);
  if (!url || !useProxy) return url;
  try {
    const u = new URL(url);
    if (u.hostname.endsWith("divoom-gz.com") && origin) {
      return `${origin.replace(/\/$/, "")}/divoom-cdn-proxy${u.pathname}`;
    }
  } catch {
    /* ignore */
  }
  return url;
}

export function extFromAssetPath(path) {
  const m = String(path || "").match(/\.([a-z0-9]+)(?:\?.*)?$/i);
  return m ? `.${m[1].toLowerCase()}` : ".bin";
}

function readAscii(bytes, start, len) {
  let s = "";
  for (let i = 0; i < len; i++) s += String.fromCharCode(bytes[start + i] || 0);
  return s;
}

export function extFromImageBytes(bytesLike) {
  const bytes = bytesLike instanceof Uint8Array ? bytesLike : new Uint8Array(bytesLike || []);
  if (bytes.length >= 4 && readAscii(bytes, 0, 4) === "DIVM") return ".bin";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return ".jpg";
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return ".png";
  }
  const sig6 = bytes.length >= 6 ? readAscii(bytes, 0, 6) : "";
  if (sig6 === "GIF87a" || sig6 === "GIF89a") return ".gif";
  if (bytes.length >= 12 && readAscii(bytes, 0, 4) === "RIFF" && readAscii(bytes, 8, 4) === "WEBP") {
    return ".webp";
  }
  if (bytes.length >= 2 && bytes[0] === 0x42 && bytes[1] === 0x4d) return ".bmp";
  return "";
}

export async function downloadAssetBytes(fileAddr, { useCdnProxy = false, origin = "", signal } = {}) {
  const url = resolveCdnFetchUrl(fileAddr, { useProxy: useCdnProxy, origin });
  if (!url) throw new Error("empty asset url");
  const res = await fetch(url, { signal });
  if (!res.ok) {
    throw new Error(`asset fetch ${res.status}: ${fileAddr}`);
  }
  return new Uint8Array(await res.arrayBuffer());
}
