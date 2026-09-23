function asFontId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : 0;
}

function isAvailableLocally(row) {
  const value = row?.AvailableLocally ?? row?.availableLocally;
  return value === true || value === 1 || value === "1";
}

/**
 * Replace font IDs removed from the device's current catalogue.  Prefer an
 * already-downloaded font of the same type, then any font of the same type,
 * then any already-downloaded font.  This keeps old local watchfaces usable
 * after the service retires a font ID.
 */
export function remapUnavailableItemFonts(items, deviceFontRows, localFontRows = []) {
  const fonts = (Array.isArray(deviceFontRows) ? deviceFontRows : [])
    .map((row) => ({
      id: asFontId(row?.id ?? row?.ID),
      type: Number(row?.type ?? row?.Type ?? 1),
      local: isAvailableLocally(row)
    }))
    .filter((row) => row.id > 0);
  const validIds = new Set(fonts.map((row) => row.id));
  const localTypeById = new Map(
    (Array.isArray(localFontRows) ? localFontRows : [])
      .map((row) => [asFontId(row?.id ?? row?.ID), Number(row?.type ?? row?.Type ?? 1)])
      .filter(([id]) => id > 0)
  );
  const replacements = [];
  const remapped = (Array.isArray(items) ? items : []).map((raw, index) => {
    const item = { ...raw };
    const requested = asFontId(item.font);
    if (!requested || validIds.has(requested)) return item;

    const requestedType = localTypeById.get(requested);
    const candidates = [...fonts].sort((a, b) => {
      const aScore = (a.type === requestedType ? 4 : 0) + (a.local ? 2 : 0);
      const bScore = (b.type === requestedType ? 4 : 0) + (b.local ? 2 : 0);
      return bScore - aScore || a.id - b.id;
    });
    if (!candidates.length) {
      throw new Error(`device has no usable font for removed font ${requested}`);
    }
    item.font = candidates[0].id;
    replacements.push({ index, from: requested, to: item.font });
    return item;
  });
  return { items: remapped, replacements };
}
