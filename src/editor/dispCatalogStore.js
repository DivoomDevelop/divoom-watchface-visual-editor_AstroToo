import { mergeDispCatalog, normalizeDispCatalogPayload } from "./dispCloudSync.js";

export class DispCatalogStore {
  /** @param {() => string} getLocaleCode */
  constructor(getLocaleCode, onChanged) {
    this.getLocaleCode = getLocaleCode;
    this.onChanged = onChanged;
    /** @type {Map<number, object>} */
    this.byId = new Map();
    /** @type {Array<object>} */
    this.classifyList = [];
    this.syncedAt = "";
  }

  /** @param {Record<string, unknown>|null|undefined} raw */
  loadFromCfg(raw) {
    const catalog = normalizeDispCatalogPayload(raw || {});
    this.byId = new Map(catalog.DispList.map((row) => [row.id, row]));
    this.classifyList = catalog.ClassifyList;
    this.syncedAt = catalog.syncedAt || "";
    if (typeof this.onChanged === "function") this.onChanged();
  }

  /** @param {ReturnType<typeof normalizeDispCatalogPayload>} remote @param {Record<string, unknown>|null} local */
  mergeRemote(remote, local) {
    const merged = mergeDispCatalog(local, remote);
    this.loadFromCfg(merged);
    return merged;
  }

  getMeta(dispId) {
    const id = Number(dispId);
    if (!Number.isFinite(id)) return null;
    return this.byId.get(id) || null;
  }

  getAllMetas() {
    return [...this.byId.values()].sort((a, b) => a.id - b.id);
  }

  /** 中文 Name，英文 NameEn */
  getDisplayName(dispId) {
    const meta = this.getMeta(dispId);
    if (!meta) return "";
    const locale = String(this.getLocaleCode?.() || "").toLowerCase();
    if (locale.startsWith("zh")) {
      return meta.name || meta.nameEn || "";
    }
    return meta.nameEn || meta.name || "";
  }

  getClassifyLabel(classify) {
    if (!classify) return "";
    const locale = String(this.getLocaleCode?.() || "").toLowerCase();
    if (locale.startsWith("zh")) {
      return classify.name || classify.nameEn || "";
    }
    return classify.nameEn || classify.name || "";
  }

  hasCatalog() {
    return this.byId.size > 0;
  }
}
