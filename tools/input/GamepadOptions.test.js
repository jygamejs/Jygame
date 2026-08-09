import { describe, it } from "node:test";
import * as assert from "node:assert";
import { InputSystem } from "../../input/InputSystem.js";
import { TestBackend } from "../../input/TestBackend.js";
import { Gamepad } from "../../input/Gamepad.js";
import { ContextStack } from "../../input/actions/ContextStack.js";
import { Input } from "../../input/Input.js";
import { GamepadButton } from "../../input/GamepadButton.js";
import { GamepadAxis } from "../../input/GamepadAxis.js";

function button(pressed, value = pressed ? 1 : 0) {
  return { pressed, value, touched: pressed };
}

function pad(index, buttons = {}, axes = [0, 0, 0, 0], extra = {}) {
  const b = new Array(17).fill(0).map(() => button(false));
  for (const [i, v] of Object.entries(buttons)) b[i] = button(v > 0, v);
  return { id: "Xbox", index, connected: true, mapping: "standard", buttons: b, axes, ...extra };
}

function makeSystem() {
  const sys = new InputSystem();
  sys.setBackend(new TestBackend());
  sys.devices.register(new Gamepad(() => sys.backend.gamepads));
  sys.contextStack = new ContextStack();
  Input.setSystem(sys);
  return sys;
}

describe("Input.gamepad.enabled", () => {
  it("defaults to enabled and polls", () => {
    const sys = makeSystem();
    assert.strictEqual(Input.gamepad.enabled, true);
    sys.backend.setGamepads([pad(0, { [GamepadButton.A]: 1 })]);
    sys.update();
    assert.strictEqual(Input.gamepad.count, 1);
    assert.strictEqual(Input.down("PAD_A"), true);
  });

  it("setting enabled to false stops polling", () => {
    const sys = makeSystem();
    Input.gamepad.enabled = false;
    assert.strictEqual(Input.gamepad.enabled, false);

    sys.backend.setGamepads([pad(0, { [GamepadButton.A]: 1 })]);
    sys.update();
    assert.strictEqual(Input.gamepad.count, 0, "no polling while disabled");
    assert.strictEqual(Input.down("PAD_A"), false);
    assert.strictEqual(Input.gamepad.isDown(GamepadButton.A, 0), false);
  });

  it("re-enabling resumes polling", () => {
    const sys = makeSystem();
    sys.backend.setGamepads([pad(0, { [GamepadButton.A]: 1 })]);
    Input.gamepad.enabled = false;
    sys.update();
    assert.strictEqual(Input.gamepad.count, 0);

    Input.gamepad.enabled = true;
    sys.update();
    assert.strictEqual(Input.gamepad.count, 1);
    assert.strictEqual(Input.down("PAD_A"), true);
  });
});

describe("setMinimumGamepadConfiguration", () => {
  it("filters out pads that do not meet the minimums", () => {
    const sys = makeSystem();
    sys.backend.setGamepads([
      pad(0, {}, [], { buttons: new Array(8).fill(0).map(() => button(false)) }),
    ]);
    Input.gamepad.setMinimumGamepadConfiguration({ axis: 4, buttons: 8 });
    sys.update();
    assert.strictEqual(Input.gamepad.count, 0, "pad with 0 axes is filtered out");

    sys.backend.setGamepads([pad(0)]);
    sys.update();
    assert.strictEqual(Input.gamepad.count, 1, "pad meeting the minimums connects");
  });

  it("a pad already connected that fails a new minimum disconnects", () => {
    const sys = makeSystem();
    sys.backend.setGamepads([pad(0)]);
    sys.update();
    assert.strictEqual(Input.gamepad.count, 1);

    Input.gamepad.setMinimumGamepadConfiguration({ buttons: 20 });
    sys.update();
    assert.strictEqual(Input.gamepad.count, 0, "no longer meets the minimum");
  });
});

