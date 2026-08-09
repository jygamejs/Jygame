import { describe, it } from "node:test";
import * as assert from "node:assert";
import { DeviceRegistry } from "../../input/DeviceRegistry.js";
import { Gamepad } from "../../input/Gamepad.js";
import { InputEventQueue } from "../../input/InputEventQueue.js";
import { GamepadButton } from "../../input/GamepadButton.js";
import { GamepadAxis } from "../../input/GamepadAxis.js";
import { GamepadButtonBinding } from "../../input/actions/GamepadButtonBinding.js";
import { GamepadAxisBinding } from "../../input/actions/GamepadAxisBinding.js";
import { GamepadStickBinding } from "../../input/actions/GamepadStickBinding.js";
import { ActionKind } from "../../input/ActionKind.js";
import { ActionMap } from "../../input/actions/ActionMap.js";
import { BindingCompiler } from "../../input/facade/BindingCompiler.js";
import { InputSystem } from "../../input/InputSystem.js";
import { TestBackend } from "../../input/TestBackend.js";
import { ContextStack } from "../../input/actions/ContextStack.js";
import { Input } from "../../input/Input.js";

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
  sys.devices.register(new Gamepad(() => sys.backend.gamepads));
  sys.contextStack = new ContextStack();
  Input.setSystem(sys);
  return sys;
}

describe("GamepadButtonBinding", () => {
  it("returns 1 for a held button", () => {
    const registry = new DeviceRegistry();
    const gp = new Gamepad(() => [pad(0, { [GamepadButton.A]: 1 })]);
    registry.register(gp);
    gp.update(new InputEventQueue(64));

    assert.strictEqual(new GamepadButtonBinding(GamepadButton.A).evaluate(registry), 1);
  });

  it("carries trigger analog value through", () => {
    const registry = new DeviceRegistry();
    const gp = new Gamepad(() => [pad(0, { [GamepadButton.RT]: 0.7 })]);
    registry.register(gp);
    gp.update(new InputEventQueue(64));

    const value = new GamepadButtonBinding(GamepadButton.RT).evaluate(registry);
    assert.ok(Math.abs(value - 0.7) < 1e-6);
  });

  it("returns 0 without a gamepad device", () => {
    assert.strictEqual(new GamepadButtonBinding(GamepadButton.A).evaluate(new DeviceRegistry()), 0);
  });
});

describe("GamepadAxisBinding and GamepadStickBinding", () => {
  it("axis binding returns magnitude", () => {
    const registry = new DeviceRegistry();
    const gp = new Gamepad(() => [pad(0, {}, [0.5, 0, 0, 0])]);
    registry.register(gp);
    gp.update(new InputEventQueue(64));

    assert.strictEqual(new GamepadAxisBinding(GamepadAxis.LEFT_X).evaluate(registry), 0.5);
    assert.strictEqual(new GamepadAxisBinding(GamepadAxis.RIGHT_X).evaluate(registry), 0);
  });

  it("stick binding returns magnitude and a vector", () => {
    const registry = new DeviceRegistry();
    const gp = new Gamepad(() => [pad(0, {}, [0.6, -0.8, 0, 0])], { deadZone: 0.2 });
    registry.register(gp);
    gp.update(new InputEventQueue(64));

    const b = new GamepadStickBinding("left");
    assert.strictEqual(b.evaluate(registry), 1);
    assert.ok(Math.abs(b.vector.x - 0.6) < 1e-6);
    assert.ok(Math.abs(b.vector.y - -0.8) < 1e-6);
  });

  it("stick binding serializes and round-trips", () => {
    const b = new GamepadStickBinding("right", 1);
    const restored = GamepadStickBinding.deserialize(b.serialize());
    assert.strictEqual(restored.side, "right");
    assert.strictEqual(restored.gamepadIndex, 1);
  });
});

describe("BindingCompiler gamepad identifiers", () => {
  it('"PAD_A" compiles to a digital GamepadButtonBinding', () => {
    const map = new BindingCompiler().compile({ jump: "PAD_A" });
    const [b] = map.entries()[0].bindings;
    assert.strictEqual(b.type, "gamepadButton");
    assert.strictEqual(b.button, GamepadButton.A);
  });

  it('"PAD_RT" compiles as an analog action', () => {
    const map = new BindingCompiler().compile({ throttle: "PAD_RT" });
    const entry = map.entries()[0];
    assert.strictEqual(entry.state.kind, ActionKind.ANALOG);
  });

  it('"PAD_LEFT_STICK" compiles as a VECTOR2 stick binding', () => {
    const map = new BindingCompiler().compile({ move: "PAD_LEFT_STICK" });
    const entry = map.entries()[0];
    assert.strictEqual(entry.state.kind, ActionKind.VECTOR2);
    assert.strictEqual(entry.bindings[0].type, "gamepadStick");
  });

  it("drives an action end to end through the facade", () => {
    const sys = makeSystem();
    Input.bind("jump", "PAD_A");
    sys.backend.setGamepads([pad(0, { [GamepadButton.A]: 1 })]);
    sys.update();
    assert.strictEqual(Input.pressed("jump"), true);
    assert.strictEqual(Input.down("jump"), true);

    sys.update();
    assert.strictEqual(Input.pressed("jump"), false);

    sys.backend.setGamepads([pad(0)]);
    sys.update();
    assert.strictEqual(Input.released("jump"), true);
  });

  it("a stick bound as move reads through Input.axis", () => {
    const sys = makeSystem();
    Input.bind("move", "PAD_LEFT_STICK");
    sys.backend.setGamepads([pad(0, {}, [0, -1, 0, 0])]);
    sys.update();
    assert.deepStrictEqual(Input.axis("move"), { x: 0, y: -1 });
  });
});

