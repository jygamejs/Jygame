import { DebugBackend } from "./DebugBackend.js";

export class TestDebugBackend extends DebugBackend {
  constructor() {
    super();
    this._queue = [];
    this._commands = [];
    this._open = false;
    this._latency = 0;
  }

  open() {
    this._open = true;
  }

  close() {
    this._open = false;
    this._queue = [];
    this._commands = [];
  }

  send(snapshot) {
    if (!this._open) return;
    this._queue.push(snapshot);
  }

  sendCommand(command) {
    if (!this._open) return;
    this._commands.push(command);
  }

  commands() {
    return this._commands;
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
