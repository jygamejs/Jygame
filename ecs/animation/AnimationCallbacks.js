export class AnimationCallbacks {
  constructor() {
    this._byEntity = new Map();
  }

  set(entity, callback) {
    if (typeof callback !== "function") {
      throw new TypeError(
        `AnimationCallbacks.set failed: callback must be a function, got ${typeof callback}.`
      );
    }
    this._byEntity.set(entity, callback);
    return this;
  }

  get(entity) {
    return this._byEntity.get(entity) ?? null;
  }

  has(entity) {
    return this._byEntity.has(entity);
  }

  delete(entity) {
    this._byEntity.delete(entity);
  }

  get size() {
    return this._byEntity.size;
  }
}
