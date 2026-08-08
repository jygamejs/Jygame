import { describe, it, beforeEach } from "node:test";
import * as assert from "node:assert";

import { SceneStack } from "../../../core/SceneStack.js";
import { SceneContext } from "../../../core/SceneContext.js";
import { Scene } from "../../../core/Scene.js";
import { HeadlessHost, HeadlessElement, createHeadlessContext2D } from "../../../core/Host.js";

// No DOM globals here: a Scene now depends on a SceneContext, not a Game, so
// the stack can be driven on its own.

function makeContext({ stack = null, host = new HeadlessHost(), uiLayer = null } = {}) {
  const ctx2d = createHeadlessContext2D();
  return new SceneContext({
    host,
    rendererHost: {
      renderer: { immediateContext: ctx2d, render() {} },
      ctx: ctx2d,
      width: 320,
      height: 240,
    },
    inputSystem: null,
    stack,
    uiLayer,
    imageSmoothing: true,
    interpolation: true,
    game: null,
  });
}

function makeStack({ uiLayer = new HeadlessElement("div"), onSwitch = null } = {}) {
  const stack = new SceneStack({ uiLayer, onSwitch });
  stack.setContext(makeContext({ stack, uiLayer }));
  return stack;
}

function silenceErrors() {
  const captured = [];
  const orig = console.error;
  console.error = (...a) => captured.push(a);
  return { captured, restore() { console.error = orig; } };
}

describe("SceneContext", () => {
  it("reads services through the renderer host rather than caching them", () => {
    const rendererHost = { renderer: { id: "a" }, ctx: { id: "ctxA" }, width: 100, height: 50 };
    const context = new SceneContext({ rendererHost });

    assert.strictEqual(context.renderer.id, "a");
    assert.strictEqual(context.width, 100);

    // A fallback can swap the renderer mid-run; a context that cached the old
    // instance would leave scenes drawing into a dead one.
    rendererHost.renderer = { id: "b" };
    rendererHost.ctx = { id: "ctxB" };
    assert.strictEqual(context.renderer.id, "b");
    assert.strictEqual(context.ctx.id, "ctxB");
  });

  it("degrades to null services with no renderer host", () => {
    const context = new SceneContext();
    assert.strictEqual(context.renderer, null);
    assert.strictEqual(context.ctx, null);
    assert.strictEqual(context.width, 0);
  });

  it("creates elements through the host", () => {
    const host = new HeadlessHost();
    const context = new SceneContext({ host });
    const el = context.createElement("div");
    assert.strictEqual(el.tagName, "DIV");
  });

  it("forwards transitions to the stack", () => {
    const calls = [];
    const stack = {
      push: (s) => calls.push(["push", s]),
      pop: () => calls.push(["pop"]),
      replace: (s) => calls.push(["replace", s]),
      switch: (s) => calls.push(["switch", s]),
      peek: () => "top",
    };
    const context = new SceneContext({ stack });
    context.pushScene("a");
    context.popScene();
    context.replaceScene("b");
    context.switchScene("c");

    assert.deepStrictEqual(calls, [["push", "a"], ["pop"], ["replace", "b"], ["switch", "c"]]);
    assert.strictEqual(context.peekScene(), "top");
  });

  it("transitions are inert with no stack attached", () => {
    const context = new SceneContext();
    assert.doesNotThrow(() => context.pushScene(new Scene()));
    assert.strictEqual(context.peekScene(), null);
  });
});

describe("Scene without a Game", () => {
  it("mounts against a bare context", async () => {
    const stack = makeStack();
    const scene = new Scene();
    stack.start(scene);
    await scene.whenReady();

    assert.strictEqual(stack.top, scene);
    assert.strictEqual(scene.ready, true, "a scene can enter with no Game at all");
    assert.ok(scene.root, "its root came from the context's host");
  });

  it("picks up its viewport size from the context", async () => {
    const stack = makeStack();
    const scene = new Scene();
    stack.start(scene);
    await scene.whenReady();

    assert.ok(scene.view, "a default view is created");
    assert.strictEqual(scene.view.viewport.width, 320);
    assert.strictEqual(scene.view.viewport.height, 240);
  });
});

