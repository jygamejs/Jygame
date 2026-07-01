import { divider } from "./runner.js";
import { createWorld, createCanvasMock, populateEntities } from "./helpers.js";
import { MovementSystem } from "../../ecs/systems/MovementSystem.js";
import { CollisionSystem } from "../../ecs/systems/CollisionSystem.js";
import { TrailSystem } from "../../ecs/systems/TrailSystem.js";
import { RenderSystem } from "../../ecs/systems/RenderSystem.js";
import { Transform, Velocity, Collider, Renderable, RenderBounds, Visible, Trail } from "../../ecs/index.js";
import { SpatialHash } from "../../collision/SpatialHash.js";
import { RenderQueue } from "../../ecs/render/RenderQueue.js";
import { CanvasContext } from "../../ecs/render/CanvasContext.js";
import { TrailManager } from "../../ecs/trails/TrailManager.js";
import { Camera } from "../../camera/Camera.js";
import { performance } from "node:perf_hooks";

const FRAME_COUNTS = [10000, 50000, 100000];

export function run(config) {
  divider("Long-Running Stability Benchmark");
  console.log("  (use --expose-gc for memory tracking)");
  console.log("");

  const entityCount = Math.min(config.maxEntities ?? 10000, 10000);

  for (const totalFrames of FRAME_COUNTS) {
    runStabilityTest(entityCount, totalFrames);
  }
}

function buildTestWorld() {
  const world = createWorld();
  const spatialHash = new SpatialHash();
  const queue = new RenderQueue();
  const trailMgr = new TrailManager();
  world.setResource(SpatialHash, spatialHash);
  world.setResource(RenderQueue, queue);
  world.setResource(TrailManager, trailMgr);
  const canvas = createCanvasMock();
  world.setResource(CanvasContext, canvas);
  const camera = new Camera(0, 0, 800, 600);
  world.setResource(Camera, camera);
  const movement = new MovementSystem();
  const collision = new CollisionSystem();
  const trail = new TrailSystem();
  const render = new RenderSystem();
  const allSystems = [movement, collision, trail, render];
  for (const sys of allSystems) world.addSystem(sys);
  return { world, allSystems, canvas, camera, queue, trailMgr, spatialHash };
}

function runStabilityTest(baseCount, totalFrames) {
  const dt = 1 / 60;
  const SPAWN_EVERY = 100;
  const DESTROY_EVERY = 150;
  const SPAWN_COUNT = 10;

  const { world, allSystems, canvas, camera, queue, trailMgr, spatialHash } = buildTestWorld();
  populateEntities(world, baseCount,
    [Transform, Velocity, Collider, Renderable, RenderBounds, Visible, Trail],
    { randomPositions: true, randomVelocities: true, randomSizes: true }
  );

  divider(`  Stability: ${totalFrames.toLocaleString()} frames, ${baseCount.toLocaleString()} base entities`);

  const frameTimes = [];
  const memSamples = [];
  const SAMPLE_INTERVAL = Math.max(1, Math.floor(totalFrames / 50));
  const gc = typeof globalThis.gc === "function" ? globalThis.gc : null;
  const hasExposeGc = gc !== null;

  const spawned = [];

  for (let frame = 0; frame < totalFrames; frame++) {
    const start = performance.now();

    canvas._reset();
    spatialHash.clear();
    queue.clear();
    trailMgr.clear();
    for (const sys of allSystems) {
      sys._ctx._refresh(dt);
      sys.update(sys._ctx, dt);
    }
    queue.execute(canvas, camera);

    if (frame % SPAWN_EVERY === 0 && frame > 0) {
      for (let i = 0; i < SPAWN_COUNT; i++) {
        const eid = world.createEntity();
        world.addMany(eid, Transform, Velocity, Collider, Renderable, RenderBounds, Visible, Trail);
        world.setComponent(eid, Transform, { x: 0, y: 0 });
        world.setComponent(eid, Velocity, { x: 10, y: 10 });
        spawned.push(eid);
      }
    }

    if (frame % DESTROY_EVERY === 0 && frame > 0 && spawned.length > 0) {
      const toDestroy = Math.min(SPAWN_COUNT, spawned.length);
      for (let i = 0; i < toDestroy; i++) {
        const eid = spawned.pop();
        if (eid) world.destroyEntity(eid);
      }
    }

    frameTimes.push(performance.now() - start);

    if (frame % SAMPLE_INTERVAL === 0 || frame === totalFrames - 1) {
      if (hasExposeGc) gc();
      const mem = process.memoryUsage();
      memSamples.push({
        frame,
        heapUsed: mem.heapUsed,
        heapTotal: mem.heapTotal,
        rss: mem.rss,
        external: mem.external,
      });
    }

    if (frame === 0 || frame === totalFrames - 1 || frame === Math.floor(totalFrames / 2)) {
      reportSnapshot(frame, frameTimes, memSamples, baseCount + spawned.length, hasExposeGc);
    }
  }

  divider(`  Final report — ${totalFrames.toLocaleString()} frames`);
  reportStats(frameTimes);
  reportMemTrend(memSamples);
  console.log(`  Final entity count: ${baseCount + spawned.length}`);
  console.log("");
}

