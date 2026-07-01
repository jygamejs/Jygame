import { benchmark, printResult, divider } from "./runner.js";
import { createWorld, createCanvasMock, populateEntities } from "./helpers.js";
import { Transform, Trail, Visible } from "../../ecs/index.js";
import { TrailSystem } from "../../ecs/systems/TrailSystem.js";
import { TrailManager } from "../../ecs/trails/TrailManager.js";
import { CanvasContext } from "../../ecs/render/CanvasContext.js";

export function run(config) {
  divider("Trail Benchmark");

  const counts = [100, 500, 1000].filter(c => c <= (config.maxEntities ?? 100000));

  for (const count of counts) {
    const canvas = createCanvasMock();

    divider(`  Point generation — ${count.toLocaleString()} entities`);

    {
      const world = createWorld();
      world.setResource(TrailManager, new TrailManager());
      world.setResource(CanvasContext, canvas);
      const system = new TrailSystem();
      world.addSystem(system);

      populateEntities(world, count, [Transform, Trail, Visible], { randomPositions: true });
      for (let i = 1; i <= count; i++) {
        world.setComponent(i, Trail, { enabled: 1, maxPoints: 50, spacing: 5, width: 3, color: 0xffffff, mode: 0 });
        world.setComponent(i, Visible, { value: 1 });
      }

      world.update(0);

      const rGen = benchmark(`    Generate`, () => {
        world.update(1 / 60);
      }, { iterations: Math.min(config.iterations, 200), warmup: config.warmup });
      printResult(rGen, { entityCount: count });
    }

    divider(`  Rendering — ${count.toLocaleString()} entities, 20 points each`);

    {
      const world = createWorld();
      const mgr = new TrailManager();
      world.setResource(TrailManager, mgr);
      world.setResource(CanvasContext, canvas);
      const system = new TrailSystem();
      world.addSystem(system);

      populateEntities(world, count, [Transform, Trail, Visible]);
      for (let i = 1; i <= count; i++) {
        world.setComponent(i, Trail, { enabled: 1, maxPoints: 50, spacing: 5, width: 3, color: 0xffffff, mode: 0 });
        world.setComponent(i, Visible, { value: 1 });
        world.setComponent(i, Transform, { x: Math.random() * 800 - 400, y: Math.random() * 600 - 300 });
      }

      world.update(0);

      const componentIds = system._compiled.componentIds;
      const txfId = componentIds.get(Transform);
      const tlid = componentIds.get(Trail);
      const vid = componentIds.get(Visible);

      for (const table of system._ctx) {
        const c = table.count;
        const entities = table.entityIds;
        const tx = table.getColumn(txfId, "x");
        const ty = table.getColumn(txfId, "y");
        for (let r = 0; r < c; r++) {
          const buf = mgr.getOrCreate(entities[r], 50);
          for (let p = 0; p < 20; p++) {
            buf.addPoint(tx[r] + p * 5, ty[r] + Math.sin(p) * 10);
          }
        }
      }

      canvas._reset();

      const rRender = benchmark(`    Render line mode`, () => {
        canvas._reset();
        for (const table of system._ctx) {
          const c = table.count;
          if (c === 0) continue;
          const enabledCol = table.getColumn(tlid, "enabled");
          const colorCol = table.getColumn(tlid, "color");
          const widthCol = table.getColumn(tlid, "width");
          const visibleCol = table.getColumn(vid, "value");
          const entities = table.entityIds;
          for (let r = 0; r < c; r++) {
            const eid = entities[r];
            if (!visibleCol[r] || !enabledCol[r]) continue;
            const buf = mgr.get(eid);
            if (!buf || buf.count < 2) continue;
            system._renderLine(canvas, buf, colorCol[r], widthCol[r]);
          }
        }
      }, { iterations: Math.min(config.iterations, 100), warmup: config.warmup });
      printResult(rRender);
    }
  }
}
