import { describe, it } from "node:test";
import * as assert from "node:assert";
import { InputEventQueue } from "../InputEventQueue.js";
import { InputEvent } from "../InputEvent.js";
import { EventType } from "../EventType.js";
import { Tier } from "../Tier.js";

describe("InputEventQueue", () => {
  describe("push and drain", () => {
    it("pushes and drains events in FIFO order", () => {
      const queue = new InputEventQueue(16);
      queue.push(new InputEvent(EventType.KEY_DOWN, { key: "a" }));
      queue.push(new InputEvent(EventType.KEY_DOWN, { key: "b" }));
      const received = [];
      queue.drain(event => received.push(event.data.key));
      assert.deepStrictEqual(received, ["a", "b"]);
    });

    it("returns drained events as InputEvent instances", () => {
      const queue = new InputEventQueue(16);
      const event = new InputEvent(EventType.KEY_DOWN, { key: "Space" });
      queue.push(event);
      queue.drain(e => {
        assert.ok(e instanceof InputEvent);
        assert.strictEqual(e.type, EventType.KEY_DOWN);
        assert.strictEqual(e.data.key, "Space");
      });
    });

    it("has length 0 after drain", () => {
      const queue = new InputEventQueue(16);
      queue.push(new InputEvent(EventType.KEY_DOWN));
      queue.drain(() => {});
      assert.strictEqual(queue.length, 0);
    });

    it("handles empty drain without error", () => {
      const queue = new InputEventQueue(16);
      queue.drain(() => {});
      assert.strictEqual(queue.length, 0);
    });
  });

  describe("priority tiers", () => {
    it("drains HIGH before NORMAL before LOW", () => {
      const queue = new InputEventQueue(16);
      queue.push(new InputEvent(EventType.KEY_DOWN, { id: "low" }), Tier.LOW);
      queue.push(new InputEvent(EventType.KEY_DOWN, { id: "high" }), Tier.HIGH);
      queue.push(new InputEvent(EventType.KEY_DOWN, { id: "normal" }), Tier.NORMAL);
      const received = [];
      queue.drain(event => received.push(event.data.id));
      assert.deepStrictEqual(received, ["high", "normal", "low"]);
    });

    it("preserves order within the same tier", () => {
      const queue = new InputEventQueue(16);
      for (let i = 0; i < 5; i++) {
        queue.push(new InputEvent(EventType.KEY_DOWN, { i }), Tier.HIGH);
      }
      const received = [];
      queue.drain(event => received.push(event.data.i));
      assert.deepStrictEqual(received, [0, 1, 2, 3, 4]);
    });

    it("default tier is NORMAL", () => {
      const queue = new InputEventQueue(16);
      queue.push(new InputEvent(EventType.KEY_DOWN, { id: "default" }));
      const received = [];
      queue.drain(event => received.push(event.data.id));
      assert.deepStrictEqual(received, ["default"]);
    });
  });

  describe("ring buffer overflow", () => {
    it("overwrites oldest event when capacity is exceeded", () => {
      const queue = new InputEventQueue(4);
      for (let i = 0; i < 6; i++) {
        queue.push(new InputEvent(EventType.KEY_DOWN, { i }), Tier.HIGH);
      }
      const received = [];
      queue.drain(event => received.push(event.data.i));
      assert.deepStrictEqual(received, [2, 3, 4, 5]);
    });
  });

  describe("clear", () => {
    it("removes all events", () => {
      const queue = new InputEventQueue(16);
      queue.push(new InputEvent(EventType.KEY_DOWN));
      queue.push(new InputEvent(EventType.KEY_UP));
      queue.clear();
      assert.strictEqual(queue.length, 0);
    });

    it("does not affect subsequent pushes", () => {
      const queue = new InputEventQueue(16);
      queue.push(new InputEvent(EventType.KEY_DOWN));
      queue.clear();
      queue.push(new InputEvent(EventType.KEY_UP));
      assert.strictEqual(queue.length, 1);
      const received = [];
      queue.drain(event => received.push(event.type));
      assert.deepStrictEqual(received, [EventType.KEY_UP]);
    });
  });

  describe("length", () => {
    it("reports correct count across tiers", () => {
      const queue = new InputEventQueue(16);
      queue.push(new InputEvent(EventType.KEY_DOWN), Tier.HIGH);
      queue.push(new InputEvent(EventType.KEY_UP), Tier.NORMAL);
      queue.push(new InputEvent(EventType.WHEEL), Tier.LOW);
      assert.strictEqual(queue.length, 3);
    });
  });
});
