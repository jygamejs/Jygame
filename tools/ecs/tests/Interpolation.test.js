import { describe, it } from "node:test";
import * as assert from "node:assert";



const { Game, Scene, Sprite } = await import("../../../jygame.js");
const { HeadlessHost } = await import("../../../core/Host.js");

// Transforms the renderer emitted, in draw order.
const drawn = [];

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

  const host = new HeadlessHost({ width: 800, height: 600 });
  const game = new Game({ fps: 15, width: 800, height: 600, interpolation, host });
  // Record the transforms the renderer emits; HeadlessHost's 2D context is a
  // no-op, so instrument the one the game actually draws through.
  game.ctx.setTransform = (a, b, c, d, e, f) => drawn.push({ a, b, c, d, e, f });
  const scene = new MyScene();
  game.run(scene);

  return new Promise((resolve) => {
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
        game.destroy();
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
