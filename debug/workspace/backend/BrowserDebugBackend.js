import { DebugBackend } from "./DebugBackend.js";

const CHANNEL_NAME = "jygame-debug";

export class BrowserDebugBackend extends DebugBackend {
  constructor(channelName) {
    super();
    this._channelName = channelName || CHANNEL_NAME;
    this._channel = null;
    this._connected = false;
    this._latency = 0;
  }

  open() {
    if (this._channel) return;
    try {
      this._channel = new BroadcastChannel(this._channelName);
      this._channel.onmessage = (event) => {
        if (this._handler) {
          this._handler(event.data);
        }
      };
      this._connected = true;
    } catch {
      this._channel = null;
      this._connected = false;
    }
  }

  close() {
    if (!this._channel) return;
    this._channel.close();
    this._channel = null;
    this._connected = false;
    this._latency = 0;
  }

  send(snapshot) {
    if (!this._channel) return;
    try {
      this._channel.postMessage({ type: "snapshot", payload: snapshot });
    } catch {
      // Drop silently — workspace might be closed
    }
  }

  get connected() { return this._connected; }
  get latency() { return this._latency; }
}
