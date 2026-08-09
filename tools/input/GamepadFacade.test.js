import { describe, it } from "node:test";
import * as assert from "node:assert";
import { InputSystem } from "../../input/InputSystem.js";
import { TestBackend } from "../../input/TestBackend.js";
import { Gamepad } from "../../input/Gamepad.js";
import { Keyboard } from "../../input/Keyboard.js";
import { ContextStack } from "../../input/actions/ContextStack.js";
import { Input } from "../../input/Input.js";
import { GamepadButton } from "../../input/GamepadButton.js";

function approx(actual, expected, eps = 1e-6) {
  assert.ok(Math.abs(actual - expected) < eps, `${actual} ≈ ${expected}`);
}

function approxVec(actual, expected, eps = 1e-6) {
  approx(actual.x, expected.x, eps);
  approx(actual.y, expected.y, eps);
}

function button(pressed, value = pressed ? 1 : 0) {
  return { pressed, value, touched: pressed };
}

function pad(index, buttons = {}, axes = [0, 0, 0, 0]) {
  const b = new Array(17).fill(0).map(() => button(false));
  for (const [i, v] of Object.entries(buttons)) b[i] = button(v > 0, v);
  return { id: "Xbox", index, connected: true, mapping: "standard", buttons: b, axes };
}

function makeSystem() {
  const sys = new InputSystem();
  sys.setBackend(new TestBackend());
  sys.devices.register(new Keyboard());
  sys.devices.register(new Gamepad(() => sys.backend.gamepads));
  sys.contextStack = new ContextStack();
  Input.setSystem(sys);
  return sys;
}

describe("gamepad name resolution (Input facade)", () => {
  it("PAD_* button names resolve digitally with edges", () => {
    const sys = makeSystem();
    sys.backend.setGamepads([pad(0, { [GamepadButton.A]: 1 })]);
    sys.update();

    assert.strictEqual(Input.down("PAD_A"), true);
    assert.strictEqual(Input.pressed("PAD_A"), true);
    assert.strictEqual(Input.down("PAD_B"), false);

    sys.update();
    assert.strictEqual(Input.pressed("PAD_A"), false, "held on the next frame");

    sys.backend.setGamepads([pad(0)]);
    sys.update();
    assert.strictEqual(Input.released("PAD_A"), true);
    assert.strictEqual(Input.down("PAD_A"), false);
  });

  it("GAMEPAD_* aliases resolve identically, case-insensitively", () => {
    const sys = makeSystem();
    sys.backend.setGamepads([pad(0, { [GamepadButton.X]: 1 })]);
    sys.update();
    assert.strictEqual(Input.down("GAMEPAD_X"), true);
    assert.strictEqual(Input.down("gamepad_x"), true);
    assert.strictEqual(Input.down("pad_x"), true);
  });

  it("triggers report analog value via value()", () => {
    const sys = makeSystem();
    sys.backend.setGamepads([pad(0, { [GamepadButton.RT]: 0.7 })]);
    sys.update();
    approx(Input.value("PAD_RT"), 0.7);
    assert.strictEqual(Input.value("PAD_LT"), 0);
    assert.strictEqual(Input.down("PAD_RT"), true);
  });

  it("sticks answer axis() with a dead-zoned vector", () => {
    const sys = makeSystem();
    sys.backend.setGamepads([pad(0, {}, [0.6, -0.8, 0, 0])]);
    sys.update();
    approxVec(Input.axis("PAD_LEFT_STICK"), { x: 0.6, y: -0.8 });
    assert.strictEqual(Input.down("PAD_LEFT_STICK"), true, "beyond the dead zone");
    assert.strictEqual(Input.value("PAD_LEFT_STICK"), 1);

    sys.backend.setGamepads([pad(0, {}, [0, 0, 0, 0])]);
    sys.update();
    assert.deepStrictEqual(Input.axis("PAD_LEFT_STICK"), { x: 0, y: 0 });
    assert.strictEqual(Input.down("PAD_LEFT_STICK"), false);
  });

  it("scalar axes resolve via down/value and a one-axis vector", () => {
    const sys = makeSystem();
    sys.backend.setGamepads([pad(0, {}, [0.6, 0, 0, 0])]);
    sys.update();
    assert.strictEqual(Input.down("PAD_LEFT_X"), true);
    approx(Input.value("PAD_LEFT_X"), 0.6);
    assert.strictEqual(Input.value("PAD_RIGHT_X"), 0);
    approxVec(Input.axis("PAD_LEFT_X"), { x: 0.6, y: 0 });
  });

  it("gamepad names do not leak into logical keyboard resolution", () => {
    const sys = makeSystem();
    sys.backend.keyDown("p", { code: "KeyP" });
    sys.update();
    assert.strictEqual(Input.down("p"), true, "logical key still works");
    assert.strictEqual(Input.down("PAD_A"), false, "no gamepad connected");
    assert.strictEqual(Input.down("pad_a"), false);
  });
});

describe("Input.gamepad facade", () => {
  it("reports count and connectivity", () => {
    const sys = makeSystem();
    assert.strictEqual(Input.gamepad.count, 0);
    sys.backend.setGamepads([pad(0)]);
    sys.update();
    assert.strictEqual(Input.gamepad.count, 1);
    assert.strictEqual(Input.gamepad.connected(0), true);
    assert.strictEqual(Input.gamepad.connected(1), false);
  });

  it("queries buttons by GamepadButton index", () => {
    const sys = makeSystem();
    sys.backend.setGamepads([pad(0, { [GamepadButton.A]: 1 })]);
    sys.update();
    assert.strictEqual(Input.gamepad.isDown(GamepadButton.A, 0), true);
    assert.strictEqual(Input.gamepad.pressed(GamepadButton.A, 0), true);
    sys.backend.setGamepads([pad(0)]);
    sys.update();
    assert.strictEqual(Input.gamepad.released(GamepadButton.A, 0), true);
  });

  it("exposes analog values and sticks", () => {
    const sys = makeSystem();
    sys.backend.setGamepads([pad(0, { [GamepadButton.RT]: 0.4 }, [0.5, 0, 0, 0])]);
    sys.update();
    approx(Input.gamepad.value(GamepadButton.RT, 0), 0.4);
    approxVec(Input.gamepad.stick(0, "left"), { x: 0.375, y: 0 });
  });

  it("get(index) returns a structured snapshot or null", () => {
    const sys = makeSystem();
    assert.strictEqual(Input.gamepad.get(0), null, "not connected");
    sys.backend.setGamepads([pad(0, { [GamepadButton.A]: 1, [GamepadButton.RT]: 0.8 }, [0, -1, 0, 0])]);
    sys.update();
    const snap = Input.gamepad.get(0);
    assert.ok(snap);
    assert.strictEqual(snap.id, "Xbox");
    assert.strictEqual(snap.buttons.a.pressed, true);
    approx(snap.buttons.rt.value, 0.8);
    assert.deepStrictEqual(snap.sticks.left, { x: 0, y: -1 });
    assert.strictEqual(snap.buttons.b.pressed, false);
  });

  it("handles a second gamepad by index", () => {
    const sys = makeSystem();
    sys.backend.setGamepads([null, pad(1, { [GamepadButton.Y]: 1 })]);
    sys.update();
    assert.strictEqual(Input.gamepad.count, 1);
    assert.strictEqual(Input.gamepad.isDown(GamepadButton.Y, 1), true);
    assert.strictEqual(Input.gamepad.isDown(GamepadButton.Y, 0), false);
  });
});
