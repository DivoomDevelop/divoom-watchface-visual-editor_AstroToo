/** 将 font 字段值（ID 或名称）解析为模拟器 font ID。 */

export function normalizeFontLookupKey(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/**
 * @param {Array<{ id: number, name?: string }>} metas
 */
export function buildFontLookup(metas) {
  /** @type {Map<string, number>} */
  const byExactName = new Map();
  /** @type {{ id: number, name: string, key: string }[]} */
  const namedList = [];

  for (const meta of metas || []) {
    const id = Number(meta?.id);
    if (!Number.isFinite(id) || id <= 0) continue;
    const name = String(meta?.name ?? "").trim();
    if (!name) continue;
    const key = normalizeFontLookupKey(name);
    if (!key) continue;
    if (!byExactName.has(key)) byExactName.set(key, id);
    namedList.push({ id, name, key });
  }

  return { byExactName, namedList };
}

/**
 * @param {string} name
 * @param {ReturnType<typeof buildFontLookup>} lookup
 */
export function lookupFontIdByName(name, lookup) {
  const key = normalizeFontLookupKey(name);
  if (!key || !lookup) return NaN;
  if (lookup.byExactName.has(key)) return lookup.byExactName.get(key);

  const matches = lookup.namedList.filter((row) => row.key.includes(key) || key.includes(row.key));
  if (matches.length === 1) return matches[0].id;
  return NaN;
}

/**
 * @param {unknown} value
 * @param {ReturnType<typeof buildFontLookup>} lookup
 */
export function resolveFontIdFromValue(value, lookup) {
  if (value === undefined || value === null || value === "") return NaN;
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? value : NaN;
  }

  const text = String(value).trim();
  if (!text) return NaN;
  if (/^\d+$/.test(text)) {
    const n = Number(text);
    return Number.isFinite(n) && n > 0 ? n : NaN;
  }
  return lookupFontIdByName(text, lookup);
}

/**
 * ItemList 条目：支持 font 为 ID 或名称，也支持 font_name / FontName 等字段。
 * @param {Record<string, unknown>|null|undefined} item
 * @param {ReturnType<typeof buildFontLookup>} lookup
 */
export function resolveItemFontFields(item, lookup) {
  if (!item || typeof item !== "object") return 0;

  const nameFields = [item.font_name, item.FontName, item.fontName, item.Font_name];
  for (const value of nameFields) {
    const id = resolveFontIdFromValue(value, lookup);
    if (Number.isFinite(id) && id > 0) return id;
  }

  const idFields = [item.font, item.Font, item.font_id, item.FontId];
  for (const value of idFields) {
    const id = resolveFontIdFromValue(value, lookup);
    if (Number.isFinite(id) && id > 0) return id;
  }

  return 0;
}

/**
 * @param {Record<string, unknown>|null|undefined} item
 * @param {ReturnType<typeof buildFontLookup>} lookup
 */
export function unresolvedFontLabel(item) {
  if (!item || typeof item !== "object") return "";
  const candidates = [
    item.font_name,
    item.FontName,
    item.fontName,
    item.font,
    item.Font
  ];
  for (const value of candidates) {
    if (value === undefined || value === null || value === "") continue;
    if (typeof value === "number") continue;
    const text = String(value).trim();
    if (text && !/^\d+$/.test(text)) return text;
  }
  return "";
}
