const FREE = 0;
const LIVE = 1;
const RETIRED = 2;

export class TextResourcePool {
  static SLOT_BITS = 16;
  static SLOT_MASK = 0xFFFF;
  static GEN_MAX = 0xFFFF;

  constructor(initialCapacity = 16) {
    if (typeof initialCapacity !== "number" || !Number.isInteger(initialCapacity) || initialCapacity < 1) {
      throw new RangeError(
        `TextResourcePool constructor failed: initialCapacity must be a positive integer, got ${initialCapacity}.`
      );
    }

    this._capacity = initialCapacity;
    this._count = 1;
    this._freeCount = 0;

    this._generation = new Uint16Array(initialCapacity);
    this._inUse = new Uint8Array(initialCapacity);
    this._freeList = new Uint32Array(initialCapacity);
    this._content = new Array(initialCapacity).fill(null);
    this._layout = new Array(initialCapacity).fill(null);
  }

  get capacity() {
    return this._capacity;
  }

  get liveCount() {
    let n = 0;
    const inUse = this._inUse;
    for (let i = 1; i < this._count; i++) {
      if (inUse[i] === LIVE) n++;
    }
    return n;
  }

  allocate(content) {
    if (typeof content !== "string") {
      throw new TypeError(
        `TextResourcePool.allocate failed: content must be a string, got ${typeof content}.`
      );
    }

    let slot;
    if (this._freeCount > 0) {
      slot = this._freeList[--this._freeCount];
    } else {
      if (this._count >= this._capacity) {
        this._grow();
      }
      slot = this._count++;
    }

    this._inUse[slot] = LIVE;
    this._content[slot] = content;
    this._layout[slot] = null;
    return (this._generation[slot] << TextResourcePool.SLOT_BITS) | slot;
  }

  release(handle) {
    const slot = handle & TextResourcePool.SLOT_MASK;
    if (slot === 0) return false;
    if (this._generation[slot] !== (handle >>> TextResourcePool.SLOT_BITS)) return false;
    if (this._inUse[slot] !== LIVE) return false;

    this._content[slot] = null;
    this._layout[slot] = null;

    if (this._generation[slot] === TextResourcePool.GEN_MAX) {
      this._inUse[slot] = RETIRED;
      return true;
    }

    this._generation[slot] += 1;
    this._inUse[slot] = FREE;
    this._freeList[this._freeCount++] = slot;
    return true;
  }

  get(handle) {
    const slot = handle & TextResourcePool.SLOT_MASK;
    if (slot === 0) return null;
    if (this._generation[slot] !== (handle >>> TextResourcePool.SLOT_BITS)) return null;
    if (this._inUse[slot] !== LIVE) return null;
    return this._content[slot];
  }

  setContent(handle, content) {
    const slot = handle & TextResourcePool.SLOT_MASK;
    if (slot === 0) return false;
    if (this._generation[slot] !== (handle >>> TextResourcePool.SLOT_BITS)) return false;
    if (this._inUse[slot] !== LIVE) return false;
    this._content[slot] = content;
    return true;
  }

  _grow() {
    const newCap = this._capacity * 2;

    const newGen = new Uint16Array(newCap);
    newGen.set(this._generation);

    const newInUse = new Uint8Array(newCap);
    newInUse.set(this._inUse);

    const newFree = new Uint32Array(newCap);
    newFree.set(this._freeList.subarray(0, this._freeCount));

    const newContent = new Array(newCap);
    for (let i = 0; i < this._count; i++) newContent[i] = this._content[i];
    newContent.fill(null, this._count);

    const newLayout = new Array(newCap);
    for (let i = 0; i < this._count; i++) newLayout[i] = this._layout[i];
    newLayout.fill(null, this._count);

    this._generation = newGen;
    this._inUse = newInUse;
    this._freeList = newFree;
    this._content = newContent;
    this._layout = newLayout;
    this._capacity = newCap;
  }
}