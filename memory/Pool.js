// Objects in the free pool carry a flag:
//   obj.__jygamePooled — true while sitting in the free list
// This is reserved. Do not read, write, or override it.

export class Pool {
  constructor({ create, reset, initialSize = 0, maxSize = Infinity } = {}) {
    if (typeof create !== "function") {
      throw new Error("Pool requires a `create` factory function");
    }
    this._create = create;
    this._reset = typeof reset === "function" ? reset : () => {};
    this._maxSize = maxSize;
    this._pool = [];
    this._capacity = 0;

    if (initialSize > 0) {
      this.grow(initialSize);
    }
  }

  acquire(...args) {
    if (this._pool.length > 0) {
      const obj = this._pool.pop();
      obj.__jygamePooled = false;
      return obj;
    }
    this._capacity++;
    return this._create(...args);
  }

  release(obj) {
    if (obj.__jygamePooled) return;
    if (this._pool.length >= this._maxSize) return;
    this._reset(obj);
    obj.__jygamePooled = true;
    this._pool.push(obj);
  }

  /** Number of objects available for reuse in the free list. */
  get size() {
    return this._pool.length;
  }

  /** Total managed objects (free + in-use). Grows on create, resets on drain. */
  get capacity() {
    return this._capacity;
  }

  grow(n) {
    for (let i = 0; i < n; i++) {
      const obj = this._create();
      this._reset(obj);
      obj.__jygamePooled = true;
      this._pool.push(obj);
    }
    this._capacity += n;
  }

  drain() {
    this._pool = [];
    this._capacity = 0;
  }
}
