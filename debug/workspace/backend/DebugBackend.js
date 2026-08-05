export class DebugBackend {
  open() {}
  close() {}
  send(snapshot) {}
  // Sends a control message the other way, workspace → game. Used for the
  // subscribe handshake and for pause/step commands.
  sendCommand(command) {}
  onMessage(handler) {
    this._handler = handler;
  }
  get connected() { return false; }
  get latency() { return 0; }
}
