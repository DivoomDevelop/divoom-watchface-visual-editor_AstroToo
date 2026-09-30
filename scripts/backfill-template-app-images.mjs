/** Fill missing AppImageUrl values and cache APP previews for downloaded templates. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildDivoomLanEnvelope } from "../src/editor/divoomLanJson.js";
import { downloadAssetBytes, extFromImageBytes } from "../src/editor/cdnAssets.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const configDir = path.join(root, "public/template/config");
const previewDir = path.join(root, "public/template/33");
const apiBase = (process.env.DIVOOM_CHINA_V3_API_TARGET || "https://appchina.divoom-gz.com").replace(/\/$/, "");
const deviceId = Number(process.env.DIVOOM_DEVICE_ID || 300344410);
const requestedIds = process.argv.slice(2).map(Number).filter((id) => Number.isInteger(id) && id > 0);
const ids = requestedIds.length ? requestedIds : fs.readdirSync(configDir)
  .filter((name) => /^\d+\.cfg$/.test(name))
  .map((name) => Number(name.slice(0, -4)))
  .sort((a, b) => a - b);

async function fetchClockInfo(clockId) {
  const body = buildDivoomLanEnvelope("Device/GetClockInfoV3", {
    ClockId: clockId, ParentItemId: 0, ParentClockId: 0
  }, () => deviceId);
  const response = await fetch(`${apiBase}/Device/GetClockInfoV3`, {
    method: "POST",
    headers: { "Content-Type": "application/json;charset=UTF-8" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  if (Number(data?.ReturnCode) !== 0 || Number(data?.ClockId) !== clockId) {
    throw new Error(data?.ReturnMessage || "unexpected clock response");
  }
  return data;
}

async function backfill(clockId) {
  const cfgPath = path.join(configDir, `${clockId}.cfg`);
  const initial = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
  if (String(initial.AppImageUrl || "").trim()) return "already set";

  const remote = await fetchClockInfo(clockId);
  const appImageUrl = String(remote.AppImageUrl || "").trim();
  if (!appImageUrl) return "not provided";
  const bytes = await downloadAssetBytes(appImageUrl);
  const ext = extFromImageBytes(bytes);
  if (![".png", ".jpg", ".webp", ".gif"].includes(ext)) {
    throw new Error(`unsupported APP image: ${ext || "unknown"}`);
  }
  const imagePath = path.join(previewDir, `${clockId + 1}.app${ext}`);
  if (fs.existsSync(imagePath)) {
    if (!fs.readFileSync(imagePath).equals(Buffer.from(bytes))) {
      throw new Error(`existing APP preview differs: ${imagePath}`);
    }
  } else {
    fs.writeFileSync(imagePath, bytes, { flag: "wx" });
  }

  // Re-read immediately before writing so unrelated local edits stay intact.
  const currentText = fs.readFileSync(cfgPath, "utf8");
  const current = JSON.parse(currentText);
  if (String(current.AppImageUrl || "").trim()) return "updated externally";
  if (Number(current.ClockId) !== clockId) throw new Error("CFG ClockId changed");
  const newline = currentText.includes("\r\n") ? "\r\n" : "\n";
  let updatedText;
  if (/"AppImageUrl"\s*:\s*""/.test(currentText)) {
    updatedText = currentText.replace(/("AppImageUrl"\s*:\s*)""/, `$1${JSON.stringify(appImageUrl)}`);
  } else {
    const match = currentText.match(/^([ \t]*)"DeviceImageUrl"\s*:/m);
    if (!match) throw new Error("DeviceImageUrl line missing");
    updatedText = currentText.replace(match[0],
      `${match[1]}"AppImageUrl": ${JSON.stringify(appImageUrl)},${newline}${match[0]}`);
  }
  fs.writeFileSync(cfgPath, updatedText, "utf8");
  return `saved ${path.basename(imagePath)}`;
}

let updated = 0;
let unavailable = 0;
let failed = 0;
for (const id of ids) {
  try {
    const result = await backfill(id);
    if (result.startsWith("saved")) updated += 1;
    if (result === "not provided") unavailable += 1;
    console.log(`${id}: ${result}`);
  } catch (error) {
    failed += 1;
    console.error(`${id}: ${error?.message || error}`);
  }
}
console.log(`Updated ${updated}, not provided ${unavailable}, failed ${failed}`);
if (failed) process.exitCode = 1;
