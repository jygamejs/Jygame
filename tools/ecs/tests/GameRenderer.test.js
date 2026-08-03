import { describe, it, mock } from "node:test";
import * as assert from "node:assert";
import { Game } from "../../../core/Game.js";
import { CanvasRenderer } from "../../../renderer/CanvasRenderer.js";

function makeElement() {
  return {
    style: {},
    className: "",
    width: 0,
    height: 0,
    innerHTML: "",
    _listeners: {},
    addEventListener(type, fn) {
      (this._listeners[type] = this._listeners[type] || []).push(fn);
    },
    removeEventListener(type, fn) {
      const list = this._listeners[type] || [];
      const i = list.indexOf(fn);
      if (i !== -1) list.splice(i, 1);
    },
    appendChild() {},
    remove() {},
    querySelector() { return null; },
  };
}

function makeContext() {
  const ctx = {
    imageSmoothingEnabled: true,
    set imageSmoothingEnabled(v) { this._imageSmoothingEnabled = v; },
    clearRect() {}, save() {}, restore() {}, translate() {}, rotate() {}, scale() {},
    fillRect() {}, drawImage() {}, beginPath() {}, arc() {}, fill() {}, stroke() {},
    moveTo() {}, lineTo() {},
    getTransform() { return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }; },
    setTransform() {},
  };
  return ctx;
}

function setupDom() {
  const body = makeElement();
  const canvas = makeElement();
  canvas.width = 800;
  canvas.height = 600;
  canvas.style.display = "block";
  const ctx = makeContext();
  canvas.getContext = (kind) => (kind === "2d" ? ctx : null);
  globalThis.document = {
    body,
    documentElement: makeElement(),
    createElement: (tag) => (tag === "canvas" ? canvas : makeElement()),
    querySelector: () => null,
    addEventListener() {},
    removeEventListener() {},
    hidden: false,
  };
  globalThis.window = {
    addEventListener() {},
    removeEventListener() {},
    innerWidth: 1920,
    innerHeight: 1080,
    devicePixelRatio: 1,
    open() {},
  };
  globalThis.getComputedStyle = () => ({
    position: "relative",
    getPropertyValue: () => "",
    removeProperty() {},
  });
  globalThis.ResizeObserver = class {
    observe() {}
    disconnect() {}
  };
  globalThis.requestAnimationFrame = () => 0;
  globalThis.cancelAnimationFrame = () => {};
  return { canvas, ctx };
}

setupDom();

function makeGame(options = {}) {
  return new Game({
    debug: false,
    autoPause: false,
    interpolation: false,
    ...options,
  });
}

describe("Game renderer option", () => {
  it("defaults to a CanvasRenderer and exposes game.ctx", () => {
    const game = makeGame();
    assert.ok(game.renderer instanceof CanvasRenderer);
    assert.ok(game.ctx);
    assert.strictEqual(game.ctx, game.renderer.immediateContext);
    game.destroy();
  });

  it('accepts renderer: "canvas"', () => {
    const game = makeGame({ renderer: "canvas" });
    assert.ok(game.renderer instanceof CanvasRenderer);
    game.destroy();
  });

  it('accepts renderer: "auto" (behaves like "canvas" today)', () => {
    const game = makeGame({ renderer: "auto" });
    assert.ok(game.renderer instanceof CanvasRenderer);
    game.destroy();
  });

  it("accepts a renderer instance as-is", () => {
    const ctx = makeContext();
    const instance = { immediateContext: ctx, resize: mock.fn(), destroy: mock.fn() };
    const game = makeGame({ renderer: instance });
    assert.strictEqual(game.renderer, instance);
    assert.strictEqual(game.ctx, ctx);
    game.destroy();
    assert.strictEqual(instance.destroy.mock.callCount(), 1);
  });

  it('throws for renderer: "webgl" when no WebGL2 context is available', () => {
    assert.throws(() => makeGame({ renderer: "webgl" }), /WebGL2/);
  });

  it('throws for renderer: "webgpu" when no WebGPU context is available', () => {
    assert.throws(() => makeGame({ renderer: "webgpu" }), /WebGPU/);
  });
});

describe("Game renderer lifecycle", () => {
  it("resize(width, height) propagates to the renderer and updates game size", () => {
    const ctx = makeContext();
    const instance = { immediateContext: ctx, resize: mock.fn(), destroy: mock.fn() };
    const game = makeGame({ renderer: instance });

    game.resize(640, 480);
    assert.strictEqual(game.width, 640);
    assert.strictEqual(game.height, 480);
    assert.deepStrictEqual(instance.resize.mock.calls[0].arguments, [640, 480]);
    assert.deepStrictEqual(game.inputSystem.coordinateSystem.canvasRect, { x: 0, y: 0, width: 640, height: 480 });
    game.destroy();
  });

  it("destroy() releases the renderer", () => {
    const ctx = makeContext();
    const instance = { immediateContext: ctx, resize: mock.fn(), destroy: mock.fn() };
    const game = makeGame({ renderer: instance });
    game.destroy();
    assert.strictEqual(instance.destroy.mock.callCount(), 1);
  });

  it("scaleToFit wires _applyViewport to the renderer resize", () => {
    const ctx = makeContext();
    const instance = { immediateContext: ctx, resize: mock.fn(), destroy: mock.fn() };
    const game = makeGame({ renderer: instance, scaleToFit: { width: 800, height: 600 } });
    assert.ok(instance.resize.mock.callCount() >= 1);
    game.destroy();
  });
});
