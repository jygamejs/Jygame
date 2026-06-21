import { ParticleStorage } from "./ParticleStorage.js";
import { SoAParticleAccessor } from "../accessors/SoAParticleAccessor.js";

let _nextId = 1;

const TYPED_ARRAYS = [
  ['_x', Float32Array],
  ['_y', Float32Array],
  ['_vx', Float32Array],
  ['_vy', Float32Array],
  ['_ax', Float32Array],
  ['_ay', Float32Array],
  ['_life', Float32Array],
  ['_maxLife', Float32Array],
  ['_ageRatio', Float32Array],
  ['_size', Float32Array],
  ['_rotation', Float32Array],
  ['_rotationSpeed', Float32Array],
  ['_alpha', Float32Array],
  ['_depth', Float32Array],
  ['_r', Uint8Array],
  ['_g', Uint8Array],
  ['_b', Uint8Array],
  ['_id', Int32Array],
];

export class SoAParticleStorage extends ParticleStorage {
  constructor({ capacity = 1000 } = {}) {
    super();
    this._capacity = capacity;

    for (const [name, Ctor] of TYPED_ARRAYS) {
      this[name] = new Ctor(capacity);
    }

    this._accessors = new Array(capacity);
    for (let i = 0; i < capacity; i++) {
      this._accessors[i] = new SoAParticleAccessor(this, i);
    }

    this._freeList = new Array(capacity);
    for (let i = 0; i < capacity; i++) {
      this._freeList[i] = capacity - 1 - i;
    }
    this._freeCount = capacity;

    this._activeAccessors = [];

    this._peakActive = 0;
    this._peakFree = capacity;
    this._peakCapacity = capacity;
    this._totalCreated = 0;

    for (let i = 0; i < capacity; i++) {
      this._resetSlot(i);
    }
  }

  _resetSlot(i) {
    this._x[i] = 0;
    this._y[i] = 0;
    this._vx[i] = 0;
    this._vy[i] = 0;
    this._ax[i] = 0;
    this._ay[i] = 0;
    this._life[i] = 0;
    this._maxLife[i] = 0;
    this._ageRatio[i] = 0;
    this._size[i] = 1;
    this._rotation[i] = 0;
    this._rotationSpeed[i] = 0;
    this._alpha[i] = 1;
    this._depth[i] = 0;
    this._r[i] = 255;
    this._g[i] = 255;
    this._b[i] = 255;
    this._id[i] = 0;
    this._accessors[i].reset();
  }

  _grow() {
    const oldCap = this._capacity;
    const newCap = oldCap * 2;

    for (const [name, Ctor] of TYPED_ARRAYS) {
      const old = this[name];
      const next = new Ctor(newCap);
      next.set(old.subarray(0, oldCap));
      this[name] = next;
    }

    const oldAccessors = this._accessors;
    const newAccessors = new Array(newCap);
    for (let i = 0; i < oldCap; i++) {
      newAccessors[i] = oldAccessors[i];
    }
    for (let i = oldCap; i < newCap; i++) {
      newAccessors[i] = new SoAParticleAccessor(this, i);
    }
    this._accessors = newAccessors;
    for (let i = oldCap; i < newCap; i++) {
      this._resetSlot(i);
    }

    const newSlotCount = newCap - oldCap;
    for (let i = 0; i < newSlotCount; i++) {
      this._freeList[this._freeCount + i] = oldCap + i;
    }
    this._freeCount += newSlotCount;

    this._capacity = newCap;
    if (newCap > this._peakCapacity) this._peakCapacity = newCap;
  }

  acquire() {
    if (this._freeCount === 0) {
      this._grow();
    }

    const top = this._freeCount - 1;
    const i = this._freeList[top];
    this._freeCount = top;

    const acc = this._accessors[i];
    acc.__jygameId = _nextId++;
    acc._activeIndex = this._activeAccessors.length;
    this._activeAccessors.push(acc);

    this._totalCreated++;

    const newActive = this._capacity - this._freeCount;
    if (newActive > this._peakActive) {
      this._peakActive = newActive;
    }

    return acc;
  }

  release(acc) {
    const idx = acc._activeIndex;
    if (idx < 0 || idx >= this._activeAccessors.length) return;
    if (this._activeAccessors[idx] !== acc) return;

    const last = this._activeAccessors.pop();
    if (idx < this._activeAccessors.length) {
      this._activeAccessors[idx] = last;
      last._activeIndex = idx;
    }
    acc._activeIndex = -1;

    this._freeList[this._freeCount] = acc._i;
    this._freeCount++;

    this._resetSlot(acc._i);
  }

  clear() {
    for (let i = 0; i < this._activeAccessors.length; i++) {
      const acc = this._activeAccessors[i];
      acc._activeIndex = -1;
      this._resetSlot(acc._i);
    }
    this._activeAccessors.length = 0;

    this._freeList.length = 0;
    for (let i = 0; i < this._capacity; i++) {
      this._freeList[i] = this._capacity - 1 - i;
    }
    this._freeCount = this._capacity;
  }

  warmup(count) {
    const limit = Math.min(count, this._capacity);
    for (let i = 0; i < limit; i++) {
      this._resetSlot(i);
    }
  }

  get activeParticles() {
    return this._activeAccessors;
  }

  get activeCount() {
    return this._activeAccessors.length;
  }

  get freeCount() {
    return this._freeCount;
  }

  get capacity() {
    return this._capacity;
  }

  get peakActive() {
    return this._peakActive;
  }

  get peakCapacity() {
    return this._peakCapacity;
  }

  get peakFree() {
    const current = this._freeCount;
    if (current > this._peakFree) this._peakFree = current;
    return this._peakFree;
  }

  get totalCreated() {
    return this._totalCreated;
  }

  resolveParticle(sortIndex) {
    return this._activeAccessors[sortIndex];
  }

  getFieldValue(sortIndex, fieldName) {
    return this._activeAccessors[sortIndex][fieldName];
  }

  setFieldValue(sortIndex, fieldName, value) {
    this._activeAccessors[sortIndex][fieldName] = value;
  }

  getSortOrder(sortIndex) {
    return this._activeAccessors[sortIndex].__jygameSortOrder;
  }

  integrateParticle(acc, dt) {
    const i = acc._i;
    this._vx[i] += this._ax[i] * dt;
    this._vy[i] += this._ay[i] * dt;
    this._x[i] += this._vx[i] * dt;
    this._y[i] += this._vy[i] * dt;
    this._rotation[i] += this._rotationSpeed[i] * dt;
    this._life[i] -= dt;
    this._ageRatio[i] = this._maxLife[i] > 0
      ? Math.max(0, Math.min(1, 1 - this._life[i] / this._maxLife[i]))
      : 0;
  }
}
