import { describe, it } from "node:test";
import * as assert from "node:assert";
import { NullDebugBackend } from "../../debug/workspace/backend/NullDebugBackend.js";
import { DebugBackend } from "../../debug/workspace/backend/DebugBackend.js";

describe("NullDebugBackend", () => {
  it("extends DebugBackend", () => {
    const b = new NullDebugBackend();
    assert.ok(b instanceof DebugBackend);
  });

  it("open and close are no-ops", () => {
    const b = new NullDebugBackend();
    b.open();
    b.close();
  });

  it("send is a no-op", () => {
    const b = new NullDebugBackend();
    b.send({ frame: 1 });
  });

  it("connected always returns false", () => {
    const b = new NullDebugBackend();
    assert.strictEqual(b.connected, false);
    b.open();
    assert.strictEqual(b.connected, false);
    b.close();
    assert.strictEqual(b.connected, false);
  });

  it("latency always returns 0", () => {
    const b = new NullDebugBackend();
    assert.strictEqual(b.latency, 0);
    b.open();
    assert.strictEqual(b.latency, 0);
  });
});
