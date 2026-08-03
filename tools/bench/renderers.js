// Renderer micro-benchmark: compares the CPU-side frame cost of the Canvas,
// WebGL and WebGPU renderers under mock contexts. Measures the shared batching
// pipeline (command iteration -> instance data -> upload), which is where the
// three backends differ on the CPU. Real GPU timings require a browser.
//
// Run: node tools/bench/renderers.js

import { World } from "../../ecs/core/World.js";
import { RenderQueue } from "../../ecs/render/RenderQueue.js";
import { CanvasRenderer } from "../../renderer/CanvasRenderer.js";
import { WebGLRenderer } from "../../renderer/WebGLRenderer.js";
import { WebGpuRenderer } from "../../renderer/WebGpuRenderer.js";
import { ParticleEffect } from "../../particles/ParticleEffect.js";
import { Particle } from "../../display/Particle.js";
import { makeMockGL } from "../ecs/tests/lib/MockGL.js";
import { makeMockGPU } from "../ecs/tests/lib/MockGPU.js";

function mock2D() {
  return {
    save() {}, restore() {}, translate() {}, rotate() {}, scale() {},
    clearRect() {}, fillRect() {}, strokeRect() {}, beginPath() {}, arc() {},
    fill() {}, stroke() {}, drawImage() {}, moveTo() {}, lineTo() {}, closePath() {},
    set fillStyle(v) {}, set strokeStyle(v) {}, set lineWidth(v) {}, set globalAlpha(v) {},
    set imageSmoothingEnabled(v) {},
    getTransform() { return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }; },
    setTransform() {},
  };
}

function fillQueue(queue, count, image) {
  for (let i = 0; i < count; i++) {
    if (image && (i % 2) === 0) {
      queue.push(image, 0, 0, 16, 16, i, i, 0, 1, 1, 16, 16, 0, 0, 1, true, 0);
    } else {
      queue.push(null, 0, 0, 0, 0, i, i, 0, 1, 1, 8, 8, 0xff0000, 0, 1, true, 0);
    }
  }
}

function measure(label, fn, frames = 120) {
  fn(); // warm up
  const t0 = performance.now();
  for (let i = 0; i < frames; i++) fn();
  const total = performance.now() - t0;
  return { label, msPerFrame: total / frames, frames };
}

async function main() {
  const N = 2000;
  const image = { width: 16, height: 16, data: new Uint8Array(16 * 16 * 4) };

  const results = [];

  // Sprites scenario
  const world = new World();
  const queue = new RenderQueue();
  world.setResource(RenderQueue, queue);
  fillQueue(queue, N, image);

  {
    const renderer = new CanvasRenderer({ context: mock2D(), width: 800, height: 600 });
    results.push(measure("canvas sprites", () => renderer.render(world)));
    renderer.destroy();
  }
  {
    const renderer = new WebGLRenderer({ context: makeMockGL().gl, width: 800, height: 600 });
    results.push(measure("webgl sprites", () => renderer.render(world)));
    renderer.destroy();
  }
  {
    const mock = makeMockGPU();
    const renderer = new WebGpuRenderer({ canvas: { getContext: (k) => (k === "webgpu" ? mock.context : null) }, width: 800, height: 600, options: { device: mock.device, format: "bgra8unorm" } });
    await renderer.initialize();
    results.push(measure("webgpu sprites", () => renderer.render(world)));
    renderer.destroy();
  }

  // Particles scenario
  const world2 = new World();
  world2.setResource(RenderQueue, new RenderQueue());
  ParticleEffect._defaultWorld = world2;
  const effect = Particle.create({ capacity: 512 });
  effect.burst(256);

  {
    const renderer = new CanvasRenderer({ context: mock2D(), width: 800, height: 600 });
    results.push(measure("canvas particles (256)", () => renderer.render(world2)));
    renderer.destroy();
  }
  {
    const renderer = new WebGLRenderer({ context: makeMockGL().gl, width: 800, height: 600 });
    results.push(measure("webgl particles (256)", () => renderer.render(world2)));
    renderer.destroy();
  }
  {
    const mock = makeMockGPU();
    const renderer = new WebGpuRenderer({ canvas: { getContext: (k) => (k === "webgpu" ? mock.context : null) }, width: 800, height: 600, options: { device: mock.device, format: "bgra8unorm" } });
    await renderer.initialize();
    results.push(measure("webgpu particles (256)", () => renderer.render(world2)));
    renderer.destroy();
  }

  effect.destroy();
  ParticleEffect._defaultWorld = null;

  console.log(`Renderer micro-benchmark (${N} commands / 256 particles, mock contexts, CPU-side batch cost)`);
  for (const r of results) {
    console.log(`  ${r.label.padEnd(28)} ${r.msPerFrame.toFixed(3)} ms/frame`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
