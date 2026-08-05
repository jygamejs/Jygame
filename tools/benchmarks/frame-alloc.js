// Measures the two things the hot-loop work targets:
//
//   1. Bytes allocated per rendered frame in the interpolate + render path.
//      The existing allocation.js checks for *structural* churn (new props,
//      new archetypes); this measures actual heap growth, which is what the
//      _savedPositions Map and the per-frame closures actually cost.
//
//   2. The cost of a zero-tick frame — a frame where the display refresh
//      outruns the fixed timestep and the simulation does not advance.
//      At 144Hz against a 60Hz clock most frames are zero-tick, so this is
//      the common case, not an edge case.
//
// Run with:  node --expose-gc tools/benchmarks/frame-alloc.js
//
// Needs --expose-gc; without it the heap numbers are meaningless.

import { divider } from "./runner.js";

<<<<<<< HEAD
// ─── Minimal DOM so the Game constructor can run under Node ───────────────

function makeElement() {
  return {
    style: {}, className: "", width: 0, height: 0, innerHTML: "",
    _listeners: {},
    addEventListener(t, f) { (this._listeners[t] = this._listeners[t] || []).push(f); },
    removeEventListener() {},
    appendChild() {}, append() {}, remove() {}, querySelector() { return null; },
  };
}

function makeContext() {
  return {
    imageSmoothingEnabled: true,
    clearRect() {}, save() {}, restore() {}, translate() {}, rotate() {}, scale() {},
    fillRect() {}, drawImage() {}, beginPath() {}, arc() {}, fill() {}, stroke() {},
    moveTo() {}, lineTo() {},
    // Deliberately returns a fresh object each call, like the real
    // CanvasRenderingContext2D returning a new DOMMatrix.
    getTransform() { return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }; },
    setTransform() {},
  };
}

function setupDom() {
  const canvas = makeElement();
  canvas.width = 1280;
  canvas.height = 720;
  const ctx = makeContext();
  canvas.getContext = (k) => (k === "2d" ? ctx : null);

  globalThis.document = {
    body: makeElement(),
    documentElement: makeElement(),
    createElement: (tag) => (tag === "canvas" ? canvas : makeElement()),
    querySelector: () => null,
    addEventListener() {}, removeEventListener() {},
    hidden: false,
  };
  globalThis.window = {
    addEventListener() {}, removeEventListener() {},
    innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1, open() {},
  };
  globalThis.getComputedStyle = () => ({
    position: "relative", getPropertyValue: () => "", removeProperty() {},
  });
  globalThis.ResizeObserver = class { observe() {} disconnect() {} };
  globalThis.requestAnimationFrame = () => 0;
  globalThis.cancelAnimationFrame = () => {};
  globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {}, clear() {} };
}

setupDom();

const { Game, Scene, Sprite } = await import("../../jygame.js");
=======


const { Game, Scene, Sprite } = await import("../../jygame.js");
const { HeadlessHost } = await import("../../core/Host.js");
>>>>>>> 07d6ec7 (refactor: add host abstraction, scene stack/context and renderer host; make debug streaming opt-in)

function gc() {
  if (typeof global !== "undefined" && global.gc) global.gc();
}

function heapUsed() {
  gc();
  return process.memoryUsage().heapUsed;
}

// ─── Harness ──────────────────────────────────────────────────────────────

async function buildGame(entityCount, { debug, interpolation }) {
  class BenchScene extends Scene {
    async onEnter() {
      this.sprites = [];
      for (let i = 0; i < entityCount; i++) {
        const s = new Sprite((i % 100) * 12, Math.floor(i / 100) * 12, 8, 8);
        s.velocity.x = 30;
        s.velocity.y = 15;
        this.sprites.push(s);
      }
    }
  }

  const game = new Game({
    width: 1280, height: 720, fps: 60,
    debug, interpolation,
<<<<<<< HEAD
=======
    host: new HeadlessHost({ width: 1280, height: 720 }),
>>>>>>> 07d6ec7 (refactor: add host abstraction, scene stack/context and renderer host; make debug streaming opt-in)
  });
  const scene = new BenchScene();
  game.run(scene);
  await scene.whenReady();
  return game;
}

// Drives frames directly rather than through rAF. `realDt` controls whether
// the clock produces ticks: 1/60 gives ~1 tick per frame, 1/144 leaves most
// frames with zero ticks.
function driveFrames(game, frames, realDt) {
  for (let i = 0; i < frames; i++) {
    const ticks = game.clock.tick(realDt);
    game._frame(null, ticks, realDt);
  }
}

function measure(label, game, frames, realDt) {
  driveFrames(game, Math.min(200, frames), realDt); // warm up + let JIT settle

  const before = heapUsed();
  const t0 = performance.now();
  driveFrames(game, frames, realDt);
  const elapsed = performance.now() - t0;
  const after = heapUsed();

  const bytesPerFrame = (after - before) / frames;
  const msPerFrame = elapsed / frames;

  console.log(`    ${label}`);
  console.log(`      ${msPerFrame.toFixed(4)} ms/frame`);
  console.log(`      ${bytesPerFrame.toFixed(1)} bytes/frame (heap delta over ${frames} frames)`);
  console.log("");

  return { bytesPerFrame, msPerFrame };
}

const argFrames = process.argv.find((a) => a.startsWith("--frames="));
const argCounts = process.argv.find((a) => a.startsWith("--counts="));

async function main() {
  const FRAMES = argFrames ? parseInt(argFrames.split("=")[1], 10) : 600;
  const COUNTS = argCounts
    ? argCounts.split("=")[1].split(",").map((n) => parseInt(n, 10))
    : [1000, 5000];
  const results = {};

  for (const count of COUNTS) {
    divider(`Frame allocation — ${count.toLocaleString()} sprites`);

    // 60Hz display against a 60Hz clock: ~1 tick per frame, the "full work"
    // case where the second RenderSystem pass and _savedPositions both run.
    let game = await buildGame(count, { debug: false, interpolation: true });
    results[`${count}/tick/interp`] =
      measure("1 tick/frame, interpolation on", game, FRAMES, 1 / 60);
    game.destroy();

    game = await buildGame(count, { debug: false, interpolation: false });
    results[`${count}/tick/nointerp`] =
      measure("1 tick/frame, interpolation off", game, FRAMES, 1 / 60);
    game.destroy();

    // 144Hz display against a 60Hz clock: most frames do no simulation at all.
    // This is the case the queue-side interpolation change is aimed at.
    game = await buildGame(count, { debug: false, interpolation: true });
    results[`${count}/zerotick`] =
      measure("144Hz vs 60Hz clock (mostly zero-tick)", game, FRAMES, 1 / 144);
    game.destroy();

    // Diagnostics on: exercises every diag.scope callsite in the frame.
    game = await buildGame(count, { debug: true, interpolation: true });
    results[`${count}/debug`] =
      measure("1 tick/frame, debug/diagnostics on", game, FRAMES, 1 / 60);
    game.destroy();
  }

  divider("Summary (bytes/frame)");
  for (const [k, v] of Object.entries(results)) {
    console.log(`  ${k.padEnd(28)} ${v.bytesPerFrame.toFixed(1).padStart(12)}  ${v.msPerFrame.toFixed(4)} ms`);
  }
  console.log("");

  if (!global.gc) {
    console.log("  ⚠  Run with --expose-gc or the byte counts are noise.\n");
  }
}

await main();
