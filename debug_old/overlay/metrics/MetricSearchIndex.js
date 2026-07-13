export class MetricSearchIndex {
  constructor(registry) {
    this._entries = [];
    this._rebuild(registry);
  }

  _rebuild(registry) {
    this._entries = [];
    registry.forEach(desc => {
      this._entries.push({
        id: desc.id,
        name: desc.name,
        displayName: desc.displayName?.toLowerCase() || "",
        description: desc.description?.toLowerCase() || "",
        tags: (desc.tags || []).map(t => t.toLowerCase()),
        normalizedName: desc.name.toLowerCase(),
        category: desc.category,
        type: desc.type,
        group: desc.group,
      });
    });
  }

  search(query, filters = {}) {
    if (query && query.startsWith("/")) {
      return this._regexSearch(query, filters);
    }

    if (!query && filters.type == null && !filters.categories?.length && !filters.group) {
      return this._entries;
    }

    const q = query ? query.toLowerCase() : "";

    return this._entries.filter(e => {
      if (filters.type != null && e.type !== filters.type) return false;
      if (filters.categories?.length && !filters.categories.includes(e.category)) return false;
      if (filters.group && e.group !== filters.group) return false;
      if (filters.dynamicOnly && !e.name.startsWith("_dynamic_")) return false;
      if (!query) return true;

      if (e.normalizedName === q) return true;
      if (e.normalizedName.startsWith(q)) return true;
      if (e.normalizedName.includes(q)) return true;
      if (e.displayName.includes(q)) return true;
      if (e.description.includes(q)) return true;
      if (e.tags.some(t => t.includes(q))) return true;
      return false;
    });
  }

  _regexSearch(query, filters) {
    const pattern = query.slice(1, query.endsWith("/") ? -1 : undefined);
    let re;
    try { re = new RegExp(pattern, "i"); }
    catch { return []; }
    return this._entries.filter(e => {
      if (filters.type != null && e.type !== filters.type) return false;
      if (filters.categories?.length && !filters.categories.includes(e.category)) return false;
      return re.test(e.normalizedName) || re.test(e.displayName);
    });
  }

  rebuild(registry) {
    this._rebuild(registry);
  }
}