describe("gamepad movement shorthands", () => {
  it('["padstick", "padd"] compiles to stick + d-pad subs', () => {
    const map = new BindingCompiler().compile({ move: ["padstick", "padd"] });
    const entry = map.entries()[0];
    assert.strictEqual(entry.state.kind, ActionKind.VECTOR2);
    const subs = entry.bindings[0].subBindings;
    assert.strictEqual(subs.length, 5, "1 stick + 4 d-pad directions");
    assert.strictEqual(subs[0].binding.type, "gamepadStick");
    assert.strictEqual(subs[0].binding.side, "left");
    assert.ok(subs.slice(1).every(sb => sb.binding.type === "gamepadButton"));
  });

  it("the combined shorthand reads the analog stick", () => {
    const sys = makeSystem();
    Input.bind("move", ["padstick", "padd"]);
    sys.backend.setGamepads([pad(0, {}, [0.5, 0, 0, 0])]);
    sys.update();
    assert.ok(Math.abs(Input.axis("move").x - 0.375) < 1e-6, "half deflection stays analog");
    assert.strictEqual(Input.axis("move").y, 0);
  });

  it("the d-pad part drives digital directions and normalizes diagonals", () => {
    const sys = makeSystem();
    Input.bind("move", ["padstick", "padd"]);

    sys.backend.setGamepads([pad(0, { [GamepadButton.DPAD_LEFT]: 1 })]);
    sys.update();
    assert.deepStrictEqual(Input.axis("move"), { x: -1, y: 0 });

    sys.backend.setGamepads([pad(0, { [GamepadButton.DPAD_UP]: 1, [GamepadButton.DPAD_RIGHT]: 1 })]);
    sys.update();
    assert.ok(Math.abs(Input.axis("move").x - Math.SQRT1_2) < 1e-6);
    assert.ok(Math.abs(Input.axis("move").y - -Math.SQRT1_2) < 1e-6);
  });

  it('"padd" alone binds just the d-pad', () => {
    const map = new BindingCompiler().compile({ nav: "padd" });
    const subs = map.entries()[0].bindings[0].subBindings;
    assert.strictEqual(subs.length, 4);
    assert.ok(subs.every(sb => sb.binding.type === "gamepadButton"));
  });

  it('"pad" is the combined shorthand', () => {
    const sys = makeSystem();
    Input.bind("move", "pad");
    sys.backend.setGamepads([pad(0, { [GamepadButton.DPAD_DOWN]: 1 })]);
    sys.update();
    assert.deepStrictEqual(Input.axis("move"), { x: 0, y: 1 });
  });

  it("gamepad and keyboard shorthands mix", () => {
    const sys = makeSystem();
    Input.bind("move", ["wasd", "padd"]);
    sys.backend.setGamepads([pad(0, { [GamepadButton.DPAD_UP]: 1 })]);
    sys.update();
    assert.deepStrictEqual(Input.axis("move"), { x: 0, y: -1 });
  });

  it("the explicit d-pad object form works too", () => {
    const sys = makeSystem();
    Input.bind("nav", {
      up: "PAD_DPAD_UP",
      down: "PAD_DPAD_DOWN",
      left: "PAD_DPAD_LEFT",
      right: "PAD_DPAD_RIGHT",
    });
    sys.backend.setGamepads([pad(0, { [GamepadButton.DPAD_RIGHT]: 1 })]);
    sys.update();
    assert.deepStrictEqual(Input.axis("nav"), { x: 1, y: 0 });
  });

  it("a composite with a dynamic stick sub serializes and round-trips", () => {
    const compiler = new BindingCompiler();
    const map = compiler.compile({ move: ["padstick", "padd"] });
    const restored = ActionMap.deserialize(map.serialize());
    const entry = restored.entries()[0];
    assert.strictEqual(entry.state.kind, ActionKind.VECTOR2);
    assert.strictEqual(entry.bindings[0].type, "composite");
    assert.strictEqual(entry.bindings[0].subBindings[0].binding.type, "gamepadStick");
  });
});
