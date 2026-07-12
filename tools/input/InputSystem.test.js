import { describe, it } from "node:test";
import * as assert from "node:assert";
import { InputSystem } from "../../input/InputSystem.js";
import { Device } from "../../input/Device.js";
import { InputEventQueue } from "../../input/InputEventQueue.js";
import { DeviceRegistry } from "../../input/DeviceRegistry.js";
import { InputEvent } from "../../input/InputEvent.js";
import { EventType } from "../../input/EventType.js";
import { Tier } from "../../input/Tier.js";

describe("InputSystem", () => {
  it("constructs with default devices and events", () => {
    const sys = new InputSystem();
    assert.ok(sys.devices instanceof DeviceRegistry);
    assert.ok(sys.events instanceof InputEventQueue);
    assert.strictEqual(sys.backend, null);
  });

  it("setBackend assigns backend and starts it", () => {
    const sys = new InputSystem();
    let started = false;
    const backend = {
      start() { started = true; },
      stop() {},
      poll() {},
    };
    sys.setBackend(backend);
    assert.strictEqual(sys.backend, backend);
    assert.ok(started);
  });

  it("setBackend stops previous backend", () => {
    const sys = new InputSystem();
    let stopped = false;
    const first = {
      start() {},
      stop() { stopped = true; },
      poll() {},
    };
    sys.setBackend(first);
    sys.setBackend({ start() {}, stop() {}, poll() {} });
    assert.ok(stopped);
  });

  it("update calls backend.poll and clears queue", () => {
    const sys = new InputSystem();
    let polled = false;
    const backend = {
      start() {},
      stop() {},
      poll(queue) {
        polled = true;
        queue.push(new InputEvent(EventType.KEY_DOWN, { key: "a" }), Tier.HIGH);
      },
    };
    sys.setBackend(backend);
    sys.update();
    assert.ok(polled);
    // Queue is cleared after update
    assert.strictEqual(sys.events.length, 0);
  });

  it("update does not throw when no backend is set", () => {
    const sys = new InputSystem();
    sys.update();
    assert.strictEqual(sys.events.length, 0);
  });

  it("survives Object.freeze pattern like other enums", () => {
    assert.strictEqual(typeof EventType.KEY_DOWN, "string");
    assert.strictEqual(typeof Tier.HIGH, "number");
  });
});
