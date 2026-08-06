// Isolates what `debug: true` costs per frame, with and without a workspace
// attached.
//
// Streaming a snapshot means: full world snapshot -> toJSON -> postMessage
// (structured clone). That used to run unconditionally whenever debug was on,
// because the backend's BroadcastChannel opens successfully whether or not
// anything is listening. It is now gated on a subscription, so an unwatched
// game should sit at the same cost as debug: false.
//
// Run with: node --expose-gc tools/benchmarks/debug-overhead.js

import { divider } from "./runner.js";



const { Game, Scene, Sprite } = await import("../../jygame.js");
const { HeadlessHost } = await import("../../core/Host.js");

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
  const game = new Game({
    width: 1280, height: 720, fps: 60,
    host: new HeadlessHost({ width: 1280, height: 720 }),
    ...opts,
  });
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
  return () => game.debugSession.backend._handler({ type: "command", payload: "debug:subscribe" });
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
