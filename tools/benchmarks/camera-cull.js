import { benchmark, printResult, divider } from "./runner.js";
import { createWorld, createCanvasMock } from "./helpers.js";
import { MovementSystem } from "../../ecs/systems/MovementSystem.js";
import { RenderSystem } from "../../ecs/systems/RenderSystem.js";
import { Transform, Velocity, Renderable, RenderBounds, Visible } from "../../ecs/index.js";
import { RenderQueue } from "../../ecs/render/RenderQueue.js";
import { CanvasContext } from "../../ecs/render/CanvasContext.js";
import { Camera } from "../../camera/Camera.js";

const VISIBILITY_RATIOS = [1.0, 0.5, 0.25, 0.10, 0.01];

export function run(config) {
  divider("Camera / View Culling Benchmark");

  const counts = [100, 1000, 10000].filter(c => c <= (config.maxEntities ?? 100000));

  for (const count of counts) {
    for (const visRatio of VISIBILITY_RATIOS) {
      const opts = benchOpts(config, count);
      const dt = 1 / 60;
      const visibleCount = Math.max(1, Math.round(count * visRatio));

      const world = createWorld();
      const queue = new RenderQueue();
      world.setResource(RenderQueue, queue);
      const canvas = createCanvasMock();
      world.setResource(CanvasContext, canvas);
      const camera = new Camera(0, 0, 800, 600);
      world.setResource(Camera, camera);

      const movement = new MovementSystem();
      const render = new RenderSystem();
      world.addSystem(movement);
      world.addSystem(render);

      let rng = 42;
      function rand() { rng = (rng * 16807) % 2147483647; return (rng - 1) / 2147483646; }

      for (let i = 0; i < count; i++) {
        const eid = world.createEntity();
        world.addMany(eid, Transform, Renderable, RenderBounds, Visible);
        world.setComponent(eid, Transform, { x: rand() * 800 - 400, y: rand() * 600 - 300 });
        world.setComponent(eid, Visible, { value: i < visibleCount ? 1 : 0 });
      }

      divider(
        `  ${(visRatio * 100).toFixed(0)}% visible (${visibleCount}/${count}) — ${count.toLocaleString()} entities`
      );

      const ecOpts = { ...opts, entityCount: count };
      const visLabel = `(${(visRatio * 100).toFixed(0)}% vis)`;

      const rFrame = benchmark(`    total frame ${visLabel}`, () => {
        canvas._reset();
        queue.clear();
        movement._ctx._refresh(dt);
        movement.update(movement._ctx, dt);
        render._ctx._refresh(dt);
        render.update(render._ctx, dt);
        queue.execute(canvas, camera);
      }, ecOpts);
      printResult(rFrame, { entityCount: count });

      const rCmdGen = benchmark(`    cmd generation ${visLabel}`, () => {
        canvas._reset();
        queue.clear();
        render._ctx._refresh(dt);
        render.update(render._ctx, dt);
      }, ecOpts);
      printResult(rCmdGen, { entityCount: count });

      const rExec = benchmark(`    queue execute ${visLabel}`, () => {
        canvas._reset();
        queue.clear();
        render._ctx._refresh(dt);
        render.update(render._ctx, dt);
        queue.execute(canvas, camera);
      }, ecOpts);
      printResult(rExec);
    }
  }
}

function benchOpts(config, count) {
  let iterations, warmup;
  if (count <= 100) { iterations = Math.min(config.iterations, 200); warmup = Math.min(config.warmup, 20); }
  else if (count <= 1000) { iterations = Math.min(config.iterations, 50); warmup = Math.min(config.warmup, 10); }
  else { iterations = Math.min(config.iterations, 10); warmup = Math.min(config.warmup, 5); }
  return { iterations, warmup };
}
