export class ObjectPool {
  constructor(createFn, options = {}) {
    if (typeof createFn !== "function") {
      throw new Error("ObjectPool requires a factory function");
    }
    this._create = createFn;
    this._maxSize = options.maxSize ?? 64;
    this._free = [];
    this._created = 0;
    this._acquired = 0;
    this._released = 0;
    this._evicted = 0;
  }

  acquire() {
    if (this._free.length > 0) {
      this._acquired++;
      return this._free.pop();
    }
    this._created++;
    this._acquired++;
    return this._create();
  }

  release(obj) {
    this._released++;
    if (this._maxSize > 0 && this._free.length >= this._maxSize) {
      this._evicted++;
      return true;
    }
    this._free.push(obj);
    return false;
  }

  drain() {
    for (let i = 0; i < this._free.length; i++) {
      const item = this._free[i];
      if (typeof item.destroy === "function") item.destroy();
    }
    this._free.length = 0;
  }

  get freeCount() { return this._free.length; }
  get created() { return this._created; }
  get acquired() { return this._acquired; }
  get released() { return this._released; }
  get evicted() { return this._evicted; }
}
