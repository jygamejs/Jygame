export class PersistenceManager {
  constructor(storage, prefix = "") {
    this._storage = storage;
    this._prefix = prefix;
  }

  load(key) {
    try {
      const raw = this._storage.getItem(this._prefix + key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  save(key, data) {
    this._storage.setItem(this._prefix + key, JSON.stringify(data));
  }

  remove(key) {
    this._storage.removeItem(this._prefix + key);
  }
}