describe("thresholds", () => {
  it("isDown with a threshold uses the analog value", () => {
    const sys = makeSystem();
    sys.backend.setGamepads([pad(0, { [GamepadButton.RT]: 0.4 })]);
    sys.update();
    assert.strictEqual(Input.gamepad.isDown(GamepadButton.RT, 0), true, "browser pressed flag");
    assert.strictEqual(Input.gamepad.isDown(GamepadButton.RT, 0, 0.7), false, "below the threshold");
    assert.strictEqual(Input.gamepad.isDown(GamepadButton.RT, 0, 0.3), true, "at/above the threshold");
  });

  it("value with a threshold suppresses drift below it", () => {
    const sys = makeSystem();
    sys.backend.setGamepads([pad(0, { [GamepadButton.RT]: 0.4 })]);
    sys.update();
    assert.strictEqual(Input.gamepad.value(GamepadButton.RT, 0, 0.7), 0, "idle drift reads as 0");
    assert.ok(Math.abs(Input.gamepad.value(GamepadButton.RT, 0, 0.2) - 0.4) < 1e-6);
  });

  it("axis with a threshold suppresses values inside it", () => {
    const sys = makeSystem();
    sys.backend.setGamepads([pad(0, {}, [0.1, 0.6, 0, 0])]);
    sys.update();
    assert.strictEqual(Input.gamepad.axis(0, GamepadAxis.LEFT_X, 0.2), 0);
    assert.ok(Math.abs(Input.gamepad.axis(0, GamepadAxis.LEFT_Y, 0.2) - 0.6) < 1e-6);
  });
});

describe("gamepad events (on)", () => {
  it("fires connect, button and axis, then disconnect", () => {
    const sys = makeSystem();
    const seen = { connect: [], disconnect: [], button: [], axis: [] };
    const offs = [];
    offs.push(Input.gamepad.on("connect", e => seen.connect.push(e)));
    offs.push(Input.gamepad.on("disconnect", e => seen.disconnect.push(e)));
    offs.push(Input.gamepad.on("button", e => seen.button.push(e)));
    offs.push(Input.gamepad.on("axis", e => seen.axis.push(e)));

    sys.backend.setGamepads([pad(0, { [GamepadButton.A]: 1 }, [0.5, 0, 0, 0])]);
    sys.update();
    assert.strictEqual(seen.connect.length, 1);
    assert.strictEqual(seen.connect[0].gamepadIndex, 0);
    assert.strictEqual(seen.button.length, 1);
    assert.strictEqual(seen.button[0].button, GamepadButton.A);
    assert.strictEqual(seen.button[0].pressed, true);
    assert.strictEqual(seen.axis.length, 1, "stick past the move threshold fires an axis event");
    assert.strictEqual(seen.axis[0].axis, GamepadAxis.LEFT_X);

    sys.backend.setGamepads([]);
    sys.update();
    assert.strictEqual(seen.disconnect.length, 1);

    for (const off of offs) off();
  });

  it("a steady stick does not re-fire axis events every frame", () => {
    const sys = makeSystem();
    const axisEvents = [];
    Input.gamepad.on("axis", e => axisEvents.push(e));

    sys.backend.setGamepads([pad(0, {}, [0.5, 0, 0, 0])]);
    sys.update();
    sys.update();
    sys.update();
    assert.strictEqual(axisEvents.length, 1, "held steady — one event, not one per frame");

    sys.backend.setGamepads([pad(0, {}, [0.7, 0, 0, 0])]);
    sys.update();
    assert.strictEqual(axisEvents.length, 2, "moving the stick fires again");
  });

  it("on() requires a function and returns an unsubscribe", () => {
    const sys = makeSystem();
    assert.throws(() => Input.gamepad.on("button", null), TypeError);
    const off = Input.gamepad.on("connect", () => {});
    assert.strictEqual(typeof off, "function");
    off(); // does not throw
  });

  it("button events fire on release too", () => {
    const sys = makeSystem();
    const buttons = [];
    Input.gamepad.on("button", e => buttons.push(e));

    sys.backend.setGamepads([pad(0, { [GamepadButton.A]: 1 })]);
    sys.update();
    sys.backend.setGamepads([pad(0)]);
    sys.update();
    assert.strictEqual(buttons.length, 2);
    assert.strictEqual(buttons[0].pressed, true);
    assert.strictEqual(buttons[1].pressed, false);
  });
});
