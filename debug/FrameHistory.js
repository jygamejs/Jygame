export class FrameHistory {
  constructor(capacity = 300) {
    this._buffer = new Array(capacity);
    this._capacity = capacity;
    this._count = 0;
    this._head = 0;
    this._wraps = 0;
  }

  push(snapshot) {
    this._buffer[this._head] = snapshot;
    this._head = (this._head + 1) % this._capacity;
    if (this._count < this._capacity) {
      this._count++;
    } else {
      this._wraps++;
    }
  }

  get length() {
    return this._count;
  }

  get count() {
    return this._count;
  }

  get capacity() {
    return this._capacity;
  }

  get wraps() {
    return this._wraps;
  }

  at(index) {
    if (index < 0 || index >= this._count) return null;
    const pos = (this._head - 1 - index + this._capacity) % this._capacity;
    return this._buffer[pos];
  }

  latest() {
    if (this._count === 0) return null;
    return this.at(0);
  }

  oldest() {
    if (this._count === 0) return null;
    return this.at(this._count - 1);
  }

  *frames() {
    for (let i = this._count - 1; i >= 0; i--) {
      const pos = (this._head - 1 - i + this._capacity) % this._capacity;
      yield this._buffer[pos];
    }
  }

  *[Symbol.iterator]() {
    yield* this.frames();
  }

  forEachReverse(fn) {
    for (let i = 0; i < this._count; i++) {
      fn(this.at(i));
    }
  }

  reset() {
    this._count = 0;
    this._head = 0;
    this._wraps = 0;
  }
}
