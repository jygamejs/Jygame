import { describe, it } from "node:test";
import * as assert from "node:assert";
import { InputSystem } from "../../input/InputSystem.js";
import { TestBackend } from "../../input/TestBackend.js";
import { Keyboard } from "../../input/Keyboard.js";
import { KeyboardState } from "../../input/KeyboardState.js";
import { ContextStack } from "../../input/actions/ContextStack.js";
import { Input } from "../../input/Input.js";
import { KeyCode } from "../../input/KeyCode.js";
import { InputEventQueue } from "../../input/InputEventQueue.js";
import { InputEvent } from "../../input/InputEvent.js";
import { EventType } from "../../input/EventType.js";
import { Tier } from "../../input/Tier.js";

// Physical resolution compares the identifier against KeyboardEvent.code;
// logical resolution compares it against the exact KeyboardEvent.key value.
// The AZERTY "M" problem is exactly the divergence: a French keyboard reports
// event.code === "Semicolon" while event.key === "m".

function makeSystem() {
  const sys = new InputSystem();
  sys.setBackend(new TestBackend());
  sys.devices.register(new Keyboard());
  sys.contextStack = new ContextStack();
  Input.setSystem(sys);
  return sys;
}

function keyDownEvent(key, options = {}) {
  return new InputEvent(EventType.KEY_DOWN, {
    key,
    code: options.code || key,
    repeat: options.repeat || false,
    ctrl: false, shift: false, alt: false, meta: false,
    printable: false,
    ...options,
  });
}

function keyUpEvent(key, options = {}) {
  return new InputEvent(EventType.KEY_UP, {
    key,
    code: options.code || key,
    ctrl: false, shift: false, alt: false, meta: false,
    ...options,
  });
}

function queueWith(...events) {
  const q = new InputEventQueue(64);
  for (const e of events) q.push(e, Tier.HIGH);
  return q;
}

describe("physical key resolution uses event.code", () => {
  it("KeyM resolves through the physical code", () => {
    const sys = makeSystem();
    sys.backend.keyDown("m", { code: "KeyM" });
    sys.update();
    assert.strictEqual(Input.down("KeyM"), true);
    assert.strictEqual(Input.pressed("KeyM"), true);

    sys.update(); // held — no fresh edge
    assert.strictEqual(Input.pressed("KeyM"), false);
    assert.strictEqual(Input.down("KeyM"), true);

    sys.backend.keyUp("m", { code: "KeyM" });
    sys.update();
    assert.strictEqual(Input.released("KeyM"), true);
    assert.strictEqual(Input.down("KeyM"), false);
  });

  it("KeyW and KeyA keep their layout-independent meaning", () => {
    const sys = makeSystem();
    sys.backend.keyDown("w", { code: "KeyW" });
    sys.backend.keyDown("a", { code: "KeyA" });
    sys.update();
    assert.strictEqual(Input.down("KeyW"), true);
    assert.strictEqual(Input.down("KeyA"), true);
    assert.strictEqual(Input.down("KeyS"), false);
  });

  it("recognises physical codes regardless of casing", () => {
    const sys = makeSystem();
    sys.backend.keyDown("w", { code: "KeyW" });
    sys.update();
    assert.strictEqual(Input.down("keyw"), true);
    assert.strictEqual(Input.down("KEYW"), true);
  });
});

describe("logical key resolution uses event.key", () => {
  it("single characters resolve through the exact key value", () => {
    const sys = makeSystem();
    sys.backend.keyDown("m", { code: "Semicolon" });
    sys.update();
    assert.strictEqual(Input.down("m"), true);
    assert.strictEqual(Input.pressed("m"), true);

    sys.backend.keyUp("m", { code: "Semicolon" });
    sys.update();
    assert.strictEqual(Input.released("m"), true);
    assert.strictEqual(Input.down("m"), false);
  });

  it("value() reflects both logical and physical keys", () => {
    const sys = makeSystem();
    sys.backend.keyDown("m", { code: "Semicolon" });
    sys.update();
    assert.strictEqual(Input.value("m"), 1);
    assert.strictEqual(Input.value("Semicolon"), 1);
    assert.strictEqual(Input.value("KeyM"), 0);
  });

  it("international keys resolve logically", () => {
    const sys = makeSystem();
    // On AZERTY the key labelled "1" produces "&".
    sys.backend.keyDown("&", { code: "Digit1" });
    sys.update();
    assert.strictEqual(Input.down("&"), true);
    assert.strictEqual(Input.down("1"), false, "the produced value is &, not 1");
  });

  it("dead keys pass through as their browser value, unnormalised", () => {
    const sys = makeSystem();
    sys.backend.keyDown("Dead", { code: "Quote" });
    sys.update();
    assert.strictEqual(Input.down("Dead"), true);
    assert.strictEqual(Input.down("'"), false, "the engine does not translate Dead");
  });
});

