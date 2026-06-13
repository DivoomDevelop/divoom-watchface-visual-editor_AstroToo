import { CLOCK_JSON_FILENAME } from "./watchfaceExport.js";

export function isWatchfaceDirectoryImportSupported() {
  return typeof window !== "undefined" && typeof window.showDirectoryPicker === "function";
}

/** @param {string} text */
export function parseWatchfaceImportJson(text) {
  let raw;
  try {
    raw = JSON.parse(String(text || ""));
  } catch {
    throw new Error("invalid_json");
  }
  if (!raw || typeof raw !== "object") throw new Error("invalid_root");
  if (!Array.isArray(raw.ItemList)) throw new Error("missing_item_list");
  return raw;
}

/** @param {string[]} fileNames */
export function pickWatchfaceJsonFileName(fileNames) {
  const names = (fileNames || []).map((n) => String(n || ""));
  if (names.includes(CLOCK_JSON_FILENAME)) return CLOCK_JSON_FILENAME;
  const jsonLike = names.filter((n) => /\.(json|cfg)$/i.test(n));
  const watchface = jsonLike.find((n) => /watchface/i.test(n));
  if (watchface) return watchface;
  return jsonLike[0] || "";
}

/** @param {object} raw */
export function prepareConfigForLocalImport(raw) {
  const config = JSON.parse(JSON.stringify(raw));
  config.ClockId = 0;
  delete config.TemplateAssetClockId;
  return config;
}

function isLocalAssetLeaf(name) {
  const s = String(name || "").trim();
  if (!s || /^https?:\/\//i.test(s)) return false;
  if (s.includes("/") || s.includes("\\")) return false;
  return true;
}

/** @param {object} config */
export function collectImportAssetLeaves(config) {
  const leaves = new Set();
  const bg = String(config?.DeviceImageUrl || "").trim();
  const app = String(config?.AppImageUrl || "").trim();
  if (isLocalAssetLeaf(bg)) leaves.add(bg);
  if (isLocalAssetLeaf(app)) leaves.add(app);
  for (const item of config?.ItemList || []) {
    const addr = String(item?.image_addr || "").trim();
    if (isLocalAssetLeaf(addr)) leaves.add(addr);
  }
  return [...leaves];
}

const ASTRO_ECHO_ASSET_ALIASES = Object.freeze({
  "astro_echo_bg.png": "clock_bg.png",
  "astro_echo_bg.jpg": "clock_bg.png",
  "astro_echo_bg.webp": "clock_bg.png",
  "astro_echo_weather.png": "weather_icon.png",
  "astro_echo_weather.jpg": "weather_icon.png",
  "astro_echo_weather.webp": "weather_icon.png",
  "astro_echo_wave.png": "wave_decor.png",
  "astro_echo_wave.webp": "wave_decor.png"
});

/** @param {string} leaf @param {Map<string, File>} fileMap */
export function resolveImportFileForLeaf(leaf, fileMap) {
  const name = String(leaf || "").trim();
  if (!name || !fileMap) return null;
  const direct = fileMap.get(name.toLowerCase());
  if (direct) return direct;
  const alias = ASTRO_ECHO_ASSET_ALIASES[name.toLowerCase()];
  if (alias) return fileMap.get(alias.toLowerCase()) || null;
  return null;
}

/** Relative paths (site root) to try when resolving a leaf name over HTTP. */
export function buildPublicAssetLookupPaths(leaf) {
  const name = String(leaf || "").trim().replace(/^\/+/, "");
  if (!name || name.includes("..")) return [];
  const alias = ASTRO_ECHO_ASSET_ALIASES[name.toLowerCase()];
  const paths = [
    name,
    `assets/${name}`,
    `template/15/${name}`,
    `template/29/${name}`,
    `template/33/${name}`,
    `examples/astro-echo/assets/${name}`,
    `examples/${name}`
  ];
  if (alias) {
    paths.push(`examples/astro-echo/assets/${alias}`);
    paths.push(`examples/astro-echo/${alias}`);
    paths.push(alias);
  }
  return paths.filter((p, i, arr) => p && arr.indexOf(p) === i);
}

/**
 * @param {FileSystemDirectoryHandle} dirHandle
 * @returns {Promise<{ jsonText: string, jsonName: string, fileMap: Map<string, File> }>}
 */
export async function readWatchfaceImportDirectory(dirHandle) {
  /** @type {Map<string, File>} */
  const fileMap = new Map();
  /** @type {{ name: string, text: string }[]} */
  const jsonCandidates = [];

  async function walk(handle, prefix = "") {
    for await (const [name, entry] of handle.entries()) {
      const rel = prefix ? `${prefix}/${name}` : name;
      if (entry.kind === "directory") {
        await walk(entry, rel);
        continue;
      }
      if (entry.kind !== "file") continue;
      const file = await entry.getFile();
      const lower = name.toLowerCase();
      fileMap.set(lower, file);
      if (/\.(json|cfg)$/i.test(lower)) {
        const text = await file.text();
        jsonCandidates.push({ name, text });
      }
    }
  }

  await walk(dirHandle);

  const jsonName = pickWatchfaceJsonFileName(jsonCandidates.map((c) => c.name));
  if (!jsonName) throw new Error("json_not_found");
  const picked = jsonCandidates.find((c) => c.name === jsonName);
  if (!picked) throw new Error("json_not_found");

  return { jsonText: picked.text, jsonName: picked.name, fileMap };
}

/**
 * @param {FileList|File[]} fileList
 * @returns {Promise<{ jsonText: string, jsonName: string, fileMap: Map<string, File> }>}
 */
export async function readWatchfaceImportFileList(fileList) {
  const files = [...fileList];
  /** @type {Map<string, File>} */
  const fileMap = new Map();
  for (const file of files) {
    fileMap.set(String(file.name || "").toLowerCase(), file);
  }
  const jsonName = pickWatchfaceJsonFileName(files.map((f) => f.name));
  if (!jsonName) throw new Error("json_not_found");
  const jsonFile = fileMap.get(jsonName.toLowerCase());
  if (!jsonFile) throw new Error("json_not_found");
  return { jsonText: await jsonFile.text(), jsonName, fileMap };
}
