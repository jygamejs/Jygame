export class ViewRegistry {
  constructor() {
    this._classes = new Map();
  }

  register(id, ViewClass) {
    if (this._classes.has(id)) {
      throw new Error(`View "${id}" is already registered`);
    }
    this._classes.set(id, ViewClass);
  }

  get(id) {
    return this._classes.get(id) ?? null;
  }

  has(id) {
    return this._classes.has(id);
  }

  forEach(fn) {
    this._classes.forEach((ViewClass, id) => fn(ViewClass, id));
  }

  get count() {
    return this._classes.size;
  }
}
