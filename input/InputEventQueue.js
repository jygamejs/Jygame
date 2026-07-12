import { Tier } from "./Tier.js";

class TierBuffer {
  constructor(capacity) {
    this._buffer = new Array(capacity);
    this._head = 0;
    this._tail = 0;
    this._count = 0;
    this._capacity = capacity;
  }

  push(event) {
    if (this._count === this._capacity) {
      this._head = (this._head + 1) % this._capacity;
      this._count--;
    }
    this._buffer[this._tail] = event;
    this._tail = (this._tail + 1) % this._capacity;
    this._count++;
  }

  each(fn) {
    let pos = this._head;
    for (let i = 0; i < this._count; i++) {
      fn(this._buffer[pos]);
      pos = (pos + 1) % this._capacity;
    }
  }

  drain(fn) {
    while (this._count > 0) {
      const event = this._buffer[this._head];
      this._buffer[this._head] = null;
      this._head = (this._head + 1) % this._capacity;
      this._count--;
      fn(event);
    }
  }

  clear() {
    while (this._count > 0) {
      this._buffer[this._head] = null;
      this._head = (this._head + 1) % this._capacity;
      this._count--;
    }
  }

  get length() { return this._count; }
}

export class InputEventQueue {
  constructor(capacity = 64) {
    this._tiers = {
      [Tier.HIGH]: new TierBuffer(capacity),
      [Tier.NORMAL]: new TierBuffer(capacity),
      [Tier.LOW]: new TierBuffer(capacity),
    };
  }

  push(event, tier = Tier.NORMAL) {
    this._tiers[tier].push(event);
  }

  each(fn) {
    this._tiers[Tier.HIGH].each(fn);
    this._tiers[Tier.NORMAL].each(fn);
    this._tiers[Tier.LOW].each(fn);
  }

  drain(fn) {
    this._tiers[Tier.HIGH].drain(fn);
    this._tiers[Tier.NORMAL].drain(fn);
    this._tiers[Tier.LOW].drain(fn);
  }

  clear() {
    for (const key of Object.keys(this._tiers)) {
      this._tiers[key].clear();
    }
  }

  get length() {
    return this._tiers[Tier.HIGH].length
      + this._tiers[Tier.NORMAL].length
      + this._tiers[Tier.LOW].length;
  }
}
