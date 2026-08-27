export class HistoryBuffer {
  constructor(capacity = 128) {
    this._buffer = new Array(capacity);
    this._head = 0;
    this._tail = 0;
    this._count = 0;
    this._capacity = capacity;
  }

  get capacity() { return this._capacity; }
  get length() { return this._count; }

  push(event) {
    if (this._count === this._capacity) {
      this._head = (this._head + 1) % this._capacity;
      this._count--;
    }
    this._buffer[this._tail] = event;
    this._tail = (this._tail + 1) % this._capacity;
    this._count++;
  }

  pushAll(events) {
    for (const e of events) this.push(e);
  }

  toArray() {
    const arr = new Array(this._count);
    let pos = this._head;
    for (let i = 0; i < this._count; i++) {
      arr[i] = this._buffer[pos];
      pos = (pos + 1) % this._capacity;
    }
    return arr;
  }

  snapshot() {
    return Object.freeze(this.toArray());
  }

  shift() {
    if (this._count === 0) return null;
    const val = this._buffer[this._head];
    this._buffer[this._head] = null;
    this._head = (this._head + 1) % this._capacity;
    this._count--;
    return val;
  }

  peek() {
    if (this._count === 0) return null;
    return this._buffer[this._head];
  }

  clear() {
    while (this._count > 0) {
      this._buffer[this._head] = null;
      this._head = (this._head + 1) % this._capacity;
      this._count--;
    }
    this._head = 0;
    this._tail = 0;
  }
}
