export class DebugBackend {
  open() {}
  close() {}
  send(snapshot) {}
  onMessage(handler) {
    this._handler = handler;
  }
  get connected() { return false; }
  get latency() { return 0; }
}
