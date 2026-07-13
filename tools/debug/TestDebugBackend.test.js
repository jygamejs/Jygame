import { describe, it } from "node:test";
import * as assert from "node:assert";
import { TestDebugBackend } from "../../debug/workspace/backend/TestDebugBackend.js";
import { DebugBackend } from "../../debug/workspace/backend/DebugBackend.js";

describe("TestDebugBackend", () => {
  it("extends DebugBackend", () => {
    const b = new TestDebugBackend();
    assert.ok(b instanceof DebugBackend);
  });

  it("starts disconnected with empty queue", () => {
    const b = new TestDebugBackend();
    assert.strictEqual(b.connected, false);
    assert.strictEqual(b.sentCount, 0);
    assert.deepStrictEqual(b.snapshots(), []);
  });

  it("open sets connected", () => {
    const b = new TestDebugBackend();
    b.open();
    assert.strictEqual(b.connected, true);
  });

  it("close disconnects and clears queue", () => {
    const b = new TestDebugBackend();
    b.open();
    b.send({ frame: 1 });
    assert.strictEqual(b.sentCount, 1);
    b.close();
    assert.strictEqual(b.connected, false);
    assert.strictEqual(b.sentCount, 0);
  });

  it("send queues snapshots", () => {
    const b = new TestDebugBackend();
    b.open();
    b.send({ frame: 1 });
    b.send({ frame: 2 });
    b.send({ frame: 3 });
    assert.strictEqual(b.sentCount, 3);
    assert.deepStrictEqual(b.snapshots(), [{ frame: 1 }, { frame: 2 }, { frame: 3 }]);
  });

  it("send is a no-op when not connected", () => {
    const b = new TestDebugBackend();
    b.send({ frame: 1 });
    assert.strictEqual(b.sentCount, 0);
  });

  it("lastSnapshot returns the most recent snapshot", () => {
    const b = new TestDebugBackend();
    b.open();
    b.send({ frame: 1 });
    b.send({ frame: 2 });
    assert.deepStrictEqual(b.lastSnapshot(), { frame: 2 });
  });

  it("lastSnapshot returns null when no snapshots sent", () => {
    const b = new TestDebugBackend();
    b.open();
    assert.strictEqual(b.lastSnapshot(), null);
  });

  it("clear removes all queued snapshots", () => {
    const b = new TestDebugBackend();
    b.open();
    b.send({ frame: 1 });
    b.send({ frame: 2 });
    b.clear();
    assert.strictEqual(b.sentCount, 0);
    assert.deepStrictEqual(b.snapshots(), []);
  });

  it("receive calls the registered handler", () => {
    const b = new TestDebugBackend();
    const received = [];
    b.onMessage((msg) => received.push(msg));
    const msg = { type: "command", payload: { name: "debug:pause" } };
    b.receive(msg);
    assert.strictEqual(received.length, 1);
    assert.deepStrictEqual(received[0], msg);
  });

  it("receive is a no-op when no handler registered", () => {
    const b = new TestDebugBackend();
    b.receive({ type: "command" });
  });

  it("latency returns 0", () => {
    const b = new TestDebugBackend();
    assert.strictEqual(b.latency, 0);
  });
});