describe("physical and logical divergence (the AZERTY case)", () => {
  it("splits one key event across both representations", () => {
    const sys = makeSystem();
    sys.backend.keyDown("m", { code: "Semicolon" });
    sys.update();

    assert.strictEqual(Input.pressed("Semicolon"), true, "physical Semicolon");
    assert.strictEqual(Input.pressed("m"), true, "logical m");
    assert.strictEqual(Input.pressed("KeyM"), false, "the physical code is Semicolon, not KeyM");
    assert.strictEqual(Input.pressed("M"), false, "logical keys are case-sensitive");
  });

  it("physical and logical paths are genuinely independent", () => {
    const sys = makeSystem();
    sys.backend.keyDown("q", { code: "KeyM" }); // code !== key
    sys.update();

    assert.strictEqual(Input.down("KeyM"), true, "physical via code");
    assert.strictEqual(Input.down("q"), true, "logical via key");
    assert.strictEqual(Input.down("m"), false, "the logical value is q, not m");
    assert.strictEqual(Input.down("Semicolon"), false, "the physical code is KeyM, not Semicolon");
  });
});

describe("special keys keep their existing behavior", () => {
  it("Tab, Enter, Escape, ArrowUp and Space stay physical", () => {
    const sys = makeSystem();
    sys.backend.keyDown(" ", { code: "Space" });
    sys.backend.keyDown("Enter", { code: "Enter" });
    sys.backend.keyDown("Tab", { code: "Tab" });
    sys.backend.keyDown("Escape", { code: "Escape" });
    sys.backend.keyDown("ArrowUp", { code: "ArrowUp" });
    sys.update();
    assert.strictEqual(Input.down("Space"), true);
    assert.strictEqual(Input.down("Enter"), true);
    assert.strictEqual(Input.down("Tab"), true);
    assert.strictEqual(Input.down("Escape"), true);
    assert.strictEqual(Input.down("ArrowUp"), true);
  });

  it('"Space" (physical) and " " (logical) both answer for the space bar', () => {
    const sys = makeSystem();
    sys.backend.keyDown(" ", { code: "Space" });
    sys.update();
    assert.strictEqual(Input.down("Space"), true);
    assert.strictEqual(Input.down(" "), true);
  });

  it("modifier identifiers remain queryable", () => {
    const sys = makeSystem();
    sys.backend.keyDown("Shift", { code: "ShiftLeft" });
    sys.update();
    assert.strictEqual(Input.down("Shift"), true, "legacy alias stays physical");
    assert.strictEqual(Input.down("ShiftLeft"), true, "canonical physical code");
  });
});

describe("invalid identifiers", () => {
  it('"KeyFoo" is not a physical code just because it starts with "Key"', () => {
    const sys = makeSystem();
    sys.backend.keyDown("foo", { code: "KeyM" });
    sys.update();
    assert.strictEqual(Input.down("KeyFoo"), false);
    assert.strictEqual(Input.down("KeyM"), true, "a real physical code still matches");
  });
});

describe("logical keys are case-sensitive", () => {
  it('"m" and "M" are different logical values', () => {
    const sys = makeSystem();
    sys.backend.keyDown("m", { code: "KeyM" });
    sys.update();
    assert.strictEqual(Input.down("m"), true);
    assert.strictEqual(Input.down("M"), false, "the browser reported lowercase m");

    sys.backend.keyUp("m", { code: "KeyM" });
    sys.backend.keyDown("M", { code: "KeyM" }); // shift held
    sys.update();
    assert.strictEqual(Input.down("M"), true);
    assert.strictEqual(Input.down("m"), false);
  });
});