function reportSnapshot(frame, frameTimes, memSamples, entityCount, hasExposeGc) {
  if (frameTimes.length === 0) return;
  const recent = frameTimes.slice(-Math.min(100, frameTimes.length));
  const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
  const fps = avg > 0 ? 1000 / avg : 0;
  const min = Math.min(...recent);
  const max = Math.max(...recent);
  const lastMem = memSamples.length > 0 ? memSamples[memSamples.length - 1] : null;

  const memStr = lastMem
    ? `heap=${(lastMem.heapUsed / 1024 / 1024).toFixed(1)}MB rss=${(lastMem.rss / 1024 / 1024).toFixed(1)}MB`
    : "mem=N/A (no --expose-gc)";

  console.log(
    `  [frame ${frame.toLocaleString().padStart(7)}] ` +
    `avg=${avg.toFixed(3)}ms ` +
    `min=${min.toFixed(3)}ms ` +
    `max=${max.toFixed(3)}ms ` +
    `FPS=${fps.toFixed(1)} ` +
    `entities=${entityCount} ` +
    memStr
  );
}

function reportStats(times) {
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const min = Math.min(...times);
  const max = Math.max(...times);
  const sorted = [...times].sort((a, b) => a - b);
  const p50 = percentile(sorted, 50);
  const p95 = percentile(sorted, 95);
  const p99 = percentile(sorted, 99);

  let sumSq = 0;
  for (const t of times) sumSq += (t - avg) ** 2;
  const stddev = Math.sqrt(sumSq / times.length);

  console.log(`  Avg: ${avg.toFixed(3)}ms  Min: ${min.toFixed(3)}ms  Max: ${max.toFixed(3)}ms`);
  console.log(`  P50: ${p50.toFixed(3)}ms  P95: ${p95.toFixed(3)}ms  P99: ${p99.toFixed(3)}ms`);
  console.log(`  StdDev: ${stddev.toFixed(4)}ms`);
  console.log(`  Effective FPS: ${(1000 / avg).toFixed(1)}`);
}

function reportMemTrend(samples) {
  if (samples.length < 2) return;
  const first = samples[0];
  const last = samples[samples.length - 1];
  const heapGrowth = last.heapUsed - first.heapUsed;
  const rssGrowth = last.rss - first.rss;
  const growthPerFrame = samples.length > 1 ? heapGrowth / (last.frame - first.frame) : 0;
  const heapLeakStr = growthPerFrame > 100 ? ` ⚠ LEAK (${(growthPerFrame).toFixed(1)} bytes/frame)` : "";

  console.log(`  Memory: ${(first.heapUsed / 1024 / 1024).toFixed(1)}MB → ${(last.heapUsed / 1024 / 1024).toFixed(1)}MB heap`);
  console.log(`  RSS: ${(first.rss / 1024 / 1024).toFixed(1)}MB → ${(last.rss / 1024 / 1024).toFixed(1)}MB`);
  console.log(`  Heap growth: ${(heapGrowth / 1024).toFixed(1)}KB (${(growthPerFrame).toFixed(1)} bytes/frame)${heapLeakStr}`);
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const frac = idx - lo;
  return sorted[lo] * (1 - frac) + sorted[hi] * frac;
}
