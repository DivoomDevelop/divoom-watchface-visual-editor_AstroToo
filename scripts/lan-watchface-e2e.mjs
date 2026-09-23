/**
 * Real-device regression for AstroToo local watchfaces:
 * create a clock with a JPEG background and PNG display asset, patch the
 * background + text + asset, patch the asset again, verify an old-content
 * rollback re-uploads deleted resources, restore the final face, then capture.
 *
 * Usage: node scripts/lan-watchface-e2e.mjs 192.168.13.142 <initial-bg.jpg>
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inspectDeviceJpeg } from "../src/editor/deviceJpegEncoder.js";
import { remapUnavailableItemFonts } from "../src/editor/deviceFonts.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const ip = String(process.argv[2] || process.env.DIVOOM_LAN_IP || "").trim();
const initialBgSource = String(process.argv[3] || process.env.DIVOOM_LAN_JPEG_SOURCE || "").trim();
if (!ip || !initialBgSource) {
  console.error("Usage: node scripts/lan-watchface-e2e.mjs <device-ip> <480x480-baseline-420.jpg>");
  process.exit(2);
}

const base = /^https?:\/\//i.test(ip) ? ip.replace(/\/$/, "") : `http://${ip}:9000`;
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const outDir = path.resolve(here, "..", "artifacts", `lan-whitebox-${stamp}`);
fs.mkdirSync(outDir, { recursive: true });

const files = {
  initialBg: path.join(outDir, "initial-bg.jpg"),
  patchedBg: path.join(outDir, "patched-bg.jpg"),
  badge1: path.join(outDir, "badge-v1.png"),
  badge2: path.join(outDir, "badge-v2.png"),
  badge3: path.join(outDir, "badge-v3.png"),
  createBundle: path.join(outDir, "create-bundle.tar"),
  snapshot: path.join(outDir, "final-screen.bmp"),
  report: path.join(outDir, "report.json")
};

const py = process.platform === "win32" ? "python" : "python3";
const generated = spawnSync(py, [
  "-c",
  [
    "from PIL import Image, ImageDraw, ImageFont",
    "import sys",
    "src,initial,bg,b1,b2,b3,stamp=sys.argv[1:8]",
    "first=Image.open(src).convert('RGB').resize((480,480))",
    "fd=ImageDraw.Draw(first)",
    "fd.rectangle((0,458,250,479),fill=(0,0,0))",
    "fd.text((6,462),'BASE '+stamp[-18:],fill=(255,255,255))",
    "first.save(initial,'JPEG',quality=80,subsampling=2,progressive=False,optimize=False)",
    "im=Image.new('RGB',(480,480),(10,45,82))",
    "d=ImageDraw.Draw(im)",
    "d.rectangle((0,0,479,110),fill=(245,170,30))",
    "d.rectangle((0,350,479,479),fill=(12,120,80))",
    "d.text((24,28),'PATCHED BACKGROUND',fill=(255,255,255))",
    "d.text((24,380),'ASTROTOO LAN E2E',fill=(255,255,255))",
    "d.text((24,416),stamp[-18:],fill=(255,255,255))",
    "im.save(bg,'JPEG',quality=80,subsampling=2,progressive=False,optimize=False)",
    "for p,c,label in [(b1,(220,40,40,255),'V1'),(b2,(40,190,80,255),'V2'),(b3,(70,90,235,255),'V3')]:",
    "  x=Image.new('RGBA',(128,128),(0,0,0,0)); q=ImageDraw.Draw(x)",
    "  q.rounded_rectangle((4,4,123,123),radius=24,fill=c,outline=(255,255,255,255),width=5)",
    "  q.text((52,54),label,fill=(255,255,255,255))",
    "  q.text((8,104),stamp[-10:],fill=(255,255,255,255))",
    "  x.save(p,'PNG')"
  ].join("\n"),
  initialBgSource,
  files.initialBg,
  files.patchedBg,
  files.badge1,
  files.badge2,
  files.badge3,
  stamp
], { encoding: "utf8" });
if (generated.status !== 0) throw new Error(generated.stderr || "Pillow asset generation failed");

function assertDeviceJpeg(file) {
  const bytes = fs.readFileSync(file);
  const profile = inspectDeviceJpeg(bytes);
  if (profile.width !== 480 || profile.height !== 480 || bytes.length >= 500 * 1024) {
    throw new Error(`${path.basename(file)} is not an accepted 480x480 device JPEG`);
  }
  return { ...profile, bytes: bytes.length };
}

function tarString(header, offset, length, value) {
  Buffer.from(String(value), "utf8").copy(header, offset, 0, length);
}

function tarOctal(header, offset, length, value) {
  const text = Math.max(0, Number(value) || 0).toString(8).padStart(length - 1, "0") + "\0";
  tarString(header, offset, length, text);
}

function makeTar(entries) {
  const parts = [];
  for (const entry of entries) {
    const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data);
    const header = Buffer.alloc(512, 0);
    tarString(header, 0, 100, entry.name);
    tarOctal(header, 100, 8, 0o644);
    tarOctal(header, 108, 8, 0);
    tarOctal(header, 116, 8, 0);
    tarOctal(header, 124, 12, data.length);
    tarOctal(header, 136, 12, Math.floor(Date.now() / 1000));
    header.fill(0x20, 148, 156);
    header[156] = 0x30;
    tarString(header, 257, 6, "ustar\0");
    tarString(header, 263, 2, "00");
    tarString(header, 265, 32, "codex");
    tarString(header, 297, 32, "codex");
    const sum = header.reduce((acc, byte) => acc + byte, 0);
    tarString(header, 148, 8, sum.toString(8).padStart(6, "0") + "\0 ");
    parts.push(header, data);
    const padding = (512 - (data.length % 512)) % 512;
    if (padding) parts.push(Buffer.alloc(padding, 0));
  }
  parts.push(Buffer.alloc(1024, 0));
  return Buffer.concat(parts);
}

function makeBundle(entries) {
  return makeTar(entries);
}

function multipart(meta, fileBytes, filename) {
  const boundary = `----DivoomE2E${Date.now()}${Math.random().toString(16).slice(2)}`;
  const crlf = "\r\n";
  const json = Buffer.from(JSON.stringify(meta), "utf8");
  const headJson = Buffer.from(
    `--${boundary}${crlf}Content-Disposition: form-data; name="json"; filename="cmd.json"${crlf}` +
    `Content-Type: application/json${crlf}Content-Length: ${json.length}${crlf}${crlf}`
  );
  const headFile = Buffer.from(
    `${crlf}--${boundary}${crlf}Content-Disposition: form-data; name="${Date.now()}"; filename="${filename}"${crlf}` +
    `Content-Type: application/octet-stream${crlf}Content-Length: ${fileBytes.length}${crlf}${crlf}`
  );
  return {
    body: Buffer.concat([headJson, json, headFile, fileBytes, Buffer.from(`${crlf}--${boundary}--${crlf}`)]),
    contentType: `multipart/form-data; boundary=${boundary}`
  };
}

async function jsonCommand(payload) {
  const response = await fetch(`${base}/divoom_api`, {
    method: "POST",
    headers: { "Content-Type": "application/json;charset=UTF-8" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30_000)
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${text}`);
  const parsed = JSON.parse(text);
  if (Number(parsed.ReturnCode) !== 0) throw new Error(`${payload.Command}: ${text}`);
  return parsed;
}

async function multipartCommand(endpoint, meta, bundle) {
  const wire = multipart(meta, bundle, "clock_assets.tar");
  const response = await fetch(`${base}/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": wire.contentType },
    body: wire.body,
    signal: AbortSignal.timeout(120_000)
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${text}`);
  const parsed = JSON.parse(text);
  if (Number(parsed.ReturnCode) !== 0) throw new Error(`${meta.Command}: ${text}`);
  return parsed;
}

const jpegProfiles = {
  initial: assertDeviceJpeg(files.initialBg),
  patched: assertDeviceJpeg(files.patchedBg)
};
const itemBase = {
  size: 96, font: 0, info: "", color_1: "#ffffff", color_2: "#000000",
  image_id: 0, sep: 0, alig: 3, angle: 0, hier: 0, transp: 100, animation: 0
};
const timeFontId = Number(process.env.DIVOOM_E2E_TIME_FONT_ID || 6);
if (!Number.isInteger(timeFontId) || timeFontId <= 0) {
  throw new Error(`Invalid DIVOOM_E2E_TIME_FONT_ID: ${process.env.DIVOOM_E2E_TIME_FONT_ID}`);
}
const requestedItems = [
  { ...itemBase, disp: 4, font: timeFontId, x: 28, y: 24, w: 260, h: 96, item_id: "DispItem_Time", image_addr: "" },
  { ...itemBase, disp: 46, x: 320, y: 40, w: 128, h: 128, item_id: "DispItem_Picture", image_addr: "badge-v1.png", bundle_image: "badge-v1.png" },
  { ...itemBase, size: 48, disp: 27, font: 102, x: 20, y: 300, w: 300, h: 120, item_id: "DispItem_Month", image_addr: "" }
];
const deviceFontCatalog = await jsonCommand({ Command: "Device/GetLocalFontList", ReturnCode: 0 });
const skipFontRemap = process.env.DIVOOM_E2E_SKIP_FONT_REMAP === "1";
const fontRemap = skipFontRemap
  ? { items: requestedItems, replacements: [] }
  : remapUnavailableItemFonts(
      requestedItems,
      deviceFontCatalog.FontList,
      [{ id: timeFontId, type: 1 }, { id: 102, type: 0 }]
    );
const items = fontRemap.items;

const createMeta = {
  Command: "Device/CreateLocalClock", ReturnCode: 0, DialAssets: "bundle",
  ClockName: `LAN E2E ${stamp}`, NameCn: "LAN 真机回归", NameEn: "LAN E2E",
  ClockId: 0, ItemList: items, ItemIdList: items.map((item) => item.item_id)
};
const createBundle = makeBundle([
  { name: "clock_bg.jpg", data: fs.readFileSync(files.initialBg) },
  { name: "badge-v1.png", data: fs.readFileSync(files.badge1) }
]);
fs.writeFileSync(files.createBundle, createBundle);
console.log("CREATE: background + time + PNG display item");
const created = await multipartCommand("create_local_clock", createMeta, createBundle);
const clockId = Number(created.ClockId);
if (!(clockId > 0)) throw new Error(`Create returned invalid ClockId: ${JSON.stringify(created)}`);

const selectedAfterCreate = await jsonCommand({
  Command: "Device/GetLocalClockInfo", ReturnCode: 0, UseCurrentDisplayClock: true
});
if (Number(selectedAfterCreate.ClockId) !== clockId) {
  throw new Error(`Create did not auto-select ${clockId}: ${JSON.stringify(selectedAfterCreate)}`);
}

console.log(`SHARE 1: ClockId=${clockId}, establish resource baseline`);
const share1 = await jsonCommand({
  Command: "Device/ShareLocalClock", ReturnCode: 0, ClockId: clockId
});
if (share1.Shared !== true || Number(share1.DeletedFiles) !== 0) {
  throw new Error(`Initial share returned unexpected resource counts: ${JSON.stringify(share1)}`);
}

console.log(`PATCH 1: ClockId=${clockId}, background + text fields + PNG V2`);
const patch1 = await multipartCommand("patch_local_clock", {
  Command: "Device/PatchLocalClockInfo", ReturnCode: 0, DialAssets: "bundle", ClockId: clockId,
  ItemPatchList: [
    { index: 0, patch: { x: 38, y: 170, w: 300, h: 100, size: 112, color_1: "#00ffff" } },
    { index: 1, patch: { x: 314, y: 176, w: 128, h: 128, bundle_image: "badge-v2.png" } }
  ]
}, makeBundle([
  { name: "clock_bg.jpg", data: fs.readFileSync(files.patchedBg) },
  { name: "badge-v2.png", data: fs.readFileSync(files.badge2) }
]));

console.log(`PATCH 2: ClockId=${clockId}, PNG display item V3 only`);
const patch2 = await multipartCommand("patch_local_clock", {
  Command: "Device/PatchLocalClockInfo", ReturnCode: 0, DialAssets: "bundle", ClockId: clockId,
  ItemPatchList: [{ index: 1, patch: { x: 176, y: 292, bundle_image: "badge-v3.png" } }]
}, makeBundle([{ name: "badge-v3.png", data: fs.readFileSync(files.badge3) }]));

const current = await jsonCommand({
  Command: "Device/GetLocalClockInfo", ReturnCode: 0, UseCurrentDisplayClock: true
});
if (Number(current.ClockId) !== clockId) throw new Error(`Patch did not return to ClockId ${clockId}`);
const currentItems = Array.isArray(current.ItemList) ? current.ItemList : [];
if (Number(currentItems[0]?.x) !== 38 || String(currentItems[0]?.color_1).toLowerCase() !== "#00ffff") {
  throw new Error(`Text element patch is not reflected: ${JSON.stringify(currentItems[0])}`);
}
if (Number(currentItems[1]?.x) !== 176 || String(currentItems[1]?.image_addr || "") !== "UserDefine") {
  throw new Error(`Image element patch is not reflected: ${JSON.stringify(currentItems[1])}`);
}

console.log(`SHARE 2: ClockId=${clockId}, replace background and PNG resources`);
const share2 = await jsonCommand({
  Command: "Device/ShareLocalClock", ReturnCode: 0, ClockId: clockId
});
if (share2.Shared !== true || Number(share2.UploadedFiles) < 2 || Number(share2.DeletedFiles) < 1) {
  throw new Error(`Updated share did not replace old resources: ${JSON.stringify(share2)}`);
}

console.log(`SHARE 3: ClockId=${clockId}, verify unchanged share is idempotent`);
const share3 = await jsonCommand({
  Command: "Device/ShareLocalClock", ReturnCode: 0, ClockId: clockId
});
if (share3.Shared !== true || Number(share3.UploadedFiles) !== 0 || Number(share3.DeletedFiles) !== 0) {
  throw new Error(`Unchanged share was not idempotent: ${JSON.stringify(share3)}`);
}

console.log(`ROLLBACK: ClockId=${clockId}, restore previously deleted V1 resources`);
const rollbackPatch = await multipartCommand("patch_local_clock", {
  Command: "Device/PatchLocalClockInfo", ReturnCode: 0, DialAssets: "bundle", ClockId: clockId,
  ItemPatchList: [{ index: 1, patch: { bundle_image: "badge-v1.png" } }]
}, makeBundle([
  { name: "clock_bg.jpg", data: fs.readFileSync(files.initialBg) },
  { name: "badge-v1.png", data: fs.readFileSync(files.badge1) }
]));
const rollbackShare = await jsonCommand({
  Command: "Device/ShareLocalClock", ReturnCode: 0, ClockId: clockId
});
// An old FileId may intentionally remain when another persisted clock slot uses
// it. Every FileId actually deleted by SHARE 2 must, however, be uploaded again.
if (rollbackShare.Shared !== true ||
    Number(rollbackShare.UploadedFiles) < Number(share2.DeletedFiles) ||
    Number(rollbackShare.DeletedFiles) < 1) {
  throw new Error(`Rollback reused deleted FileIds: ${JSON.stringify(rollbackShare)}`);
}

console.log(`RESTORE: ClockId=${clockId}, restore final background and PNG V3`);
const restorePatch = await multipartCommand("patch_local_clock", {
  Command: "Device/PatchLocalClockInfo", ReturnCode: 0, DialAssets: "bundle", ClockId: clockId,
  ItemPatchList: [{ index: 1, patch: { bundle_image: "badge-v3.png" } }]
}, makeBundle([
  { name: "clock_bg.jpg", data: fs.readFileSync(files.patchedBg) },
  { name: "badge-v3.png", data: fs.readFileSync(files.badge3) }
]));
const restoreShare = await jsonCommand({
  Command: "Device/ShareLocalClock", ReturnCode: 0, ClockId: clockId
});
if (restoreShare.Shared !== true ||
    Number(restoreShare.UploadedFiles) < Number(rollbackShare.DeletedFiles) ||
    Number(restoreShare.DeletedFiles) < 1) {
  throw new Error(`Final restore did not refresh resources: ${JSON.stringify(restoreShare)}`);
}
const finalCurrent = await jsonCommand({
  Command: "Device/GetLocalClockInfo", ReturnCode: 0, UseCurrentDisplayClock: true
});
const finalItems = Array.isArray(finalCurrent.ItemList) ? finalCurrent.ItemList : [];
if (Number(finalCurrent.ClockId) !== clockId || Number(finalItems[1]?.x) !== 176 ||
    String(finalItems[1]?.image_addr || "") !== "UserDefine") {
  throw new Error(`Final restored clock is not active: ${JSON.stringify(finalCurrent)}`);
}

await new Promise((resolve) => setTimeout(resolve, 1500));
const snapshotMeta = await jsonCommand({ Command: "Device/GetScreenSnapshot", DeviceId: 300426474 });
const snapshotUrl = new URL(snapshotMeta.snapShotPath, `${base}/`);
const snapshotResponse = await fetch(snapshotUrl, { signal: AbortSignal.timeout(30_000) });
if (!snapshotResponse.ok) throw new Error(`Snapshot HTTP ${snapshotResponse.status}`);
fs.writeFileSync(files.snapshot, Buffer.from(await snapshotResponse.arrayBuffer()));

const report = {
  ok: true,
  device: base,
  clockId,
  timeFontId,
  skipFontRemap,
  fontReplacements: fontRemap.replacements,
  jpegProfiles,
  create: created,
  selectedAfterCreate: { ClockId: selectedAfterCreate.ClockId },
  share1,
  patch1: { ReturnCode: patch1.ReturnCode, ClockId: patch1.ClockId },
  patch2: { ReturnCode: patch2.ReturnCode, ClockId: patch2.ClockId },
  share2,
  share3,
  rollbackPatch: { ReturnCode: rollbackPatch.ReturnCode, ClockId: rollbackPatch.ClockId },
  rollbackShare,
  restorePatch: { ReturnCode: restorePatch.ReturnCode, ClockId: restorePatch.ClockId },
  restoreShare,
  final: { ClockId: finalCurrent.ClockId, ItemList: finalItems },
  snapshot: files.snapshot
};
fs.writeFileSync(files.report, JSON.stringify(report, null, 2), "utf8");
console.log(JSON.stringify(report, null, 2));
