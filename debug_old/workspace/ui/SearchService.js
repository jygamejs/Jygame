export class SearchService {
  constructor() {
    this._providers = new Map();
    this._open = false;
    this._query = "";
    this._results = [];
    this._selectedIndex = -1;
  }

  get isOpen() { return this._open; }
  get query() { return this._query; }
  get results() { return this._results; }
  get selectedIndex() { return this._selectedIndex; }

  registerProvider(provider) {
    if (this._providers.has(provider.id)) {
      throw new Error(`Search provider "${provider.id}" is already registered`);
    }
    this._providers.set(provider.id, provider);
  }

  unregisterProvider(id) {
    this._providers.delete(id);
  }

  getProvider(id) {
    return this._providers.get(id) || null;
  }

  search(query) {
    this._query = query;
    if (!query || !query.trim()) {
      this._results = [];
      this._selectedIndex = -1;
      return [];
    }
    const results = [];
    for (const provider of this._providers.values()) {
      if (typeof provider.search === "function") {
        const items = provider.search(query);
        if (Array.isArray(items)) {
          items.forEach(item => {
            results.push({ providerId: provider.id, ...item });
          });
        }
      }
    }
    this._results = results;
    this._selectedIndex = results.length > 0 ? 0 : -1;
    return results;
  }

  open() {
    this._open = true;
    this._query = "";
    this._results = [];
    this._selectedIndex = -1;
  }

  close() {
    this._open = false;
    this._query = "";
    this._results = [];
    this._selectedIndex = -1;
  }

  toggle() {
    if (this._open) this.close();
    else this.open();
  }
}
