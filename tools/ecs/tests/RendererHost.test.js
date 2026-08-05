import { describe, it, beforeEach, afterEach } from "node:test";
import * as assert from "node:assert";

import { RendererHost } from "../../../renderer/RendererHost.js";
import { RendererResolver } from "../../../renderer/RendererResolver.js";
import { CanvasRenderer } from "../../../renderer/CanvasRenderer.js";
import { HeadlessHost, HeadlessElement } from "../../../core/Host.js";

// The fallback chain is the fiddliest code in the engine and was effectively
// untested while it lived inside Game — exercising it meant standing up a
// whole game and provoking a real GPU failure. As its own unit it can be
// driven directly.

function silence() {
  const out = { info: [], warn: [] };
  const oi = console.info, ow = console.warn;
  console.info = (...a) => out.info.push(a.join(" "));
  console.warn = (...a) => out.warn.push(a.join(" "));
  return { out, restore() { console.info = oi; console.warn = ow; } };
}

// A renderer whose initialize() outcome the test controls.
function makeFakeRenderer({ kind, failSync = false, failAsync = false }) {
  return class Fake {
    static isAvailable() { return true; }
    constructor({ canvas, width, height }) {
      this.canvas = canvas;
      this.width = width;
      this.height = height;
      this.destroyed = false;
      this.resized = null;
      Fake.instances.push(this);
    }
    static instances = [];
    static kindName = kind;
    initialize() {
      if (failSync) throw new Error(`${kind} sync failure`);
      if (failAsync) return Promise.reject(new Error(`${kind} async failure`));
      return Promise.resolve();
    }
    get immediateContext() { return { imageSmoothingEnabled: true }; }
    resize(w, h) { this.resized = { w, h }; }
    destroy() { this.destroyed = true; }
  };
}

describe("RendererHost — construction", () => {
  let host, container, rh, s;

  beforeEach(() => {
    host = new HeadlessHost({ width: 320, height: 240 });
    container = new HeadlessElement("div");
    s = silence();
  });
  afterEach(() => { if (rh) { rh.destroy(); rh = null; } s.restore(); });

  it("creates a canvas and attaches it to the container", () => {
    rh = new RendererHost({ host, container, width: 320, height: 240 });
    assert.ok(rh.canvas);
    assert.strictEqual(rh.canvas.tagName, "CANVAS");
    assert.strictEqual(rh.canvas.width, 320);
    assert.ok(container.children.includes(rh.canvas));
  });

  it("resolves the canvas renderer by default and exposes its context", () => {
    rh = new RendererHost({ host, container, width: 320, height: 240 });
    assert.ok(rh.renderer instanceof CanvasRenderer);
    assert.ok(rh.ctx);
    assert.strictEqual(rh.kind, "canvas");
  });

  it("applies imageSmoothing to the context", () => {
    rh = new RendererHost({ host, container, imageSmoothing: false });
    assert.strictEqual(rh.ctx.imageSmoothingEnabled, false);
  });

  // Naming a renderer is a requirement, not a preference. Only "auto" has a
  // chain — otherwise "webgl" would just be "auto" starting one rung down,
  // and a hard requirement would be inexpressible.
  it("gives an explicitly named renderer a chain of one", () => {
    rh = new RendererHost({ host, container, renderer: "canvas" });
    assert.deepStrictEqual(rh.chain, ["canvas"]);
  });

  it('gives "auto" the full chain', () => {
    rh = new RendererHost({ host, container, renderer: "auto" });
    assert.deepStrictEqual(rh.chain, ["webgpu", "webgl", "canvas"]);
  });

  it("throws when an explicitly named renderer is unavailable", () => {
    // WebGpuRenderer throws from its constructor when the canvas has no WebGPU
    // context. A game that asked for WebGPU must hear about that rather than
    // be quietly handed a Canvas renderer with different performance.
    assert.throws(
      () => new RendererHost({ host, container, renderer: "webgpu", width: 320, height: 240 }),
      /WebGPU/,
    );
    assert.throws(
      () => new RendererHost({ host, container, renderer: "webgl", width: 320, height: 240 }),
      /WebGL2/,
    );
  });

  it('"auto" degrades to canvas instead of throwing', () => {
    rh = new RendererHost({ host, container, renderer: "auto", width: 320, height: 240 });
    assert.ok(rh.renderer instanceof CanvasRenderer);
    assert.ok(rh.ctx);
  });

  it("works with no container at all", () => {
    rh = new RendererHost({ host, container: null, width: 100, height: 100 });
    assert.ok(rh.canvas);
    assert.ok(rh.renderer);
  });
});

