import { describe, it } from "node:test";
import * as assert from "node:assert";
import { Gamepad } from "../../input/Gamepad.js";
import { InputEventQueue } from "../../input/InputEventQueue.js";
import { InputEvent } from "../../input/InputEvent.js";
import { EventType } from "../../input/EventType.js";
import { Tier } from "../../input/Tier.js";
import { GamepadButton } from "../../input/GamepadButton.js";
import { GamepadAxis } from "../../input/GamepadAxis.js";

function makePads(pad) {
  const arr = [];
  arr[pad.index] = pad;
  return arr;
}

function button(pressed, value = pressed ? 1 : 0) {
  return { pressed, value, touched: pressed };
}

function pad(index, buttons = {}, axes = [0, 0, 0, 0]) {
  const b = new Array(17).fill(0).map(() => button(false));
  for (const [i, v] of Object.entries(buttons)) b[i] = button(v > 0, v);
  return { id: "Xbox", index, connected: true, mapping: "standard", buttons: b, axes };
}

function emptyPads() {
  return [];
}

describe("Gamepad device", () => {
  it("starts with no connected pads", () => {
    const gp = new Gamepad(() => emptyPads());
    assert.strictEqual(gp.count, 0);
  });

  it("connects a pad reported by the source", () => {
    const gp = new Gamepad(() => makePads(pad(0)));
    gp.update(new InputEventQueue(64));
    assert.strictEqual(gp.count, 1);
    assert.strictEqual(gp.isConnected(0), true);
  });

  it("reports a fresh press and releases it", () => {
    let pads = makePads(pad(0, { [GamepadButton.A]: 1 }));
    const gp = new Gamepad(() => pads);
    const q = new InputEventQueue(64);

    gp.update(q);
    assert.strictEqual(gp.isDown(0, GamepadButton.A), true);
    assert.strictEqual(gp.justPressed(0, GamepadButton.A), true);

    gp.update(q);
    assert.strictEqual(gp.isDown(0, GamepadButton.A), true);
    assert.strictEqual(gp.justPressed(0, GamepadButton.A), false);

    pads = makePads(pad(0));
    gp.update(q);
    assert.strictEqual(gp.isDown(0, GamepadButton.A), false);
    assert.strictEqual(gp.justReleased(0, GamepadButton.A), true);
  });

  it("keeps the digital flag down while the analog value stays above threshold", () => {
    let pads = makePads(pad(0, { [GamepadButton.RT]: 0.6 }));
    const gp = new Gamepad(() => pads);
    const q = new InputEventQueue(64);

    gp.update(q);
    assert.strictEqual(gp.isDown(0, GamepadButton.RT), true);
    assert.ok(Math.abs(gp.value(0, GamepadButton.RT) - 0.6) < 1e-6);
  });

  it("tracks axes", () => {
    const gp = new Gamepad(() => makePads(pad(0, {}, [0.5, -0.25, 1, -1])));
    gp.update(new InputEventQueue(64));
    assert.strictEqual(gp.axis(0, GamepadAxis.LEFT_X), 0.5);
    assert.strictEqual(gp.axis(0, GamepadAxis.LEFT_Y), -0.25);
    assert.strictEqual(gp.axis(0, GamepadAxis.RIGHT_X), 1);
    assert.strictEqual(gp.axis(0, GamepadAxis.RIGHT_Y), -1);
  });

  it("applies a radial dead zone to sticks with scaling", () => {
    const gp = new Gamepad(() => makePads(pad(0, {}, [0.6, -0.8, 0, 0])), { deadZone: 0.2 });
    gp.update(new InputEventQueue(64));

    const v = gp.stick(0, "left");
    const mag = Math.sqrt(v.x * v.x + v.y * v.y);
    assert.ok(Math.abs(mag - 1) < 1e-6, "full deflection survives the dead zone at full magnitude");
    assert.ok(Math.abs(v.x - 0.6) < 1e-6);
    assert.ok(Math.abs(v.y - -0.8) < 1e-6);
  });

  it("zeroes sticks inside the dead zone", () => {
    const gp = new Gamepad(() => makePads(pad(0, {}, [0.1, 0.1, 0, 0])), { deadZone: 0.2 });
    gp.update(new InputEventQueue(64));
    assert.deepStrictEqual(gp.stick(0, "left"), { x: 0, y: 0 });
  });

  it("scales partial deflection inside the dead zone smoothly", () => {
    // magnitude 0.5, dead zone 0.2 → scaled to (0.5-0.2)/(1-0.2) = 0.375
    const gp = new Gamepad(() => makePads(pad(0, {}, [0.5, 0, 0, 0])), { deadZone: 0.2 });
    gp.update(new InputEventQueue(64));
    const v = gp.stick(0, "left");
    assert.ok(Math.abs(v.x - 0.375) < 1e-6);
    assert.strictEqual(v.y, 0);
  });

  it("emits connect, button and disconnect events", () => {
    let pads = emptyPads();
    const gp = new Gamepad(() => pads);
    const q = new InputEventQueue(64);

    pads = makePads(pad(0, { [GamepadButton.A]: 1 }));
    gp.update(q);
    const down = collect(q);
    assert.ok(down.some(e => e.type === EventType.GAMEPAD_CONNECTED));
    assert.ok(down.some(e => e.type === EventType.GAMEPAD_BUTTON_DOWN));

    pads = emptyPads();
    gp.update(q);
    const up = collect(q);
    assert.ok(up.some(e => e.type === EventType.GAMEPAD_DISCONNECTED));
  });

  it("handles multiple gamepads by index", () => {
    const gp = new Gamepad(() => [
      null,
      pad(1, { [GamepadButton.X]: 1 }),
    ]);
    gp.update(new InputEventQueue(64));
    assert.strictEqual(gp.count, 1);
    assert.strictEqual(gp.isDown(1, GamepadButton.X), true);
    assert.strictEqual(gp.isDown(0, GamepadButton.X), false);
  });
});

function collect(q) {
  const out = [];
  q.each(e => out.push(e));
  q.clear();
  return out;
}
