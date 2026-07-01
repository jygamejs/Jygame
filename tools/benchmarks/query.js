import { benchmark, printResult, divider } from "./runner.js";
import { createWorld, populateEntities } from "./helpers.js";
import { Transform, Velocity, Collider, Visible, EnemyTag, PlayerTag } from "../../ecs/index.js";

function resolveQuery(world, desc) {
  const resolved = {};
  if (desc.all) resolved.all = desc.all.map(c => world.registry.getId(c));
  if (desc.any) resolved.any = desc.any.map(c => world.registry.getId(c));
  if (desc.none) resolved.none = desc.none.map(c => world.registry.getId(c));
  return resolved;
}

export function run(config) {
  divider("Query Benchmark");

  const counts = [100, 1000, 10000].filter(c => c <= (config.maxEntities ?? 100000));

  for (const count of counts) {
    const world = createWorld();

    const eids = populateEntities(world, count, [Transform, Velocity, Collider, Visible], {
      randomPositions: true,
      randomVelocities: true,
    });

    const half = Math.floor(count / 2);
    for (let i = 0; i < half; i++) {
      world.addComponent(eids[i], EnemyTag);
    }
    for (let i = half; i < count; i++) {
      world.addComponent(eids[i], PlayerTag);
    }

    const queryEngine = world.queryEngine;

    divider(`  Query compilation — ${count.toLocaleString()} entities`);

    const desc4c = resolveQuery(world, { all: [Transform, Velocity, Collider, Visible] });
    const desc2c = resolveQuery(world, { all: [Transform, Velocity] });
    const descTag = resolveQuery(world, { all: [EnemyTag] });
    const descComplex = resolveQuery(world, { all: [Transform, Velocity], any: [EnemyTag, PlayerTag], none: [Collider] });

    const rCompile = benchmark(`    compile 4 components`, () => {
      queryEngine.createQuery(desc4c);
    }, { iterations: Math.min(config.iterations, 200), warmup: config.warmup });
    printResult(rCompile);

    const rCompileSimple = benchmark(`    compile 2 components`, () => {
      queryEngine.createQuery(desc2c);
    }, { iterations: Math.min(config.iterations, 200), warmup: config.warmup });
    printResult(rCompileSimple);

    const rCompileComplex = benchmark(`    compile all+any+none`, () => {
      queryEngine.createQuery(descComplex);
    }, { iterations: Math.min(config.iterations, 200), warmup: config.warmup });
    printResult(rCompileComplex);

    const q4c = queryEngine.createQuery(desc4c);
    const q2c = queryEngine.createQuery(desc2c);
    const qTag = queryEngine.createQuery(descTag);

    divider(`  Query execution — ${count.toLocaleString()} entities`);

    const rGetTables = benchmark(`    getTables (4 comps)`, () => {
      queryEngine.getTables(q4c);
    }, { iterations: Math.min(config.iterations, 500), warmup: config.warmup });
    printResult(rGetTables);

    const rGetTablesTag = benchmark(`    getTables (tag)`, () => {
      queryEngine.getTables(qTag);
    }, { iterations: Math.min(config.iterations, 500), warmup: config.warmup });
    printResult(rGetTablesTag);

    const viewSingle = world.query(q4c);

    divider(`  Query iteration — 1 archetype, ${count.toLocaleString()} entities`);

    const rForEach = benchmark(`    forEach`, () => {
      viewSingle.forEach(() => {});
    }, { iterations: Math.min(config.iterations, 200), warmup: config.warmup });
    printResult(rForEach, { entityCount: count });

    const rEntities = benchmark(`    entities()`, () => {
      for (const _ of viewSingle.entities()) {}
    }, { iterations: Math.min(config.iterations, 200), warmup: config.warmup });
    printResult(rEntities, { entityCount: count });

    const rRows = benchmark(`    rows()`, () => {
      for (const _ of viewSingle.rows()) {}
    }, { iterations: Math.min(config.iterations, 200), warmup: config.warmup });
    printResult(rRows, { entityCount: count });

    const viewTwo = world.query(q2c);

    divider(`  Query iteration — 2 archetypes, ${count.toLocaleString()} entities`);

    const rForEach2 = benchmark(`    forEach`, () => {
      viewTwo.forEach(() => {});
    }, { iterations: Math.min(config.iterations, 200), warmup: config.warmup });
    printResult(rForEach2, { entityCount: count });

    const rEntities2 = benchmark(`    entities()`, () => {
      for (const _ of viewTwo.entities()) {}
    }, { iterations: Math.min(config.iterations, 200), warmup: config.warmup });
    printResult(rEntities2, { entityCount: count });
  }
}
