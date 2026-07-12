import { describe, it } from "node:test";
import * as assert from "node:assert";
import { ActionKind } from "../../input/ActionKind.js";
import { ActionState } from "../../input/actions/ActionState.js";

describe("ActionKind", () => {
  it("DIGITAL is 0", () => assert.strictEqual(ActionKind.DIGITAL, 0));
  it("ANALOG is 1", () => assert.strictEqual(ActionKind.ANALOG, 1));
  it("VECTOR2 is 2", () => assert.strictEqual(ActionKind.VECTOR2, 2));
  it("is frozen", () => assert.ok(Object.isFrozen(ActionKind)));
});

describe("ActionState", () => {
  it("starts unpressed", () => {
    const s = new ActionState();
    assert.strictEqual(s.pressed, false);
    assert.strictEqual(s.justPressed, false);
    assert.strictEqual(s.justReleased, false);
    assert.strictEqual(s.strength, 0);
  });

  it("defaults to DIGITAL kind", () => {
    const s = new ActionState();
    assert.strictEqual(s.kind, ActionKind.DIGITAL);
  });

  describe("pressed / justPressed / justReleased", () => {
    it("pressed is true when strength > 0", () => {
      const s = new ActionState();
      s._update(1);
      assert.strictEqual(s.pressed, true);
    });

    it("justPressed is true on first frame of press", () => {
      const s = new ActionState();
      s.snapshot();
      s._update(1);
      assert.strictEqual(s.justPressed, true);
    });

    it("justPressed is false on held frame", () => {
      const s = new ActionState();
      s._update(1);
      s.snapshot();
      s._update(1);
      assert.strictEqual(s.justPressed, false);
    });

    it("justReleased is true on release", () => {
      const s = new ActionState();
      s._update(1);
      s.snapshot();
      s._update(0);
      assert.strictEqual(s.justReleased, true);
    });

    it("justReleased is false after release frame", () => {
      const s = new ActionState();
      s._update(1);
      s.snapshot();
      s._update(0);
      s.snapshot();
      s._update(0);
      assert.strictEqual(s.justReleased, false);
    });
  });

  describe("strength", () => {
    it("returns the raw strength for ANALOG kind", () => {
      const s = new ActionState(ActionKind.ANALOG);
      s._update(0.75);
      assert.strictEqual(s.strength, 0.75);
    });

    it("returns 0 or 1 for DIGITAL kind", () => {
      const s = new ActionState(ActionKind.DIGITAL);
      s._update(0.5);
      assert.strictEqual(s.strength, 1);
      s._update(0);
      assert.strictEqual(s.strength, 0);
    });

    it("clamps strength to [0, 1]", () => {
      const s = new ActionState(ActionKind.ANALOG);
      s._update(-0.5);
      assert.strictEqual(s.strength, 0);
      s._update(1.5);
      assert.strictEqual(s.strength, 1);
    });
  });

  describe("vector", () => {
    it("returns zero vector for non-VECTOR2 kinds", () => {
      const s = new ActionState(ActionKind.DIGITAL);
      assert.deepStrictEqual(s.vector, { x: 0, y: 0 });
      const a = new ActionState(ActionKind.ANALOG);
      assert.deepStrictEqual(a.vector, { x: 0, y: 0 });
    });

    it("returns vector for VECTOR2 kind", () => {
      const s = new ActionState(ActionKind.VECTOR2);
      s._update(1, { x: 0.5, y: -0.5 });
      assert.deepStrictEqual(s.vector, { x: 0.5, y: -0.5 });
    });
  });

  describe("input buffering", () => {
    it("isBuffered is false initially", () => {
      const s = new ActionState();
      assert.strictEqual(s.isBuffered, false);
    });

    it("buffer primes the buffer", () => {
      const s = new ActionState();
      s.buffer(100);
      assert.strictEqual(s.isBuffered, true);
    });

    it("consumeBuffered returns true and clears", () => {
      const s = new ActionState();
      s.buffer(100);
      assert.strictEqual(s.consumeBuffered(), true);
      assert.strictEqual(s.isBuffered, false);
    });

    it("consumeBuffered returns false when not buffered", () => {
      const s = new ActionState();
      assert.strictEqual(s.consumeBuffered(), false);
    });

    it("snapshot decrements the buffer timer", () => {
      const s = new ActionState();
      s.buffer(50);
      s.snapshot();
      assert.strictEqual(s.isBuffered, true);
      s.snapshot();
      s.snapshot();
      assert.strictEqual(s.isBuffered, false);
    });
  });
});
