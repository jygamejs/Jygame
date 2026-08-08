import { describe, it } from "node:test";
import * as assert from "node:assert";
import { InputSystem } from "../../input/InputSystem.js";
import { TestBackend } from "../../input/TestBackend.js";
import { Keyboard } from "../../input/Keyboard.js";
import { ContextStack } from "../../input/actions/ContextStack.js";
import { Input } from "../../input/Input.js";
import { KeyCode } from "../../input/KeyCode.js";
import { BindingCompiler } from "../../input/facade/BindingCompiler.js";
import { KeyBinding } from "../../input/actions/KeyBinding.js";
import { ChordBinding } from "../../input/actions/ChordBinding.js";
import { deserializeBinding } from "../../input/actions/Binding.js";

// Bindings follow the same convention as Input.pressed()/down()/released():
// "KeyM" is physical (event.code), "M"/"m" are logical (event.key), and the
// "wasd" / "arrowkeys" shorthands keep their physical, layout-independent
// behavior.

function makeSystem() {
  const sys = new InputSystem();
  sys.setBackend(new TestBackend());
  sys.devices.register(new Keyboard());
  sys.contextStack = new ContextStack();
  Input.setSystem(sys);
  return sys;
}

describe("logical key bindings (Input.bind)", () => {
  it('"m" binds the logical key, "KeyM" binds the physical key', () => {
    const sys = makeSystem();
    Input.bind("shoot", "m");
    Input.bind("aim", "KeyM");

    sys.backend.keyDown("m", { code: "Semicolon" }); // AZERTY M
    sys.update();
    assert.strictEqual(Input.down("shoot"), true, "logical binding fired");
    assert.strictEqual(Input.down("aim"), false, "physical code is Semicolon, not KeyM");

    sys.backend.keyUp("m", { code: "Semicolon" });
    sys.backend.keyDown("z", { code: "KeyM" }); // physical KeyM, logical z
    sys.update();
    assert.strictEqual(Input.down("aim"), true, "physical binding fired");
    assert.strictEqual(Input.down("shoot"), false, "the logical value is z, not m");
  });

  it("logical bindings are case-sensitive", () => {
    const sys = makeSystem();
    Input.bind("fire", "m");

    sys.backend.keyDown("m", { code: "KeyM" });
    sys.update();
    assert.strictEqual(Input.down("fire"), true);

    sys.backend.keyUp("m", { code: "KeyM" });
    sys.backend.keyDown("M", { code: "KeyM" }); // shift held
    sys.update();
    assert.strictEqual(Input.down("fire"), false, '"m" and "M" are different logical keys');
  });

  it("still reports justPressed and justReleased edges", () => {
    const sys = makeSystem();
    Input.bind("flash", "m");

    sys.backend.keyDown("m", { code: "Semicolon" });
    sys.update();
    assert.strictEqual(Input.pressed("flash"), true);

    sys.update();
    assert.strictEqual(Input.pressed("flash"), false, "held on the next frame");

    sys.backend.keyUp("m", { code: "Semicolon" });
    sys.update();
    assert.strictEqual(Input.released("flash"), true);
  });

  it("physical identifiers (SPACE, KeyA, ...) keep binding as before", () => {
    const sys = makeSystem();
    Input.bind("idle", "SPACE");
    Input.bind("left", "KeyA");

    sys.backend.keyDown(" ", { code: "Space" });
    sys.backend.keyDown("a", { code: "KeyA" });
    sys.update();
    assert.strictEqual(Input.down("idle"), true);
    assert.strictEqual(Input.down("left"), true);
  });

  it("removeBinding removes a logical binding", () => {
    const sys = makeSystem();
    Input.bind("shoot", "m");
    Input.removeBinding("shoot", "m");

    sys.backend.keyDown("m", { code: "Semicolon" });
    sys.update();
    assert.strictEqual(Input.down("shoot"), false, "binding was removed");
  });

  it("bindings() reports the logical key", () => {
    const sys = makeSystem();
    Input.bind("shoot", "m");
    Input.bind("jump", "SPACE");
    const all = Input.bindings();
    assert.deepStrictEqual(all.shoot, [{ type: "key", keyCode: null, key: "m" }]);
    assert.deepStrictEqual(all.jump, [{ type: "key", keyCode: KeyCode.SPACE }]);
  });

  it("logical chord bindings honour modifiers", () => {
    const sys = makeSystem();
    Input.bind("save", { key: "m", ctrl: true });

    sys.backend.keyDown("Control", { code: "ControlLeft" });
    sys.backend.keyDown("m", { code: "Semicolon" });
    sys.update();
    assert.strictEqual(Input.down("save"), true);

    sys.backend.keyUp("m", { code: "Semicolon" });
    sys.backend.keyUp("Control", { code: "ControlLeft" });
    sys.backend.keyDown("m", { code: "Semicolon" }); // no ctrl held now
    sys.update();
    assert.strictEqual(Input.down("save"), false, "the ctrl modifier is required");
  });
});