describe("SceneStack — transitions", () => {
  let stack;
  beforeEach(() => { stack = makeStack(); });

  it("start() mounts the first scene", () => {
    const a = new Scene();
    stack.start(a);
    assert.strictEqual(stack.size, 1);
    assert.strictEqual(stack.top, a);
    assert.strictEqual(stack.isTop(a), true);
  });

  it("push() stacks and pauses the scene below when blocking", () => {
    const a = new Scene();
    const b = new Scene();
    let paused = false;
    a.pause = () => { paused = true; };

    stack.start(a);
    b.blocksUpdateBelow = true;
    stack.push(b);

    assert.strictEqual(stack.size, 2);
    assert.strictEqual(stack.top, b);
    assert.strictEqual(paused, true);
  });

  it("push() leaves the scene below running when not blocking", () => {
    const a = new Scene();
    const b = new Scene();
    let paused = false;
    a.pause = () => { paused = true; };

    stack.start(a);
    b.blocksUpdateBelow = false;
    stack.push(b);
    assert.strictEqual(paused, false);
  });

  it("pop() unmounts the top and resumes the one below", () => {
    const a = new Scene();
    const b = new Scene();
    let resumed = false;
    a.resume = () => { resumed = true; };

    stack.start(a);
    stack.push(b);
    stack.pop();

    assert.strictEqual(stack.size, 1);
    assert.strictEqual(stack.top, a);
    assert.strictEqual(resumed, true);
    assert.strictEqual(b._exited, true);
  });

  it("pop() refuses to empty the stack", () => {
    stack.start(new Scene());
    assert.throws(() => stack.pop(), /Cannot pop the last scene/);
  });

  it("replace() swaps the top in place", () => {
    const a = new Scene();
    const b = new Scene();
    stack.start(a);
    stack.replace(b);

    assert.strictEqual(stack.size, 1);
    assert.strictEqual(stack.top, b);
    assert.strictEqual(a._exited, true);
  });

  it("switch() resets the whole stack and fires onSwitch", () => {
    let switched = 0;
    stack = makeStack({ onSwitch: () => switched++ });
    const a = new Scene();
    const b = new Scene();
    const c = new Scene();

    stack.start(a);
    stack.push(b);
    stack.switch(c);

    assert.strictEqual(stack.size, 1);
    assert.strictEqual(stack.top, c);
    assert.strictEqual(a._exited, true);
    assert.strictEqual(b._exited, true);
    assert.strictEqual(switched, 1, "the loop is told, not reached into");
  });

  it("rejects a non-Scene", () => {
    assert.throws(() => stack.start({}), /must be a Scene instance/);
    assert.throws(() => stack.start(null), /got null/);
  });

  it("rejects remounting a scene", () => {
    const a = new Scene();
    stack.start(a);
    assert.throws(() => stack.push(a), /already mounted/);
  });

  it("rejects a scene that belongs to another context", () => {
    const other = makeStack();
    const a = new Scene();
    other.start(a);
    a._entered = false; // pretend it is fresh; the context check should still bite

    assert.throws(() => stack.push(a), /belongs to another Game instance/);
  });
});

describe("SceneStack — deferred operations", () => {
  let stack;
  beforeEach(() => { stack = makeStack(); });

  it("queues transitions requested during update", () => {
    stack.start(new Scene());
    stack.updating = true;
    stack.push(new Scene());

    assert.strictEqual(stack.size, 1, "nothing applied yet");
    assert.strictEqual(stack.pendingOpCount, 1);

    stack.updating = false;
    stack.flush();
    assert.strictEqual(stack.size, 2);
    assert.strictEqual(stack.pendingOpCount, 0);
  });

  it("applies queued operations in order", () => {
    const a = new Scene();
    const b = new Scene();
    const c = new Scene();
    stack.start(a);

    stack.updating = true;
    stack.push(b);
    stack.push(c);
    stack.updating = false;
    stack.flush();

    assert.deepStrictEqual(stack.all(), [a, b, c]);
  });

  it("survives a deferred op that became invalid, and keeps draining", () => {
    const s = silenceErrors();
    try {
      stack.start(new Scene());
      stack.push(new Scene());

      // Both pops pass the call-time depth check; the second is only invalid
      // once the first has run.
      stack.updating = true;
      stack.pop();
      stack.pop();
      stack.updating = false;

      assert.doesNotThrow(() => stack.flush());
      assert.strictEqual(stack.size, 1, "the last scene must survive");
      assert.strictEqual(stack.pendingOpCount, 0, "the queue must be fully drained");
      assert.ok(s.captured.some((a) => String(a[0]).includes('Deferred scene op "pop" failed')));
    } finally {
      s.restore();
    }
  });
});

