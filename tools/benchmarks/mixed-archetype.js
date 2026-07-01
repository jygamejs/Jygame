import { benchmark, printResult, divider } from "./runner.js";
import { createWorld, createCanvasMock } from "./helpers.js";
import { MovementSystem } from "../../ecs/systems/MovementSystem.js";
import { CollisionSystem } from "../../ecs/systems/CollisionSystem.js";
import { RenderSystem } from "../../ecs/systems/RenderSystem.js";
import { TrailSystem } from "../../ecs/systems/TrailSystem.js";
import { Transform, Velocity, Collider, Renderable, RenderBounds, Visible, Trail } from "../../ecs/index.js";
import { SpatialHash } from "../../collision/SpatialHash.js";
import { RenderQueue } from "../../ecs/render/RenderQueue.js";
import { CanvasContext } from "../../ecs/render/CanvasContext.js";
import { TrailManager } from "../../ecs/trails/TrailManager.js";
import { Camera } from "../../camera/Camera.js";
import { performance } from "node:perf_hooks";

const ARCHETYPE_DIST = [
  { pct: 0.40, comps: [Transform, Velocity], label: "T+V" },
  { pct: 0.25, comps: [Transform, Visible], label: "T+Vis" },
  { pct: 0.20, comps: [Transform, Collider], label: "T+C" },
  { pct: 0.10, comps: [Transform, Velocity, Visible], label: "T+V+Vis" },
  { pct: 0.05, comps: [Transform, Velocity, Collider, Renderable, RenderBounds, Visible, Trail], label: "Full" },
];

export function run(config) {
  divider("Mixed Archetype Benchmark");

  const counts = [100, 1000, 10000].filter(c => c <= (config.maxEntities ?? 100000));

  for (const count of counts) {
    const opts = benchOpts(config, count);
    const dt = 1 / 60;

    const { world, allSystems, canvas, camera, queue, trailMgr } = buildWorld(count);

    divider(`  Mixed archetypes — ${count.toLocaleString()} entities (${formatDist(ARCHETYPE_DIST)})`);

    const ecOpts = { ...opts, entityCount: count };

    const rFrame = benchmark(`    full frame`, () => {
      canvas._reset();
      trailMgr.clear();
      for (const sys of allSystems) {
        sys._ctx._refresh(dt);
        sys.update(sys._ctx, dt);
      }
      queue.execute(canvas, camera);
    }, ecOpts);
    printResult(rFrame, { entityCount: count });

    const rQuery = benchmark(`    query iteration`, () => {
      canvas._reset();
      for (const sys of allSystems) {
        sys._ctx._refresh(dt);
        void sys._ctx.tables();
      }
    }, ecOpts);
    printResult(rQuery, { entityCount: count });
  }
}

function buildWorld(count) {
  const world = createWorld();
  world.setResource(SpatialHash, new SpatialHash());
  const queue = new RenderQueue();
  world.setResource(RenderQueue, queue);
  const trailMgr = new TrailManager();
  world.setResource(TrailManager, trailMgr);
  const canvas = createCanvasMock();
  world.setResource(CanvasContext, canvas);
  const camera = new Camera(0, 0, 800, 600);
  world.setResource(Camera, camera);

  const movement = new MovementSystem();
  const collision = new CollisionSystem();
  const trailSys = new TrailSystem();
  const render = new RenderSystem();
  const allSystems = [movement, collision, trailSys, render];
  for (const sys of allSystems) world.addSystem(sys);

  let rng = 42;
  function rand() { rng = (rng * 16807) % 2147483647; return (rng - 1) / 2147483646; }

  for (let i = 0; i < count; i++) {
    const eid = world.createEntity();
    const arch = pickArchetype(rand);
    world.addMany(eid, ...arch.comps);
    if (arch.comps.includes(Transform)) {
      world.setComponent(eid, Transform, { x: rand() * 800 - 400, y: rand() * 600 - 300 });
    }
    if (arch.comps.includes(Velocity)) {
      world.setComponent(eid, Velocity, { x: rand() * 200 - 100, y: rand() * 200 - 100 });
    }
    if (arch.comps.includes(Collider)) {
      world.setComponent(eid, Collider, { width: rand() * 32 + 8, height: rand() * 32 + 8 });
    }
    if (arch.comps.includes(Visible)) {
      world.setComponent(eid, Visible, { value: 1 });
    }
  }

  return { world, allSystems, canvas, camera, queue, trailMgr };
}

function pickArchetype(rand) {
  const r = rand();
  let acc = 0;
  for (const arch of ARCHETYPE_DIST) {
    acc += arch.pct;
    if (r < acc) return arch;
  }
  return ARCHETYPE_DIST[ARCHETYPE_DIST.length - 1];
}

function formatDist(dists) {
  return dists.map(d => `${d.label}=${(d.pct * 100).toFixed(0)}%`).join(", ");
}

function benchOpts(config, count) {
  let iterations, warmup;
  if (count <= 100) { iterations = Math.min(config.iterations, 200); warmup = Math.min(config.warmup, 20); }
  else if (count <= 1000) { iterations = Math.min(config.iterations, 50); warmup = Math.min(config.warmup, 10); }
  else { iterations = Math.min(config.iterations, 10); warmup = Math.min(config.warmup, 5); }
  return { iterations, warmup };
}
