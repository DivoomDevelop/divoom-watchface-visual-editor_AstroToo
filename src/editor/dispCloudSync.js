/** Device/GetDispItemList — doc.divoom-gz.com page_id=620 */

/**
 * @param {unknown} raw
 * @returns {{ id: number, rowId: number, name: string, nameEn: string, desc: string, openStatus: number } | null}
 */
export function normalizeDispItemEntry(raw) {
  const id = Number(raw?.ItemId ?? raw?.itemId ?? raw?.id ?? raw?.ID);
  if (!Number.isFinite(id) || id <= 0) return null;
  return {
    id,
    rowId: Number(raw?.ID ?? raw?.id ?? 0) || 0,
    name: String(raw?.Name ?? raw?.name ?? "").trim(),
    nameEn: String(raw?.NameEn ?? raw?.nameEn ?? "").trim(),
    desc: String(raw?.Desc ?? raw?.desc ?? "").trim(),
    openStatus: Number(raw?.OpenStatus ?? raw?.openStatus ?? 1)
  };
}

/**
 * @param {unknown} raw
 */
export function normalizeClassifyEntry(raw) {
  const id = Number(raw?.ID ?? raw?.id ?? raw?.ClassifyId ?? 0);
  const dispItemList = (Array.isArray(raw?.DispItemList) ? raw.DispItemList : [])
    .map((row) => normalizeDispItemEntry(row))
    .filter(Boolean);
  return {
    id,
    name: String(raw?.Name ?? raw?.name ?? "").trim(),
    nameEn: String(raw?.NameEn ?? raw?.nameEn ?? "").trim(),
    dispItemList
  };
}

/**
 * @param {Record<string, unknown>} data
 */
export function normalizeDispCatalogPayload(data) {
  const classifyList = (Array.isArray(data?.ClassifyList) ? data.ClassifyList : [])
    .map((row) => normalizeClassifyEntry(row))
    .filter((row) => row.dispItemList.length > 0 || row.name || row.nameEn);
  const byId = new Map();
  for (const cls of classifyList) {
    for (const item of cls.dispItemList) {
      byId.set(item.id, {
        ...item,
        classifyId: cls.id,
        classifyName: cls.name,
        classifyNameEn: cls.nameEn
      });
    }
  }
  return {
    syncedAt: String(data?.syncedAt || new Date().toISOString()),
    ClassifyList: classifyList,
    DispList: [...byId.values()].sort((a, b) => a.id - b.id)
  };
}

export async function fetchDispItemList(storeJson) {
  const data = await storeJson("Device/GetDispItemList", { ClassifyList: [] });
  return normalizeDispCatalogPayload(data);
}

/**
 * 合并远程目录与本地 disp_info.cfg（远程 Name/NameEn 优先）。
 * @param {Record<string, unknown>|null} localInfo
 * @param {ReturnType<typeof normalizeDispCatalogPayload>} remote
 */
export function mergeDispCatalog(localInfo, remote) {
  const localNorm = localInfo ? normalizeDispCatalogPayload(localInfo) : { ClassifyList: [], DispList: [] };
  const byId = new Map(localNorm.DispList.map((row) => [row.id, row]));
  for (const row of remote.DispList) {
    byId.set(row.id, { ...byId.get(row.id), ...row });
  }

  const classifyById = new Map(localNorm.ClassifyList.map((row) => [row.id, row]));
  for (const cls of remote.ClassifyList) {
    const prev = classifyById.get(cls.id);
    if (!prev) {
      classifyById.set(cls.id, cls);
      continue;
    }
    const itemsById = new Map(prev.dispItemList.map((row) => [row.id, row]));
    for (const item of cls.dispItemList) {
      itemsById.set(item.id, { ...itemsById.get(item.id), ...item });
    }
    classifyById.set(cls.id, {
      ...prev,
      ...cls,
      dispItemList: [...itemsById.values()].sort((a, b) => a.id - b.id)
    });
  }

  const classifyList = [...classifyById.values()].sort((a, b) => a.id - b.id);
  return normalizeDispCatalogPayload({
    syncedAt: remote.syncedAt,
    ClassifyList: classifyList.map((cls) => ({
      ID: cls.id,
      Name: cls.name,
      NameEn: cls.nameEn,
      DispItemList: cls.dispItemList.map((item) => ({
        ID: item.rowId,
        ItemId: item.id,
        Name: item.name,
        NameEn: item.nameEn,
        Desc: item.desc,
        OpenStatus: item.openStatus
      }))
    }))
  });
}

export function dispCatalogToCfgShape(catalog) {
  return {
    syncedAt: catalog.syncedAt,
    ClassifyList: catalog.ClassifyList.map((cls) => ({
      ID: cls.id,
      Name: cls.name,
      NameEn: cls.nameEn,
      DispItemList: cls.dispItemList.map((item) => ({
        ID: item.rowId,
        ItemId: item.id,
        Name: item.name,
        NameEn: item.nameEn,
        Desc: item.desc,
        OpenStatus: item.openStatus
      }))
    }))
  };
}
