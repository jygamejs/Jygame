import { Pool } from "./Pool.js";

// Each pooled object carries internal fields:
//   obj.__jygamePoolActive  — true while acquired (in active list)
//   obj.__jygamePoolIndex   — index in _active array (for O(1) release)
// These are reserved. Do not read, write, or override them.

export class ActivePool {
  constructor({ create, reset, initialSize = 0, maxSize = Infinity } = {}) {
    this._pool = new Pool({ create, reset, initialSize: 0, maxSize });
    this._active = [];
    this._totalCreated = 0;
    this._peakActive = 0;
    this._peakCapacity = 0;
    this._peakFree = 0;

    if (initialSize > 0) {
      this._pool.grow(initialSize);
      this._totalCreated += initialSize;
      this._peakCapacity = initialSize;
      this._peakFree = initialSize;
    }
  }

  /** Number of objects currently acquired (in use). */
  get activeCount() {
    return this._active.length;
  }

  /** Number of objects sitting in the free pool (available for reuse). */
  get freeCount() {
    return this._pool.size;
  }

  /** Total managed objects: active + free. */
  get capacity() {
    return this.activeCount + this.freeCount;
  }

  /** Alias for freeCount (Pool compatibility). */
  get size() {
    return this.freeCount;
  }

  /** Total objects ever allocated (debugging / pool pressure). */
  get totalCreated() {
    return this._totalCreated;
  }

  /** Highest activeCount ever reached. */
  get peakActive() {
    return this._peakActive;
  }

  /** Highest capacity ever reached (active + free). */
  get peakCapacity() {
    return this._peakCapacity;
  }

  /** Highest freeCount ever reached. Useful for tuning warmup sizes. */
  get peakFree() {
    return this._peakFree;
  }

  /**
   * Direct read-only reference to the active objects array.
   * Do NOT push, pop, splice, or mutate this array directly.
   * Use acquire() / release() / releaseInactive() / clearActive() instead.
   */
  get activeObjects() {
    return this._active;
  }

  /**
   * Check whether an object is currently acquired from this pool.
   * Preferred over reading __jygamePoolActive directly.
   */
  isActive(obj) {
    return !!obj.__jygamePoolActive;
  }

  /**
   * Acquire one object from the pool.
   * Reuses a free object if available; otherwise creates a new one.
   */
  acquire(...args) {
    const beforeFree = this._pool.size;
    const obj = this._pool.acquire(...args);
    if (this._pool.size >= beforeFree) {
      this._totalCreated++;
    }
    obj.__jygamePoolActive = true;
    obj.__jygamePoolIndex = this._active.length;
    this._active.push(obj);
    if (this._active.length > this._peakActive) {
      this._peakActive = this._active.length;
    }
    const cap = this.capacity;
    if (cap > this._peakCapacity) this._peakCapacity = cap;
    return obj;
  }

  /**
   * Release one object back to the pool.
   * O(1) — uses __jygamePoolIndex for direct array removal.
   * Returns true on success, false if the object was not acquired.
   */
  release(obj) {
    if (!obj.__jygamePoolActive) return false;
    const idx = obj.__jygamePoolIndex;
    if (idx < 0 || idx >= this._active.length || this._active[idx] !== obj) {
      return false;
    }
    const last = this._active.pop();
    if (idx < this._active.length) {
      this._active[idx] = last;
      last.__jygamePoolIndex = idx;
    }
    obj.__jygamePoolActive = false;
    obj.__jygamePoolIndex = -1;
    this._pool.release(obj);
    if (this.freeCount > this._peakFree) this._peakFree = this.freeCount;
    return true;
  }

  /**
   * Batch-acquire N objects.
   *
   * All forms work:
   *   const arr = pool.acquireMany(100);
   *   pool.acquireMany(100, tempArray);
   *   pool.acquireMany(100, tempArray, b => { b.x = x; b.y = y; });
   *   pool.acquireMany(100, null, b => { b.reset(); });
   *
   * The optional init callback is called immediately after each acquire
   * with (obj, index). No extra allocations.
   */
  acquireMany(count, out, init) {
    const result = out || new Array(count);
    for (let i = 0; i < count; i++) {
      const obj = this.acquire();
      result[i] = obj;
      if (init) init(obj, i);
    }
    return result;
  }

  /**
   * Release multiple objects at once.
   * Accepts any iterable (Array, Set, custom iterable).
   * Returns the number of objects successfully released.
   */
  releaseMany(objects) {
    let released = 0;
    for (const obj of objects) {
      if (this.release(obj)) released++;
    }
    return released;
  }

  /**
   * Iterate every active object. Callback receives (obj, index).
   * Safe for read / render usage.
   */
  forEachActive(fn) {
    for (let i = 0; i < this._active.length; i++) {
      fn(this._active[i], i);
    }
  }

  /**
   * Iterate every active object for mutation (update / physics).
   * Callback receives (obj, index).
   * Semantically identical to forEachActive; use to clarify intent.
   */
  updateActive(fn) {
    for (let i = 0; i < this._active.length; i++) {
      fn(this._active[i], i);
    }
  }

  /**
   * Release every active object that matches the predicate.
   * Iterates backward so removal is safe.
   * Convenience helper — for maximum performance at scale,
   * iterate activeObjects directly and implement custom removal.
   */
  releaseInactive(predicate) {
    const active = this._active;
    const pool = this._pool;
    for (let i = active.length - 1; i >= 0; i--) {
      const obj = active[i];
      if (predicate(obj)) {
        const last = active.pop();
        if (i < active.length) {
          active[i] = last;
          last.__jygamePoolIndex = i;
        }
        obj.__jygamePoolActive = false;
        obj.__jygamePoolIndex = -1;
        pool.release(obj);
      }
    }
    if (this.freeCount > this._peakFree) this._peakFree = this.freeCount;
  }

  /**
   * Release every active object (fast scene cleanup).
   * Resets all objects, then clears the active array in one step.
   * Errors during reset are intentionally allowed to surface.
   */
  clearActive() {
    const active = this._active;
    const pool = this._pool;
    for (let i = 0; i < active.length; i++) {
      const obj = active[i];
      obj.__jygamePoolActive = false;
      obj.__jygamePoolIndex = -1;
      pool.release(obj);
    }
    active.length = 0;
    if (this.freeCount > this._peakFree) this._peakFree = this.freeCount;
  }

  /**
   * Pre-warm the pool by creating N objects in advance.
   * All warmup objects sit in the free pool ready for acquire().
   */
  warmup(count) {
    this._pool.grow(count);
    this._totalCreated += count;
    const cap = this.capacity;
    if (cap > this._peakCapacity) this._peakCapacity = cap;
    if (this.freeCount > this._peakFree) this._peakFree = this.freeCount;
  }
}
