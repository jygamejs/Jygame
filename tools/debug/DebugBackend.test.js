import { describe, it } from "node:test";
import * as assert from "node:assert";
import { DebugBackend } from "../../debug/workspace/backend/DebugBackend.js";

describe("DebugBackend", () => {
  it("open and close are no-ops", () => {
    const b = new DebugBackend();
    b.open();
    b.close();
  });

  it("send is a no-op", () => {
    const b = new DebugBackend();
    b.send({ frame: 1 });
  });

  it("onMessage stores the handler", () => {
    const b = new DebugBackend();
    const handler = () => {};
    b.onMessage(handler);
    assert.strictEqual(b._handler, handler);
  });

  it("connected returns false", () => {
    const b = new DebugBackend();
    assert.strictEqual(b.connected, false);
  });

  it("latency returns 0", () => {
    const b = new DebugBackend();
    assert.strictEqual(b.latency, 0);
  });
});