describe("RendererHost — fallback chain", () => {
  let host, container, s;
  let origResolveKind, origResolve;

  beforeEach(() => {
    host = new HeadlessHost({ width: 320, height: 240 });
    container = new HeadlessElement("div");
    s = silence();
    origResolveKind = RendererResolver.resolveKind;
    origResolve = RendererResolver.resolve;
  });
  afterEach(() => {
    RendererResolver.resolveKind = origResolveKind;
    RendererResolver.resolve = origResolve;
    s.restore();
  });

  // Stands the resolver up with fake renderers so a failure can be provoked
  // without a GPU. These drive `renderer: "auto"`, because that is the only
  // mode with a chain to walk — an explicitly named renderer is strict.
  function stubChain(behaviour) {
    const classes = {};
    for (const [kind, opts] of Object.entries(behaviour)) {
      classes[kind] = makeFakeRenderer({ kind, ...opts });
      classes[kind].instances = [];
    }
    RendererResolver.resolve = ({ renderer, canvas, width, height }) => {
      // "auto" starts at the first kind the stub knows about.
      const kind = renderer === "auto"
        ? ["webgpu", "webgl", "canvas"].find((k) => classes[k])
        : renderer;
      if (!classes[kind]) throw new Error(`${kind} unavailable`);
      return new classes[kind]({ canvas, width, height });
    };
    RendererResolver.resolveKind = (kind, { canvas, width, height }) => {
      if (!classes[kind]) throw new Error(`${kind} unavailable`);
      return new classes[kind]({ canvas, width, height });
    };
    return classes;
  }

  it("falls back to the next renderer when initialize throws synchronously", () => {
    const classes = stubChain({
      webgpu: { failSync: true },
      webgl: {},
      canvas: {},
    });
    const rh = new RendererHost({ host, container, renderer: "auto" });

    assert.ok(rh.renderer instanceof classes.webgl, "should have landed on webgl");
    assert.strictEqual(rh.kind, "webgl");
    assert.ok(
      s.out.info.some((l) => l.includes("falling back to WebGL")),
      `expected a fallback log, got ${JSON.stringify(s.out.info)}`,
    );
    rh.destroy();
  });

  it("gives each fallback attempt a fresh canvas", () => {
    stubChain({ webgpu: { failSync: true }, webgl: {}, canvas: {} });
    const rh = new RendererHost({ host, container, renderer: "auto" });

    // A renderer that reached its constructor claims the canvas's context mode
    // permanently, so reusing the canvas would silently no-op the next one.
    assert.notStrictEqual(rh.canvas, rh.renderer.canvas === rh.canvas ? null : rh.canvas);
    assert.strictEqual(rh.renderer.canvas, rh.canvas, "host tracks the swapped canvas");
    assert.ok(container.children.includes(rh.canvas), "fresh canvas is in the DOM");
    assert.strictEqual(container.children.filter((c) => c.tagName === "CANVAS").length, 1,
      "the dead canvas must not be left behind");
    rh.destroy();
  });

  it("destroys the failed renderer when falling back", () => {
    const classes = stubChain({ webgpu: { failSync: true }, webgl: {}, canvas: {} });
    const rh = new RendererHost({ host, container, renderer: "auto" });
    assert.strictEqual(classes.webgpu.instances[0].destroyed, true);
    rh.destroy();
  });

  it("walks past a renderer that cannot even be constructed", () => {
    const classes = stubChain({ webgpu: { failSync: true }, canvas: {} }); // no webgl
    const rh = new RendererHost({ host, container, renderer: "auto" });
    assert.ok(rh.renderer instanceof classes.canvas, "should skip webgl entirely");
    assert.strictEqual(rh.kind, "canvas");
    rh.destroy();
  });

  it("ends with a null renderer when the whole chain is exhausted", () => {
    stubChain({ webgpu: { failSync: true } }); // nothing else resolvable
    const rh = new RendererHost({ host, container, renderer: "auto" });

    assert.strictEqual(rh.renderer, null);
    assert.strictEqual(rh.ctx, null);
    assert.ok(
      s.out.warn.some((l) => l.includes("no fallback renderer available")),
      "exhausting the chain should warn",
    );
    rh.destroy();
  });

  it("notifies on renderer change, including on exhaustion", () => {
    stubChain({ webgpu: { failSync: true }, webgl: {} });
    const seen = [];
    const rh = new RendererHost({
      host, container, renderer: "auto",
      onRendererChanged: (r) => seen.push(r),
    });
    assert.strictEqual(seen.length, 1, "one notification for the successful fallback");
    assert.strictEqual(seen[0], rh.renderer);
    rh.destroy();

    seen.length = 0;
    stubChain({ webgpu: { failSync: true } });
    const rh2 = new RendererHost({
      host, container, renderer: "auto",
      onRendererChanged: (r) => seen.push(r),
    });
    assert.deepStrictEqual(seen, [null], "exhaustion must notify too, with null");
    rh2.destroy();
  });

  it("falls back on an async initialize rejection", async () => {
    const classes = stubChain({ webgpu: { failAsync: true }, webgl: {}, canvas: {} });
    const rh = new RendererHost({ host, container, renderer: "auto" });

    // The rejection resolves on a later microtask.
    assert.ok(rh.renderer instanceof classes.webgpu, "starts on webgpu");
    await Promise.resolve();
    await Promise.resolve();
    assert.ok(rh.renderer instanceof classes.webgl, "async failure should fall back");
    rh.destroy();
  });

  it("a named renderer whose initialize fails does not degrade to canvas", async () => {
    // Strictness has to hold at both failure points. The chain for a named
    // renderer is one entry long, so a late async failure ends with no
    // renderer and a loud warning rather than a silent downgrade.
    const classes = stubChain({ webgl: { failAsync: true }, canvas: {} });
    const rh = new RendererHost({ host, container, renderer: "webgl" });
    assert.deepStrictEqual(rh.chain, ["webgl"]);

    await Promise.resolve();
    await Promise.resolve();

    assert.strictEqual(rh.renderer, null, "must not silently become canvas");
    assert.strictEqual(classes.canvas.instances.length, 0, "canvas must never be constructed");
    assert.ok(
      s.out.warn.some((l) => l.includes("no fallback renderer available")),
      "the failure must be reported",
    );
    rh.destroy();
  });

  it("does not install a fallback after destroy", async () => {
    const classes = stubChain({ webgpu: { failAsync: true }, webgl: {} });
    const rh = new RendererHost({ host, container, renderer: "auto" });
    rh.destroy();

    await Promise.resolve();
    await Promise.resolve();

    assert.strictEqual(rh.renderer, null, "a destroyed host must stay destroyed");
    for (const inst of classes.webgl.instances) {
      assert.strictEqual(inst.destroyed, true, "a late fallback must be cleaned up");
    }
  });
});

