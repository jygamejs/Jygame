export class PointerHistory {
  constructor(capacity = 8) {
    this._buffer = new Array(capacity);
    this._head = 0;
    this._count = 0;
    this._capacity = capacity;
  }

  push(position) {
    this._buffer[this._head] = { x: position.x, y: position.y };
    this._head = (this._head + 1) % this._capacity;
    if (this._count < this._capacity) this._count++;
  }

  get(index) {
    if (index < 0 || index >= this._count) return null;
    const pos = (this._head - 1 - index + this._capacity) % this._capacity;
    return this._buffer[pos];
  }

  get length() { return this._count; }

  clear() {
    for (let i = 0; i < this._count; i++) {
      this._buffer[(this._head - 1 - i + this._capacity) % this._capacity] = null;
    }
    this._head = 0;
    this._count = 0;
  }
}
