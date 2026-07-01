import { benchmark, printResult, divider } from "./runner.js";
import { createWorld, populateEntities, addSystem } from "./helpers.js";
import { Transform, Velocity } from "../../ecs/index.js";
import { MovementSystem } from "../../ecs/systems/MovementSystem.js";

export function run(config) {
  divider("Movement Benchmark");

  const counts = [100, 1000, 10000, 100000].filter(c => c <= (config.maxEntities ?? 100000));

  for (const count of counts) {
    const world = createWorld();
    const system = new MovementSystem();
    world.addSystem(system);
    populateEntities(world, count, [Transform, Velocity], {
      randomPositions: true,
      randomVelocities: true,
    });

    world.update(0);

    const r = benchmark(`  ${count.toLocaleString().padStart(6)} entities`, () => {
      world.update(1 / 60);
    }, { iterations: config.iterations, warmup: config.warmup });

    printResult(r, { entityCount: count });
  }
}
