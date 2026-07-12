import { PointerHistory } from "./PointerHistory.js";

const MAX_POINTERS = 10;

export class PointerStorage {
  constructor(historyCapacity = 8) {
    this._pointers = new Array(MAX_POINTERS);
    this._slots = new Int8Array(MAX_POINTERS);
    this._activeCount = 0;
    this._historyCapacity = historyCapacity;
    this._freeTop = MAX_POINTERS;

    for (let i = 0; i < MAX_POINTERS; i++) {
      this._slots[i] = i;
      this._pointers[i] = null;
    }
  }

  get capacity() { return MAX_POINTERS; }
  get activeCount() { return this._activeCount; }
  get historyCapacity() { return this._historyCapacity; }

  set historyCapacity(val) {
    this._historyCapacity = Math.max(1, Math.min(val, 64));
  }

  allocate() {
    if (this._freeTop === 0) return -1;
    const slot = this._slots[--this._freeTop];
    this._activeCount++;
    if (!this._pointers[slot]) {
      this._pointers[slot] = this._createPointerData(slot);
    }
    const data = this._pointers[slot];
    data.active = true;
    return slot;
  }

  release(slot) {
    if (slot < 0 || slot >= MAX_POINTERS) return;
    if (this._freeTop >= MAX_POINTERS) return;
    const data = this._pointers[slot];
    if (data) {
      data.active = false;
      data.history.clear();
    }
    this._slots[this._freeTop++] = slot;
    this._activeCount--;
  }

  getPointerData(slot) {
    if (slot < 0 || slot >= MAX_POINTERS) return null;
    const data = this._pointers[slot];
    return data && data.active ? data : null;
  }

  forEachActive(fn) {
    for (let i = 0; i < MAX_POINTERS; i++) {
      const data = this._pointers[i];
      if (data && data.active) fn(data, i);
    }
  }

  _createPointerData(slot) {
    return {
      slot,
      active: false,
      pointerId: -1,
      type: "mouse",
      isEraser: false,
      x: 0, y: 0,
      prevX: 0, prevY: 0,
      startX: 0, startY: 0,
      deltaX: 0, deltaY: 0,
      velocityX: 0, velocityY: 0,
      pressure: 0,
      tiltX: 0, tiltY: 0,
      twist: 0,
      width: 1, height: 1,
      isDown: false,
      wasDown: false,
      startTime: 0,
      distance: 0,
      history: new PointerHistory(this._historyCapacity),
    };
  }
}
