import { describe, it } from "node:test";
import * as assert from "node:assert";
import { TextInput } from "../../input/TextInput.js";
import { InputEventQueue } from "../../input/InputEventQueue.js";
import { InputEvent } from "../../input/InputEvent.js";
import { EventType } from "../../input/EventType.js";
import { Tier } from "../../input/Tier.js";

function keyDown(key, printable = true) {
  return new InputEvent(EventType.KEY_DOWN, {
    key, code: key, repeat: false,
    ctrl: false, shift: false, alt: false, meta: false,
    printable,
  });
}

function compositionStart(data = "") {
  return new InputEvent(EventType.COMPOSITION_START, { data });
}

function compositionUpdate(data = "") {
  return new InputEvent(EventType.COMPOSITION_UPDATE, { data });
}

function compositionEnd(data = "") {
  return new InputEvent(EventType.COMPOSITION_END, { data });
}

function queueWith(...events) {
  const q = new InputEventQueue(64);
  for (const e of events) q.push(e, Tier.NORMAL);
  return q;
}

describe("TextInput", () => {
  it("extends Device and has correct type", () => {
    const ti = new TextInput();
    assert.strictEqual(ti.type, TextInput);
  });

  it("starts with no composition active", () => {
    const ti = new TextInput();
    assert.strictEqual(ti.compositionActive, false);
    assert.strictEqual(ti.compositionString, "");
    assert.deepStrictEqual(ti.consumeCharacters(), []);
  });

  describe("printable characters", () => {
    it("buffers printable key presses", () => {
      const ti = new TextInput();
      ti.update(queueWith(keyDown("a"), keyDown("b"), keyDown("c")));
      assert.deepStrictEqual(ti.consumeCharacters(), ["a", "b", "c"]);
    });

    it("buffers only once per key press per frame", () => {
      const ti = new TextInput();
      ti.update(queueWith(keyDown("x")));
      assert.deepStrictEqual(ti.consumeCharacters(), ["x"]);
    });

    it("ignores non-printable key events", () => {
      const ti = new TextInput();
      ti.update(queueWith(keyDown("Enter", false), keyDown("ArrowUp", false), keyDown("F1", false)));
      assert.deepStrictEqual(ti.consumeCharacters(), []);
    });

    it("clears buffer after consumeCharacters", () => {
      const ti = new TextInput();
      ti.update(queueWith(keyDown("h")));
      ti.consumeCharacters();
      assert.deepStrictEqual(ti.consumeCharacters(), []);
    });

    it("buffers characters frame by frame", () => {
      const ti = new TextInput();
      ti.update(queueWith(keyDown("h"), keyDown("i")));
      assert.deepStrictEqual(ti.consumeCharacters(), ["h", "i"]);

      ti.update(queueWith(keyDown("!")));
      assert.deepStrictEqual(ti.consumeCharacters(), ["!"]);
    });
  });

  describe("IME composition", () => {
    it("starts composition on COMPOSITION_START", () => {
      const ti = new TextInput();
      ti.update(queueWith(compositionStart("")));
      assert.strictEqual(ti.compositionActive, true);
    });

    it("updates composition string on COMPOSITION_UPDATE", () => {
      const ti = new TextInput();
      ti.update(queueWith(compositionStart("")));
      ti.update(queueWith(compositionUpdate("h")));
      ti.update(queueWith(compositionUpdate("he")));
      ti.update(queueWith(compositionUpdate("hel")));
      assert.strictEqual(ti.compositionString, "hel");
    });

    it("ends composition and commits on COMPOSITION_END", () => {
      const ti = new TextInput();
      ti.update(queueWith(compositionStart("")));
      ti.update(queueWith(compositionUpdate("hello")));
      ti.update(queueWith(compositionEnd("hello")));

      assert.strictEqual(ti.compositionActive, false);
      assert.strictEqual(ti.compositionString, "");
      assert.deepStrictEqual(ti.consumeCharacters(), ["hello"]);
    });

    it("ignores printable key events during composition", () => {
      const ti = new TextInput();
      ti.update(queueWith(compositionStart("")));
      // Key events during composition should be ignored by TextInput
      ti.update(queueWith(keyDown("x")));
      assert.deepStrictEqual(ti.consumeCharacters(), []);
    });

    it("handles multi-step composition", () => {
      const ti = new TextInput();
      ti.update(queueWith(compositionStart("")));
      ti.update(queueWith(compositionUpdate("ni")));
      ti.update(queueWith(compositionUpdate("nih")));
      ti.update(queueWith(compositionUpdate("nihao")));
      ti.update(queueWith(compositionEnd("nihao")));

      assert.strictEqual(ti.compositionActive, false);
      assert.deepStrictEqual(ti.consumeCharacters(), ["nihao"]);
    });

    it("handles composition with empty data gracefully", () => {
      const ti = new TextInput();
      ti.update(queueWith(compositionStart("")));
      ti.update(queueWith(compositionEnd("")));
      assert.strictEqual(ti.compositionActive, false);
      assert.deepStrictEqual(ti.consumeCharacters(), []);
    });
  });

  describe("mixed input", () => {
    it("interleaves typed characters with composition", () => {
      const ti = new TextInput();

      ti.update(queueWith(keyDown("a"), keyDown("b")));
      assert.deepStrictEqual(ti.consumeCharacters(), ["a", "b"]);

      ti.update(queueWith(compositionStart("")));
      ti.update(queueWith(compositionUpdate("你")));
      ti.update(queueWith(compositionEnd("你")));
      assert.deepStrictEqual(ti.consumeCharacters(), ["你"]);

      ti.update(queueWith(keyDown("c")));
      assert.deepStrictEqual(ti.consumeCharacters(), ["c"]);
    });
  });
});