describe("SceneStack — queries and iteration", () => {
  let stack;
  let a, b;

  beforeEach(() => {
    stack = makeStack();
    a = new Scene();
    b = new Scene();
    stack.start(a);
    stack.push(b);
  });

  it("at() / all() / contains()", () => {
    assert.strictEqual(stack.at(0), a);
    assert.strictEqual(stack.at(1), b);
    assert.strictEqual(stack.at(9), null);
    assert.strictEqual(stack.at(-1), null);
    assert.deepStrictEqual(stack.all(), [a, b]);
    assert.strictEqual(stack.contains(a), true);
    assert.strictEqual(stack.contains(new Scene()), false);
  });

  it("all() hands back a copy", () => {
    const copy = stack.all();
    copy.push(new Scene());
    assert.strictEqual(stack.size, 2, "mutating the copy must not affect the stack");
  });

  it("findBlockingIndex stops at the topmost blocker", () => {
    a.blocksUpdateBelow = false;
    b.blocksUpdateBelow = true;
    assert.strictEqual(stack.findBlockingIndex("blocksUpdateBelow"), 1);

    b.blocksUpdateBelow = false;
    assert.strictEqual(stack.findBlockingIndex("blocksUpdateBelow"), 0);
  });

  it("update() only runs scenes from the given index up", () => {
    const ran = [];
    a.update = () => ran.push("a");
    b.update = () => ran.push("b");

    stack.update(1 / 60, 1);
    assert.deepStrictEqual(ran, ["b"]);

    ran.length = 0;
    stack.update(1 / 60, 0);
    assert.deepStrictEqual(ran, ["a", "b"]);
  });

  it("render() draws each scene and its world", () => {
    const drawn = [];
    const renderer = {
      immediateContext: createHeadlessContext2D(),
      render: (world) => drawn.push(world),
    };
    a.render = () => drawn.push("a");
    b.render = () => drawn.push("b");

    stack.render(renderer, 0);
    assert.ok(drawn.includes("a") && drawn.includes("b"));
  });

  it("applyRenderAlpha reaches every scene from the index up", () => {
    const seen = [];
    a._applyRenderAlpha = (alpha) => seen.push(["a", alpha]);
    b._applyRenderAlpha = (alpha) => seen.push(["b", alpha]);

    stack.applyRenderAlpha(0.5, 0);
    assert.deepStrictEqual(seen, [["a", 0.5], ["b", 0.5]]);
  });

  it("refreshRendererResources notifies every mounted scene", () => {
    let n = 0;
    a._refreshRendererResources = () => n++;
    b._refreshRendererResources = () => n++;
    stack.refreshRendererResources();
    assert.strictEqual(n, 2);
  });
});

describe("SceneStack — UI", () => {
  it("applies renderDOM output to the scene root on mount", () => {
    const stack = makeStack();
    class UIScene extends Scene {
      renderDOM() { return "<p>hello</p>"; }
    }
    const scene = new UIScene();
    stack.start(scene);
    assert.strictEqual(scene.root.innerHTML, "<p>hello</p>");
  });

  it("render() runs render, retained world, renderUI(ctx), then renderDOM", () => {
    const stack = makeStack();
    const calls = [];
    const ctx = createHeadlessContext2D();
    const renderer = { immediateContext: ctx, render: (world) => calls.push("world") };
    class UIScene extends Scene {
      render(c) { calls.push("render"); }
      renderUI(c) { calls.push("renderUI"); assert.strictEqual(c, ctx); }
      renderDOM() { calls.push("renderDOM"); return "<p></p>"; }
    }
    const scene = new UIScene();
    stack.start(scene);

    calls.length = 0;
    stack.render(renderer, 0);
    assert.deepStrictEqual(calls, ["render", "world", "renderUI", "renderDOM"]);
  });

  it("render() only rewrites the DOM when the markup actually changed", () => {
    const stack = makeStack();
    let html = "<p>one</p>";
    class UIScene extends Scene {
      renderDOM() { return html; }
    }
    const scene = new UIScene();
    stack.start(scene);

    let writes = 0;
    Object.defineProperty(scene.root, "innerHTML", {
      get() { return this._html; },
      set(v) { writes++; this._html = v; },
      configurable: true,
    });

    const renderer = { immediateContext: createHeadlessContext2D(), render() {} };
    stack.render(renderer, 0);
    assert.strictEqual(writes, 0, "unchanged markup must not touch the DOM");

    html = "<p>two</p>";
    stack.render(renderer, 0);
    assert.strictEqual(writes, 1, "changed markup writes once");
  });

  it("patchUI updates matching elements by id", () => {
    const stack = makeStack();
    const scene = new Scene();
    stack.start(scene);

    const el = { textContent: "old" };
    scene.root.querySelector = (sel) => (sel === "#score" ? el : null);

    stack.patchUI({ score: 42 });
    assert.strictEqual(el.textContent, 42);
  });

  it("refreshUI re-renders the top scene only", () => {
    const stack = makeStack();
    let n = 0;
    class UIScene extends Scene {
      renderDOM() { n++; return "<p></p>"; }
    }
    const a = new UIScene();
    const b = new UIScene();
    stack.start(a);
    stack.push(b);

    n = 0;
    stack.refreshUI();
    assert.strictEqual(n, 1);
  });
});