describe("movement shorthands stay physical", () => {
  it('"wasd" and "arrowkeys" still answer to the physical key positions', () => {
    const sys = makeSystem();
    Input.bind("move", ["wasd", "arrowkeys"]);

    sys.backend.keyDown("w", { code: "KeyW" });
    sys.update();
    assert.deepStrictEqual(Input.axis("move"), { x: 0, y: -1 }, "physical W moved up");

    sys.backend.keyUp("w", { code: "KeyW" });
    sys.backend.keyDown("ArrowLeft", { code: "ArrowLeft" });
    sys.update();
    assert.deepStrictEqual(Input.axis("move"), { x: -1, y: 0 }, "arrow left still works");

    sys.backend.keyUp("ArrowLeft", { code: "ArrowLeft" });
    sys.backend.keyDown("W", { code: "Semicolon" }); // logical W on a foreign position
    sys.update();
    assert.deepStrictEqual(Input.axis("move"), { x: 0, y: 0 },
      "a logical W must not drive the physical movement binding");
  });

  it('a plain "wasd" string compiles to physical sub-bindings', () => {
    const compiler = new BindingCompiler();
    const map = compiler.compile({ move: "wasd" });
    const entry = map.entries()[0];
    assert.strictEqual(entry.name, "move");
    assert.strictEqual(entry.bindings[0].type, "composite");
    const subs = entry.bindings[0].subBindings;
    assert.strictEqual(subs.length, 4);
    for (const sb of subs) {
      assert.strictEqual(sb.binding.isLogical, false, "every WASD direction is physical");
    }
  });
});

describe("Scene-style input maps", () => {
  it('idle: "SPACE" is physical, quit: "m" is logical, move is composite', () => {
    const compiler = new BindingCompiler();
    const map = compiler.compile({
      idle: "SPACE",
      move: ["wasd", "arrowkeys"],
      quit: "m",
    });
    const byName = Object.fromEntries(map.entries().map(e => [e.name, e]));

    const idle = byName.idle.bindings[0];
    assert.strictEqual(idle.type, "key");
    assert.strictEqual(idle.keyCode, KeyCode.SPACE);
    assert.strictEqual(idle.isLogical, false);

    const move = byName.move.bindings[0];
    assert.strictEqual(move.type, "composite");
    assert.strictEqual(move.subBindings.length, 8, "wasd + arrowkeys = 8 directions");
    assert.ok(move.subBindings.every(sb => !sb.binding.isLogical), "shorthands stay physical");

    const quit = byName.quit.bindings[0];
    assert.strictEqual(quit.type, "key");
    assert.strictEqual(quit.key, "m");
    assert.strictEqual(quit.isLogical, true);
  });

  it("logical KeyBinding serializes and round-trips", () => {
    const logical = new KeyBinding(null, "m");
    const restored = deserializeBinding(logical.serialize());
    assert.strictEqual(restored.isLogical, true);
    assert.strictEqual(restored.key, "m");
    assert.strictEqual(restored.keyCode, null);

    const physical = new KeyBinding(KeyCode.KEY_M);
    assert.deepStrictEqual(physical.serialize(), { type: "key", keyCode: KeyCode.KEY_M, processors: [] });

    const chord = new ChordBinding(null, { ctrl: true }, "m");
    const chordRestored = deserializeBinding(chord.serialize());
    assert.strictEqual(chordRestored.key, "m");
    assert.strictEqual(chordRestored.isLogical, true);
  });
});
