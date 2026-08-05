import { describe, it } from "node:test";
import * as assert from "node:assert";

// ─── Browser environment mock (Game constructor needs a DOM) ───────────────

const drawn = [];

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
    append() {},
    remove() {},
    querySelector() { return null; },
  };
}

function makeContext() {
  return {
    imageSmoothingEnabled: true,
    set imageSmoothingEnabled(v) { this._imageSmoothingEnabled = v; },
    clearRect() {}, save() {}, restore() {}, translate() {}, rotate() {}, scale() {},
    fillRect() {}, drawImage() {}, beginPath() {}, arc() {}, fill() {}, stroke() {},
    moveTo() {}, lineTo() {},
    getTransform() { return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }; },
    setTransform(a, b, c, d, e, f) { drawn.push({ a, b, c, d, e, f }); },
  };
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
  globalThis.localStorage = {
    getItem: () => null,
    setItem() {},
    removeItem() {},
    clear() {},
  };
}

setupDom();

const { default: jygame } = await import("../../../jygame.js");
const { Scene, Sprite } = await import("../../../jygame.js");

function collectRenderedPositions(interpolation, frames = 20) {
  drawn.length = 0;

  class MyScene extends Scene {
    async onEnter() {
      this.block = new Sprite(100, 100, 32, 32);
    }
    update() {
      this.block.velocity.x = 350;
      this.block.velocity.y = 0;
    }
  }

  const runtime = jygame({ fps: 15, width: 800, height: 600, interpolation });
  const scene = new MyScene();
  runtime.run(scene);

  return new Promise((resolve) => {
    const game = runtime.game;
    const realDt = 1000 / 60 / 1000;
    const positions = [];
    let frame = 0;

    const step = () => {
      const ticks = game.clock.tick(realDt);
      game._frame(null, ticks, realDt);
      const last = drawn[drawn.length - 1];
      if (last) positions.push(Math.round(last.e * 100) / 100);
      frame++;
      if (frame < frames) {
        setTimeout(step, 0);
      } else {
        runtime.destroy();
        resolve(positions);
      }
    };
    setTimeout(step, 20);
  });
}

describe("interpolation", () => {
  it("blends positions on every frame between ticks (on)", async () => {
    const positions = await collectRenderedPositions(true);
    // Skip the warm-up frames before the first tick moves the block.
    const idx = positions.findIndex((p) => p > 116);
    const window = positions.slice(idx, idx + 4);
    assert.ok(window.length >= 3, `expected a tick interval, got ${JSON.stringify(window)}`);
    const distinct = new Set(window.map((p) => p.toFixed(2)));
    assert.ok(
      distinct.size >= 3,
      `interpolation should render intermediate positions, got ${JSON.stringify(window)}`,
    );
  });

  it("snaps to tick positions (off)", async () => {
    const positions = await collectRenderedPositions(false);
    const idx = positions.findIndex((p) => p > 116);
    const window = positions.slice(idx, idx + 4);
    assert.ok(window.length >= 3, `expected a tick interval, got ${JSON.stringify(window)}`);
    const distinct = new Set(window.map((p) => p.toFixed(2)));
    assert.strictEqual(
      distinct.size,
      1,
      `without interpolation a tick interval renders one position, got ${JSON.stringify(window)}`,
    );
  });
});
