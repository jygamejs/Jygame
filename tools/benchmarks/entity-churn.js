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

const CHURN_RATES = [0.01, 0.05, 0.10];
const CHURN_COMPS = [Transform, Velocity, Collider, Renderable, RenderBounds, Visible, Trail];

export function run(config) {
  divider("Entity Churn Benchmark");

  const counts = [100, 1000, 10000].filter(c => c <= (config.maxEntities ?? 100000));

  for (const count of counts) {
    for (const churnRate of CHURN_RATES) {
      const opts = benchOpts(config, count);
      const dt = 1 / 60;
      const churnPerFrame = Math.max(1, Math.round(count * churnRate));

      divider(`  ${(churnRate * 100).toFixed(0)}% churn (${churnPerFrame}/frame) — ${count.toLocaleString()} entities`);

      const { world, allSystems, canvas, camera, queue, trailMgr } = buildWorld(count);
      const churnLabel = `(${(churnRate * 100).toFixed(0)}% churn)`;

      const rFrame = benchmark(`    full frame ${churnLabel}`, () => {
        canvas._reset();
        trailMgr.clear();
        for (const sys of allSystems) {
          sys._ctx._refresh(dt);
          sys.update(sys._ctx, dt);
        }
        queue.execute(canvas, camera);
        for (let i = 0; i < churnPerFrame; i++) {
          const eid = world.createEntity();
          world.addMany(eid, ...CHURN_COMPS);
          world.setComponent(eid, Transform, { x: 0, y: 0 });
          world.setComponent(eid, Visible, { value: 1 });
        }
        const alive = [];
        for (let i = 1; i <= world.entityManager._nextId; i++) {
          if (world.entityManager.isAlive(i)) alive.push(i);
        }
        const toKeep = alive.slice(0, Math.max(10, alive.length - churnPerFrame));
        const toDestroy = alive.slice(toKeep.length);
        for (const eid of toDestroy) world.destroyEntity(eid);
      }, { ...opts, entityCount: count });
      printResult(rFrame, { entityCount: count });

      const wSpawn = buildWorld(count);
      const rSpawn = benchmark(`    spawn only ${churnLabel}`, () => {
        canvas._reset();
        for (let i = 0; i < churnPerFrame; i++) {
          const eid = wSpawn.world.createEntity();
          wSpawn.world.addMany(eid, ...CHURN_COMPS);
          wSpawn.world.setComponent(eid, Transform, { x: 0, y: 0 });
        }
      }, { ...opts, entityCount: churnPerFrame });
      printResult(rSpawn, { entityCount: churnPerFrame });

      const wDestroy = buildWorld(count);
      const rDestroy = benchmark(`    destroy only ${churnLabel}`, () => {
        canvas._reset();
        const alive = [];
        for (let i = 1; i <= wDestroy.world.entityManager._nextId; i++) {
          if (wDestroy.world.entityManager.isAlive(i)) alive.push(i);
        }
        const toDestroy = alive.slice(0, Math.min(churnPerFrame, alive.length));
        for (const eid of toDestroy) wDestroy.world.destroyEntity(eid);
      }, { ...opts, entityCount: churnPerFrame });
      printResult(rDestroy, { entityCount: churnPerFrame });

      const wMigrate = buildWorld(count);
      const rMigrate = benchmark(`    migrate (add+remove) ${churnLabel}`, () => {
        canvas._reset();
        const alive = [];
        for (let i = 1; i <= wMigrate.world.entityManager._nextId; i++) {
          if (wMigrate.world.entityManager.isAlive(i)) alive.push(i);
        }
        const batch = alive.slice(0, Math.min(churnPerFrame, alive.length));
        for (const eid of batch) {
          wMigrate.world.removeComponent(eid, Trail);
          wMigrate.world.addComponent(eid, Trail);
        }
      }, { ...opts, entityCount: churnPerFrame * 2 });
      printResult(rMigrate, { entityCount: churnPerFrame * 2 });
    }
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
  const trail = new TrailSystem();
  const render = new RenderSystem();
  const allSystems = [movement, collision, trail, render];
  for (const sys of allSystems) world.addSystem(sys);

  let rng = 42;
  function rand() { rng = (rng * 16807) % 2147483647; return (rng - 1) / 2147483646; }
  for (let i = 0; i < count; i++) {
    const eid = world.createEntity();
    world.addMany(eid, ...CHURN_COMPS);
    world.setComponent(eid, Transform, { x: rand() * 800 - 400, y: rand() * 600 - 300 });
    world.setComponent(eid, Visible, { value: 1 });
  }
  return { world, allSystems, canvas, camera, queue, trailMgr };
}

function benchOpts(config, count) {
  let iterations, warmup;
  if (count <= 100) { iterations = Math.min(config.iterations, 100); warmup = Math.min(config.warmup, 10); }
  else if (count <= 1000) { iterations = Math.min(config.iterations, 30); warmup = Math.min(config.warmup, 5); }
  else { iterations = Math.min(config.iterations, 10); warmup = Math.min(config.warmup, 3); }
  return { iterations, warmup };
}
