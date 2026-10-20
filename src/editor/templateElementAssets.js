/** New cache names cannot collide with files saved using the old 128-slot layout. */
export function templateElementAssetStem(slot) {
  return `astrotoo-${slot}`;
}

// Historical editor cache offsets. Keep stable so bundled and downloaded templates
// remain readable after syncing the current firmware's enum and 256-slot layout.
const LEGACY_OFFSETS = Object.freeze({
  13: 42, 18: 17, 46: 0, 47: 1, 48: 2, 55: 16, 57: 3, 58: 4,
  59: 11, 60: 12, 61: 13, 62: 14, 63: 15, 64: 18, 66: 22, 67: 23,
  68: 24, 69: 25, 70: 26, 71: 27, 72: 28, 73: 29, 74: 32, 78: 34,
  79: 35, 81: 36, 85: 37, 89: 38, 93: 39, 98: 43, 105: 44, 107: 45,
  108: 46, 124: 47, 125: 52, 126: 53, 127: 54, 128: 55, 129: 56, 130: 57,
  131: 6, 132: 7, 171: 48, 172: 30, 173: 49, 174: 50, 175: 51, 182: 33,
  206: 58, 207: 60, 208: 61, 209: 62, 210: 63, 211: 65, 212: 66, 217: 64,
  218: 59, 233: 5, 234: 82, 240: 19, 260: 21, 281: 67, 282: 68, 283: 69,
  284: 70, 285: 71, 286: 72, 287: 73, 288: 74, 289: 75, 290: 76, 297: 40,
  298: 41, 310: 31, 348: 77, 349: 78, 350: 79, 352: 80, 359: 81, 364: 10,
  390: 8, 391: 9, 394: 85, 395: 86, 396: 87, 403: 104, 421: 105, 423: 106,
  429: 88, 430: 89, 431: 90, 432: 91, 433: 92, 434: 93, 435: 94, 436: 95,
  437: 96, 438: 97, 439: 98, 440: 99, 441: 100, 442: 101, 443: 102, 444: 103,
  445: 20, 446: 83, 447: 84, 454: 108, 455: 107, 456: 109, 459: 110, 461: 111,
  462: 112, 463: 113, 464: 114, 470: 116, 471: 115, 472: 117, 473: 118, 475: 119,
  480: 124, 481: 120, 482: 122, 483: 123, 484: 121, 492: 125, 495: 128, 505: 126,
  508: 131, 510: 132, 511: 133, 513: 134, 514: 135, 515: 136, 523: 111, 527: 129,
  528: 130, 529: 137
});

export function legacyTemplateElementSlot(clockId, item) {
  const offset = LEGACY_OFFSETS[Number(item?.disp)];
  if (Number.isFinite(offset)) return Number(clockId) * 128 + offset + 1;
  const imageId = Number(item?.image_id);
  if (imageId > 0) return imageId <= 128 ? Number(clockId) * 128 + imageId : imageId;
  return null;
}
