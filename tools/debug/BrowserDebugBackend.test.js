import { describe, it, before, after } from "node:test";
import * as assert from "node:assert";
import { BrowserDebugBackend } from "../../debug/workspace/backend/BrowserDebugBackend.js";
import { DebugBackend } from "../../debug/workspace/backend/DebugBackend.js";

class MockBroadcastChannel {
  constructor(name) {
    this.name = name;
    this.onmessage = null;
    this.closed = false;
  }

  postMessage(data) {
    this._lastMessage = data;
  }

  close() {
    this.closed = true;
  }
}

describe("BrowserDebugBackend", () => {
  let OriginalBroadcastChannel;

  before(() => {
    OriginalBroadcastChannel = globalThis.BroadcastChannel;
    globalThis.BroadcastChannel = MockBroadcastChannel;
  });

  after(() => {
    globalThis.BroadcastChannel = OriginalBroadcastChannel;
  });

  it("extends DebugBackend", () => {
    const b = new BrowserDebugBackend();
    assert.ok(b instanceof DebugBackend);
  });

  it("starts disconnected", () => {
    const b = new BrowserDebugBackend();
    assert.strictEqual(b.connected, false);
  });

  it("open creates a BroadcastChannel", () => {
    const b = new BrowserDebugBackend();
    b.open();
    assert.ok(b._channel instanceof MockBroadcastChannel);
    assert.strictEqual(b.connected, true);
  });

  it("open uses default channel name", () => {
    const b = new BrowserDebugBackend();
    b.open();
    assert.strictEqual(b._channel.name, "jygame-debug");
  });

  it("open uses custom channel name", () => {
    const b = new BrowserDebugBackend("custom-channel");
    b.open();
    assert.strictEqual(b._channel.name, "custom-channel");
  });

  it("close disconnects", () => {
    const b = new BrowserDebugBackend();
    b.open();
    assert.strictEqual(b.connected, true);
    b.close();
    assert.strictEqual(b.connected, false);
    assert.strictEqual(b._channel, null);
  });

  it("close closes the channel", () => {
    const b = new BrowserDebugBackend();
    b.open();
    const channel = b._channel;
    b.close();
    assert.ok(channel.closed);
  });

  it("send posts a snapshot message", () => {
    const b = new BrowserDebugBackend();
    b.open();
    const snapshot = { frame: 42, fps: 60 };
    b.send(snapshot);
    assert.deepStrictEqual(b._channel._lastMessage, {
      type: "snapshot",
      payload: snapshot,
    });
  });

  it("send is a no-op when not connected", () => {
    const b = new BrowserDebugBackend();
    b.send({ frame: 1 });
    assert.strictEqual(b._channel, null);
  });

  it("onMessage receives messages from the channel", () => {
    const b = new BrowserDebugBackend();
    b.open();
    const received = [];
    b.onMessage((msg) => received.push(msg));
    const data = { type: "command", payload: { name: "debug:pause" } };
    b._channel.onmessage({ data });
    assert.strictEqual(received.length, 1);
    assert.deepStrictEqual(received[0], data);
  });

  it("multiple open is idempotent", () => {
    const b = new BrowserDebugBackend();
    b.open();
    const channel = b._channel;
    b.open();
    assert.strictEqual(b._channel, channel);
  });

  it("latency returns 0 initially", () => {
    const b = new BrowserDebugBackend();
    assert.strictEqual(b.latency, 0);
  });
});
