import { describe, it } from "node:test";
import * as assert from "node:assert";
import { InputSystem } from "../../input/InputSystem.js";
import { TestBackend } from "../../input/TestBackend.js";
import { Keyboard } from "../../input/Keyboard.js";
import { Gamepad } from "../../input/Gamepad.js";
import { ContextStack } from "../../input/actions/ContextStack.js";
import { Input } from "../../input/Input.js";
import { GamepadButton } from "../../input/GamepadButton.js";

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

// Actions, raw keys, mouse buttons, gamepad identifiers and gesture names all
// share one string namespace. The rule is load-bearing: an action name is
// resolved FIRST, so a bound action shadows any device/gesture identifier it
// happens to collide with. These tests pin that order down.
describe("resolution priority: actions over raw identifiers", () => {
  it("a raw identifier resolves to the device when no action shadows it", () => {
    const sys = makeSystem();
    sys.backend.setGamepads([pad(0, { [GamepadButton.A]: 1 })]);
    sys.update();
    assert.strictEqual(Input.down("PAD_A"), true);
  });

  it('an action named "PAD_A" shadows the gamepad identifier', () => {
    const sys = makeSystem();
    Input.bind("PAD_A", "KeyX"); // deliberate collision
    sys.backend.keyDown("x", { code: "KeyX" });
    sys.update();

    assert.strictEqual(Input.down("PAD_A"), true, "returns the action (KeyX held)");

    // The gamepad A button is now unreachable through that name.
    sys.backend.keyUp("x", { code: "KeyX" });
    sys.backend.setGamepads([pad(0, { [GamepadButton.A]: 1 })]);
    sys.update();
    assert.strictEqual(Input.down("PAD_A"), false,
      "gamepad A is shadowed by the action while the action exists");
  });

  it('an action named "tap" shadows the gesture name', () => {
    const sys = makeSystem();
    Input.bind("tap", "KeyT");
    sys.backend.keyDown("t", { code: "KeyT" });
    sys.update();
    assert.strictEqual(Input.down("tap"), true, "action wins over the gesture name");
  });

  it("a physical key name shadowed by an action resolves to the action", () => {
    const sys = makeSystem();
    Input.bind("Space", "KeyQ");
    sys.backend.keyDown("q", { code: "KeyQ" });
    sys.update();
    assert.strictEqual(Input.down("Space"), true, "the action Space -> KeyQ wins");
    sys.backend.keyUp("q", { code: "KeyQ" });
    sys.backend.keyDown(" ", { code: "Space" });
    sys.update();
    assert.strictEqual(Input.down("Space"), false, "the raw Space bar is shadowed");
  });

  it("a colliding bind warns once", () => {
    const sys = makeSystem();
    const warnings = [];
    const origWarn = console.warn;
    console.warn = (msg) => warnings.push(String(msg));
    try {
      Input.bind("PAD_B", "KeyY");
      Input.bind("PAD_B", "KeyZ"); // same colliding name again
    } finally {
      console.warn = origWarn;
    }
    const colliding = warnings.filter(w => w.includes("shadows the built-in input identifier"));
    assert.strictEqual(colliding.length, 1, "warn exactly once per colliding name");
  });

  it("a non-colliding action name never warns", () => {
    const sys = makeSystem();
    const warnings = [];
    const origWarn = console.warn;
    console.warn = (msg) => warnings.push(String(msg));
    try {
      Input.bind("jump", "KeyW");
      Input.bind("shoot", "PAD_A");
    } finally {
      console.warn = origWarn;
    }
    assert.strictEqual(warnings.filter(w => w.includes("shadows the built-in")).length, 0);
  });
});

describe("chord modifiers", () => {
  it("listed modifiers are required, unlisted modifiers do not block", () => {
    const sys = makeSystem();
    Input.bind("save", { key: "KeyS", ctrl: true });

    // Ctrl + Shift + S: the listed modifier (ctrl) is held, shift is extra.
    sys.backend.keyDown("Control", { code: "ControlLeft" });
    sys.backend.keyDown("Shift", { code: "ShiftLeft" });
    sys.backend.keyDown("s", { code: "KeyS" });
    sys.update();
    assert.strictEqual(Input.down("save"), true, "extra held modifiers must not block");

    // Without ctrl, the chord does not fire even though shift is held.
    sys.backend.keyUp("Control", { code: "ControlLeft" });
    sys.update();
    assert.strictEqual(Input.down("save"), false, "a listed modifier that is missing blocks the chord");
  });
});
