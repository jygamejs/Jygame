const STORAGE_KEYS = {
  settings: "jygame:overlay:settings",
  layout: "jygame:overlay:layout",
  favorites: "jygame:overlay:favorites",
};

export class PersistenceManager {
  constructor(storage) {
    this._store = storage || new Map();
  }

  _get(key) {
    const k = STORAGE_KEYS[key];
    try {
      const raw = typeof this._store.getItem === "function"
        ? this._store.getItem(k)
        : this._store.get(k);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  _set(key, data) {
    const k = STORAGE_KEYS[key];
    const json = JSON.stringify(data);
    if (typeof this._store.setItem === "function") {
      this._store.setItem(k, json);
    } else {
      this._store.set(k, json);
    }
  }

  loadSettings() { return this._get("settings"); }
  saveSettings(data) { this._set("settings", data); }

  loadLayout() { return this._get("layout"); }
  saveLayout(data) { this._set("layout", data); }

  loadFavorites() { return this._get("favorites"); }
  saveFavorites(data) { this._set("favorites", data); }
}