describe("multiple physical keys producing one logical key", () => {
  it("the logical key stays down until every physical source is released", () => {
    const sys = makeSystem();
    // Digit1 and Numpad1 both report event.key === "1".
    sys.backend.keyDown("1", { code: "Digit1" });
    sys.backend.keyDown("1", { code: "Numpad1" });
    sys.update();
    assert.strictEqual(Input.down("1"), true);

    sys.backend.keyUp("1", { code: "Digit1" });
    sys.update();
    assert.strictEqual(Input.down("1"), true, "numpad 1 is still held");

    sys.backend.keyUp("1", { code: "Numpad1" });
    sys.update();
    assert.strictEqual(Input.down("1"), false);
  });

  it("Enter and NumpadEnter collapse at the device level", () => {
    const kb = new Keyboard();
    kb.update(queueWith(
      keyDownEvent("Enter", { code: "Enter" }),
      keyDownEvent("Enter", { code: "NumpadEnter" }),
    ));
    assert.strictEqual(kb.isLogicalDown("Enter"), true);
    kb.update(queueWith(keyUpEvent("Enter", { code: "Enter" })));
    assert.strictEqual(kb.isLogicalDown("Enter"), true);
    kb.update(queueWith(keyUpEvent("Enter", { code: "NumpadEnter" })));
    assert.strictEqual(kb.isLogicalDown("Enter"), false);
  });
});

describe("KeyboardState logical API", () => {
  it("tracks down / justPressed / justReleased", () => {
    const ks = new KeyboardState();
    ks.snapshot();
    ks.logicalPress("m");
    assert.strictEqual(ks.logicalIsDown("m"), true);
    assert.strictEqual(ks.logicalJustPressed("m"), true);

    ks.snapshot();
    assert.strictEqual(ks.logicalJustPressed("m"), false);
    assert.strictEqual(ks.logicalIsDown("m"), true);

    ks.logicalRelease("m");
    assert.strictEqual(ks.logicalIsDown("m"), false);
    assert.strictEqual(ks.logicalJustReleased("m"), true);
  });

  it("tracks repeat independently", () => {
    const ks = new KeyboardState();
    ks.snapshot();
    ks.logicalPress("a");
    ks.logicalPress("a", true);
    assert.strictEqual(ks.logicalRepeat("a"), true);
    ks.snapshot();
    assert.strictEqual(ks.logicalRepeat("a"), false);
  });

  it("reset clears logical state", () => {
    const ks = new KeyboardState();
    ks.logicalPress("m");
    ks.reset();
    assert.strictEqual(ks.logicalIsDown("m"), false);
  });

  it("a key pressed again after release reads as justPressed again", () => {
    const ks = new KeyboardState();
    ks.snapshot();
    ks.logicalPress("m");              // frame 1 press
    ks.snapshot();                     // frame 2
    ks.logicalRelease("m");            // frame 2 release
    assert.strictEqual(ks.logicalJustReleased("m"), true);

    ks.snapshot();                     // frame 3 — must clear the stale prev
    ks.logicalPress("m");              // frame 3 re-press
    assert.strictEqual(ks.logicalJustPressed("m"), true,
      "a re-press after a release must not read as already held");
    assert.strictEqual(ks.logicalIsDown("m"), true);
  });
});

describe("Keyboard feeds event.key into logical state", () => {
  it("tracks the logical side alongside the physical side", () => {
    const kb = new Keyboard();
    kb.update(queueWith(keyDownEvent("m", { code: "Semicolon" })));
    assert.strictEqual(kb.isLogicalDown("m"), true);
    assert.strictEqual(kb.logicalJustPressed("m"), true);
    assert.strictEqual(kb.isDown(KeyCode.SEMICOLON), true, "physical side also tracked");

    kb.update(queueWith(keyUpEvent("m", { code: "Semicolon" })));
    assert.strictEqual(kb.isLogicalDown("m"), false);
    assert.strictEqual(kb.isDown(KeyCode.SEMICOLON), false);
  });
});