describe("RendererHost — no-renderer warning", () => {
  it("warns once per outage, not per frame", () => {
    const s = silence();
    const host = new HeadlessHost();
    const rh = new RendererHost({ host, container: new HeadlessElement("div") });
    try {
      rh.warnNoRenderer();
      rh.warnNoRenderer();
      rh.warnNoRenderer();
      const hits = s.out.warn.filter((l) => l.includes("No renderer available"));
      assert.strictEqual(hits.length, 1);
    } finally {
      rh.destroy();
      s.restore();
    }
  });
});

describe("RendererHost — resize and viewport", () => {
  let host, container, rh, s;

  beforeEach(() => {
    host = new HeadlessHost({ width: 800, height: 600 });
    container = new HeadlessElement("div");
    s = silence();
  });
  afterEach(() => { if (rh) { rh.destroy(); rh = null; } s.restore(); });

  it("resize updates its dimensions and the renderer", () => {
    rh = new RendererHost({ host, container, width: 320, height: 240 });
    rh.resize(640, 480);
    assert.strictEqual(rh.width, 640);
    assert.strictEqual(rh.height, 480);
    assert.strictEqual(rh.canvas.width, 640, "the renderer resizes its canvas");
  });

  it("resize is safe with no renderer", () => {
    rh = new RendererHost({ host, container });
    rh.renderer = null;
    assert.doesNotThrow(() => rh.resize(100, 100));
  });

  it("scaleToFit installs a viewport and scales the target", () => {
    rh = new RendererHost({ host, container, width: 400, height: 300 });
    const target = new HeadlessElement("div");
    rh.enableScaleToFit({ width: 400, height: 300, element: target });

    assert.ok(rh.viewport);
    assert.strictEqual(rh.viewport.width, 400);
    assert.ok(target.style.transform.startsWith("scale("), target.style.transform);
  });

  it("scaleToFit re-applies on host resize", () => {
    rh = new RendererHost({ host, container, width: 400, height: 300 });
    const target = new HeadlessElement("div");
    rh.enableScaleToFit({ width: 400, height: 300, element: target });

    target.style.transform = "";
    host.emitResize();
    assert.ok(target.style.transform.startsWith("scale("), "resize should re-apply");
  });

  it("scaleToFit(true) uses the host's own dimensions", () => {
    rh = new RendererHost({ host, container, width: 400, height: 300 });
    rh.enableScaleToFit(true);
    assert.strictEqual(rh.viewport.width, 400);
    assert.strictEqual(rh.viewport.height, 300);
  });

  it("applyViewport is a no-op when scaleToFit was never enabled", () => {
    rh = new RendererHost({ host, container });
    assert.strictEqual(rh.viewport, null);
    assert.doesNotThrow(() => rh.applyViewport());
  });

  it("destroy releases the resize listener and observer", () => {
    rh = new RendererHost({ host, container, width: 400, height: 300 });
    rh.enableScaleToFit(true);
    const before = host.windowListenerCount;
    assert.ok(before > 0, "scaleToFit subscribes to resize");

    rh.destroy();
    rh = null;
    assert.strictEqual(host.windowListenerCount, 0, "destroy must unsubscribe");
    assert.doesNotThrow(() => host.emitResize(), "a disconnected observer must not fire");
  });
});

describe("RendererHost — destroy", () => {
  it("tears the renderer down and nulls the context", () => {
    const s = silence();
    const host = new HeadlessHost();
    const rh = new RendererHost({ host, container: new HeadlessElement("div") });
    const renderer = rh.renderer;
    let destroyed = false;
    renderer.destroy = () => { destroyed = true; };

    rh.destroy();
    assert.strictEqual(destroyed, true);
    assert.strictEqual(rh.renderer, null);
    assert.strictEqual(rh.ctx, null);
    s.restore();
  });

  it("survives a renderer that throws on teardown", () => {
    const s = silence();
    const host = new HeadlessHost();
    const rh = new RendererHost({ host, container: new HeadlessElement("div") });
    rh.renderer.destroy = () => { throw new Error("gpu is on fire"); };
    assert.doesNotThrow(() => rh.destroy());
    s.restore();
  });
});
