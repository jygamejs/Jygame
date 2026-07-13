import { DebugBackend } from "./DebugBackend.js";

export class TestDebugBackend extends DebugBackend {
  constructor() {
    super();
    this._queue = [];
    this._open = false;
    this._latency = 0;
  }

  open() {
    this._open = true;
  }

  close() {
    this._open = false;
    this._queue = [];
  }

  send(snapshot) {
    if (!this._open) return;
    this._queue.push(snapshot);
  }

  receive(msg) {
    if (this._handler) {
      this._handler(msg);
    }
  }

  get connected() { return this._open; }
  get latency() { return this._latency; }

  snapshots() {
    return this._queue;
  }

  clear() {
    this._queue = [];
  }

  get sentCount() {
    return this._queue.length;
  }

  lastSnapshot() {
    return this._queue[this._queue.length - 1] || null;
  }
}
