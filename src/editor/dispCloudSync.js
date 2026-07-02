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
  const sourceList = Array.isArray(raw?.DispItemList)
    ? raw.DispItemList
    : Array.isArray(raw?.dispItemList)
      ? raw.dispItemList
      : [];
  const dispItemList = sourceList
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
  const classifyList = (Array.isArray(data?.ClassifyList) ? data.ClassifyList : []).map((row) =>
    normalizeClassifyEntry(row)
  );
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

/** GetDispItemList 请求体：AllFlag=1 返回全部分类与条目（含未开放）。 */
export const GET_DISP_ITEM_LIST_PAYLOAD = { ClassifyList: [], AllFlag: 1 };

export async function fetchDispItemList(storeJson) {
  const data = await storeJson("Device/GetDispItemList", GET_DISP_ITEM_LIST_PAYLOAD);
  return normalizeDispCatalogPayload(data);
}

/** 远程 API 目录原样写入 cfg / 运行时（不做 OpenStatus 或分类过滤）。 */
export function remoteDispCatalogToCfg(remote) {
  return dispCatalogToCfgShape({
    syncedAt: remote.syncedAt,
    ClassifyList: remote.ClassifyList
  });
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

/**
 * 对比本地与远程目录，统计本次同步实际变更量（非合并后的总数）。
 * @param {Record<string, unknown>|null} localInfo
 * @param {ReturnType<typeof normalizeDispCatalogPayload>} remote
 */
export function summarizeDispCatalogSync(localInfo, remote) {
  const localNorm = localInfo ? normalizeDispCatalogPayload(localInfo) : { DispList: [] };
  const localById = new Map(localNorm.DispList.map((row) => [row.id, row]));
  let added = 0;
  let updated = 0;
  let unchanged = 0;
  for (const row of remote.DispList) {
    const prev = localById.get(row.id);
    if (!prev) {
      added += 1;
      continue;
    }
    const changed =
      prev.name !== row.name ||
      prev.nameEn !== row.nameEn ||
      prev.desc !== row.desc ||
      prev.openStatus !== row.openStatus ||
      prev.classifyId !== row.classifyId ||
      prev.classifyName !== row.classifyName ||
      prev.classifyNameEn !== row.classifyNameEn;
    if (changed) updated += 1;
    else unchanged += 1;
  }
  return {
    total: remote.DispList.length,
    added,
    updated,
    unchanged,
    localTotal: localNorm.DispList.length
  };
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
