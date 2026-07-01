import { benchmark, printResult, divider } from "./runner.js";
import { createWorld, createCanvasMock } from "./helpers.js";
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

const ALL_COMPS = [Transform, Velocity, Collider, Renderable, RenderBounds, Visible, Trail];

export function run(config) {
  divider("Full Frame Benchmark");

  const counts = [100, 1000, 10000, 100000].filter(c => c <= (config.maxEntities ?? 100000));

  for (const count of counts) {
    const opts = benchOpts(config, count);
    const dt = 1 / 60;

    const { world, movement, collision, trail, render, allSystems, canvas, camera, queue, trailMgr, spatialHash, ids } = createBenchWorld(count);

    divider(`  Full frame — ${count.toLocaleString()} entities`);

    const ecOpts = { ...opts, entityCount: count };

    const rTotal = benchmark(`    total frame`, () => {
      canvas._reset();
      trailMgr.clear();
      for (const sys of allSystems) {
        sys._ctx._refresh(dt);
        sys.update(sys._ctx, dt);
      }
      queue.execute(canvas, camera);
    }, ecOpts);
    printResult(rTotal, { entityCount: count });

    const rMovement = benchmark(`    movement system`, () => {
      canvas._reset();
      trailMgr.clear();
      queue.clear();
      movement._ctx._refresh(dt);
      movement.update(movement._ctx, dt);
    }, ecOpts);
    printResult(rMovement, { entityCount: count });

    const rCollision = benchmark(`    collision system`, () => {
      canvas._reset();
      trailMgr.clear();
      queue.clear();
      collision._ctx._refresh(dt);
      collision.update(collision._ctx, dt);
    }, ecOpts);
    printResult(rCollision, { entityCount: count });

    const rTrail = benchmark(`    trail system`, () => {
      canvas._reset();
      trailMgr.clear();
      queue.clear();
      trail._ctx._refresh(dt);
      trail.update(trail._ctx, dt);
    }, ecOpts);
    printResult(rTrail, { entityCount: count });

    const rRender = benchmark(`    render system`, () => {
      canvas._reset();
      trailMgr.clear();
      queue.clear();
      render._ctx._refresh(dt);
      render.update(render._ctx, dt);
    }, ecOpts);
    printResult(rRender, { entityCount: count });

    const rExec = benchmark(`    queue execute`, () => {
      canvas._reset();
      trailMgr.clear();
      render._ctx._refresh(dt);
      render.update(render._ctx, dt);
      queue.execute(canvas, camera);
    }, ecOpts);
    printResult(rExec);
  }
}

function createBenchWorld(count) {
  const world = createWorld();
  const queue = new RenderQueue();
  const trailMgr = new TrailManager();
  const spatialHash = new SpatialHash();
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

  const ids = [];
  let rng = 42;
  function rand() { rng = (rng * 16807) % 2147483647; return (rng - 1) / 2147483646; }
  for (let i = 0; i < count; i++) {
    const eid = world.createEntity();
    world.addMany(eid, ...ALL_COMPS);
    world.setComponent(eid, Transform, { x: rand() * 800 - 400, y: rand() * 600 - 300 });
    world.setComponent(eid, Velocity, { x: rand() * 200 - 100, y: rand() * 200 - 100 });
    world.setComponent(eid, Collider, { width: rand() * 32 + 8, height: rand() * 32 + 8 });
    world.setComponent(eid, Visible, { value: 1 });
    ids.push(eid);
  }

  return { world, movement, collision, trail, render, allSystems, canvas, camera, queue, trailMgr, spatialHash, ids };
}

function benchOpts(config, count) {
  let iterations, warmup;
  if (count <= 100) {
    iterations = Math.min(config.iterations, 200);
    warmup = Math.min(config.warmup, 20);
  } else if (count <= 1000) {
    iterations = Math.min(config.iterations, 50);
    warmup = Math.min(config.warmup, 10);
  } else if (count <= 10000) {
    iterations = Math.min(config.iterations, 20);
    warmup = Math.min(config.warmup, 5);
  } else {
    iterations = Math.min(config.iterations, 5);
    warmup = Math.min(config.warmup, 3);
  }
  return { iterations, warmup };
}
