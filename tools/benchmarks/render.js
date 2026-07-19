import { benchmark, printResult, divider } from "./runner.js";
import { createWorld, createCanvasMock, populateEntities } from "./helpers.js";
import { Transform, Renderable, RenderBounds, Visible } from "../../ecs/index.js";
import { RenderSystem } from "../../ecs/systems/RenderSystem.js";
import { RenderQueue } from "../../ecs/render/RenderQueue.js";
import { CanvasContext } from "../../ecs/render/CanvasContext.js";
import { Camera } from "../../camera/Camera.js";

export function run(config) {
  divider("Render Benchmark");

  const counts = [100, 1000, 10000].filter(c => c <= (config.maxEntities ?? 100000));

  for (const count of counts) {
    const world = createWorld();
    const queue = new RenderQueue();
    const canvas = createCanvasMock();
    const camera = new Camera();

    world.setResource(RenderQueue, queue);
    world.setResource(CanvasContext, canvas);

    const system = new RenderSystem();
    world.addSystem(system);

    populateEntities(world, count, [Transform, Renderable, RenderBounds, Visible], {
      randomPositions: true,
      randomSizes: true,
    });

    const componentIds = system._compiled.componentIds;
    const tid = componentIds.get(Transform);
    const rid = componentIds.get(Renderable);
    const rbid = componentIds.get(RenderBounds);
    const vid = componentIds.get(Visible);

    world.update(0);

    divider(`  Command generation — ${count.toLocaleString()} entities`);

    const rGen = benchmark(`    push only`, () => {
      queue.clear();
      const tables = system._ctx.tables();
      for (let ti = 0; ti < tables.length; ti++) {
        const table = tables[ti];
        const c = table.count;
        if (c === 0) continue;
        const tx = table.getColumn(tid, "x");
        const ty = table.getColumn(tid, "y");
        const trot = table.getColumn(tid, "rotation");
        const tsx = table.getColumn(tid, "scaleX");
        const tsy = table.getColumn(tid, "scaleY");
        const img = table.getColumn(rid, "image");
        const fillCol = table.getColumn(rid, "fillColor");
        const shape = table.getColumn(rid, "shape");
        const layer = table.getColumn(rid, "layer");
        const rw = table.getColumn(rbid, "width");
        const rh = table.getColumn(rbid, "height");
        const visible = table.getColumn(vid, "value");
        for (let r = 0; r < c; r++) {
          if (!visible[r]) continue;
          const id = img[r];
          let srcImg = null, sx = 0, sy = 0, sw = 0, sh = 0;
          if (id) {
            srcImg = id;
            sw = 16;
            sh = 16;
          }
          queue.push(srcImg, sx, sy, sw, sh, tx[r], ty[r], trot[r], tsx[r], tsy[r], rw[r], rh[r], fillCol[r], shape[r], layer[r]);
        }
      }
    }, { iterations: Math.min(config.iterations, 500), warmup: config.warmup });
    printResult(rGen, { entityCount: count });

    const cmdCount = queue.count;

    divider(`  RenderQueue.execute() — ${cmdCount.toLocaleString()} commands`);

    canvas._reset();
    const rExec = benchmark(`    execute (no-op mock)`, () => {
      canvas._reset();
      queue.execute(canvas, camera);
    }, { iterations: Math.min(config.iterations, 500), warmup: config.warmup });
    printResult(rExec);
  }
}
