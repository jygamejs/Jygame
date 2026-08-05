<<<<<<< HEAD
// Isolates what `debug: true` actually costs per frame.
//
// Game._frame calls takeDebugSnapshot() whenever a snapshot builder and a
// debug backend are both present. enableDebugWorkspace() installs a
// BrowserDebugBackend unconditionally, and BroadcastChannel exists in every
// modern browser and in Node, so its open() succeeds and every frame does:
//
//   full world snapshot  →  snap.toJSON()  →  postMessage (structured clone)
//
// ...whether or not a debug workspace window is listening.
=======
// Isolates what `debug: true` costs per frame, with and without a workspace
// attached.
//
// Streaming a snapshot means: full world snapshot -> toJSON -> postMessage
// (structured clone). That used to run unconditionally whenever debug was on,
// because the backend's BroadcastChannel opens successfully whether or not
// anything is listening. It is now gated on a subscription, so an unwatched
// game should sit at the same cost as debug: false.
>>>>>>> 07d6ec7 (refactor: add host abstraction, scene stack/context and renderer host; make debug streaming opt-in)
//
// Run with: node --expose-gc tools/benchmarks/debug-overhead.js

import { divider } from "./runner.js";

<<<<<<< HEAD
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
    body: makeElement(), documentElement: makeElement(),
    createElement: (tag) => (tag === "canvas" ? canvas : makeElement()),
    querySelector: () => null, addEventListener() {}, removeEventListener() {},
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

async function build(count, opts) {
  class S extends Scene {
    async onEnter() {
      for (let i = 0; i < count; i++) {
        const s = new Sprite((i % 100) * 12, Math.floor(i / 100) * 12, 8, 8);
        s.velocity.x = 30;
        s.velocity.y = 15;
      }
    }
  }
<<<<<<< HEAD
  const game = new Game({ width: 1280, height: 720, fps: 60, ...opts });
=======
  const game = new Game({
    width: 1280, height: 720, fps: 60,
    host: new HeadlessHost({ width: 1280, height: 720 }),
    ...opts,
  });
>>>>>>> 07d6ec7 (refactor: add host abstraction, scene stack/context and renderer host; make debug streaming opt-in)
  const scene = new S();
  game.run(scene);
  await scene.whenReady();
  return game;
}

function drive(game, frames, realDt, beforeFrame) {
  for (let i = 0; i < frames; i++) {
    if (beforeFrame) beforeFrame();
    game._frame(null, game.clock.tick(realDt), realDt);
  }
}

function measure(label, game, frames, beforeFrame) {
  drive(game, Math.min(100, frames), 1 / 60, beforeFrame);
  const t0 = performance.now();
  drive(game, frames, 1 / 60, beforeFrame);
  const ms = (performance.now() - t0) / frames;
  console.log(`    ${label.padEnd(46)} ${ms.toFixed(4)} ms/frame`);
  return ms;
}

// The subscription expires after a few seconds without a heartbeat, and a
// benchmark run takes longer than that — so keep it fresh, exactly as a real
// workspace window would.
function heartbeat(game) {
<<<<<<< HEAD
  return () => game._debugBackend._handler({ type: "command", payload: "debug:subscribe" });
=======
  return () => game.debugSession.backend._handler({ type: "command", payload: "debug:subscribe" });
>>>>>>> 07d6ec7 (refactor: add host abstraction, scene stack/context and renderer host; make debug streaming opt-in)
}

const FRAMES = 300;

for (const count of [1000]) {
  divider(`debug overhead — ${count.toLocaleString()} sprites`);

  let r = await build(count, { debug: false });
  const off = measure("debug: false (default)", r, FRAMES);
  r.destroy();

  // debug: true with no workspace window open — the common case while
  // developing. Streaming is gated on a subscription, so this should sit
  // close to debug: false.
  r = await build(count, { debug: true });
  const idle = measure("debug: true, no workspace attached", r, FRAMES);
  r.destroy();

  // debug: true with a workspace subscribed — the cost you opt into when a
  // debug window is actually open and receiving.
  r = await build(count, { debug: true });
  const streaming = measure("debug: true, workspace subscribed", r, FRAMES, heartbeat(r));
  r.destroy();

  console.log("");
  console.log(`    idle debug overhead:     ${(idle - off).toFixed(4)} ms/frame`);
  console.log(`    streaming overhead:      ${(streaming - idle).toFixed(4)} ms/frame`);
  console.log(`    saved when unwatched:    ${(streaming - idle).toFixed(4)} ms/frame ` +
              `(${(streaming / Math.max(idle, 0.0001)).toFixed(1)}x)`);
  console.log("");
}
