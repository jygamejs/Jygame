import { benchmark, printResult, divider } from "./runner.js";
import { createWorld } from "./helpers.js";
import { Transform, Velocity, Collider, Visible, EnemyTag } from "../../ecs/index.js";

function benchOpts(config, count) {
  let iterations, warmup;
  if (count <= 100) {
    iterations = Math.min(config.iterations, 200);
    warmup = Math.min(config.warmup, 20);
  } else if (count <= 1000) {
    iterations = Math.min(config.iterations, 50);
    warmup = Math.min(config.warmup, 10);
  } else {
    iterations = Math.min(config.iterations, 5);
    warmup = Math.min(config.warmup, 3);
  }
  return { iterations, warmup, entityCount: count };
}

export function run(config) {
  divider("Prefab Benchmark");

  const counts = [100, 1000, 10000].filter(c => c <= (config.maxEntities ?? 100000));
  const baseWorld = createWorld();

  // Create the prefab once
  baseWorld.createPrefab("BenchEnemy")
    .add(Transform, { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 })
    .add(Velocity, { x: 1, y: 1 })
    .add(Collider, { width: 32, height: 32 })
    .add(Visible, { value: 1 })
    .tag(EnemyTag);

  for (const count of counts) {
    const opts = benchOpts(config, count);

    // ── instantiate ──
    divider(`  instantiate — ${count.toLocaleString()}`);
    {
      const world = createWorld();
      // Warm up prefab registration
      world.createPrefab("E")
        .add(Transform, { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 })
        .add(Velocity, { x: 1, y: 1 })
        .add(Collider, { width: 32, height: 32 })
        .add(Visible, { value: 1 })
        .tag(EnemyTag);

      const rInst = benchmark(`    instantiate ${count}`, () => {
        const entities = [];
        for (let i = 0; i < count; i++) {
          entities.push(world.instantiate("E"));
        }
        for (const e of entities) world.destroyEntity(e);
      }, opts);
      printResult(rInst, { entityCount: count });
    }

    // ── instantiate with overrides ──
    divider(`  instantiate with overrides — ${count.toLocaleString()}`);
    {
      const world = createWorld();
      world.createPrefab("E2")
        .add(Transform, { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 })
        .add(Velocity, { x: 1, y: 1 })
        .add(Collider, { width: 32, height: 32 })
        .add(Visible, { value: 1 })
        .tag(EnemyTag);

      const rOverride = benchmark(`    instantiate (20% override)`, () => {
        const entities = [];
        for (let i = 0; i < count; i++) {
          entities.push(world.instantiate("E2", {
            Transform: { x: i * 10, y: i * 20 },
            Velocity: { x: 0.5, y: -0.5 },
          }));
        }
        for (const e of entities) world.destroyEntity(e);
      }, opts);
      printResult(rOverride, { entityCount: count });
    }

    // ── manual equivalent ──
    divider(`  manual creation — ${count.toLocaleString()}`);
    {
      const world = createWorld();
      const rManual = benchmark(`    entity builder ${count}`, () => {
        const entities = [];
        for (let i = 0; i < count; i++) {
          entities.push(world.entity()
            .with(Transform, { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 })
            .with(Velocity, { x: 1, y: 1 })
            .with(Collider, { width: 32, height: 32 })
            .with(Visible, { value: 1 })
            .with(EnemyTag)
            .create());
        }
        for (const e of entities) world.destroyEntity(e);
      }, opts);
      printResult(rManual, { entityCount: count });
    }
  }

  // ── prefab creation cost ──
  divider("  Prefab creation cost");
  {
    const world = createWorld();
    let id = 0;
    const rCreate = benchmark(`    createPrefab (1 component)`, () => {
      world.createPrefab(`T${id++}`).add(Transform, { x: 0, y: 0 });
    }, { iterations: 100, warmup: 20 });
    printResult(rCreate);
  }

  {
    const world = createWorld();
    let id = 0;
    const rCreateMulti = benchmark(`    createPrefab (4 comp + tag)`, () => {
      world.createPrefab(`TM${id++}`)
        .add(Transform, { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 })
        .add(Velocity, { x: 1, y: 1 })
        .add(Collider, { width: 32, height: 32 })
        .add(Visible, { value: 1 })
        .tag(EnemyTag);
    }, { iterations: 100, warmup: 20 });
    printResult(rCreateMulti);
  }

  // ── isolated instantiation overhead ──
  divider("  Isolated instantiation overhead");
  {
    const N = 10000;
    const rPrefab = benchmark(`    prefab instantiate (n=${N})`, () => {
      const world = createWorld();
      world.createPrefab("Single")
        .add(Transform, { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 });
      for (let i = 0; i < N; i++) {
        world.instantiate("Single");
      }
    }, { iterations: 10, warmup: 5 });
    printResult(rPrefab, { entityCount: N });

    const rManual = benchmark(`    manual entity (n=${N})`, () => {
      const world = createWorld();
      for (let i = 0; i < N; i++) {
        world.entity().with(Transform, { x: 0, y: 0 }).create();
      }
    }, { iterations: 10, warmup: 5 });
    printResult(rManual, { entityCount: N });
  }
}
