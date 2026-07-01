import { benchmark, printResult, divider } from "./runner.js";
import { createWorld } from "./helpers.js";
import { Transform, Velocity, Collider, Visible } from "../../ecs/index.js";

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
  return { iterations, warmup };
}

export function run(config) {
  divider("World Benchmark");

  const counts = [100, 1000, 10000].filter(c => c <= (config.maxEntities ?? 100000));

  for (const count of counts) {
    const world = createWorld();
    const opts = { ...benchOpts(config, count), entityCount: count };

    divider(`  Entity creation — ${count.toLocaleString()}`);

    let eids = [];
    const rCreate = benchmark(`    createEntity`, () => {
      eids = [];
      for (let i = 0; i < count; i++) {
        eids.push(world.createEntity());
      }
    }, opts);
    printResult(rCreate, { entityCount: count });

    divider(`  Entity destruction — ${count.toLocaleString()}`);

    const rDestroy = benchmark(`    destroyEntity`, () => {
      for (const eid of eids) {
        world.destroyEntity(eid);
      }
    }, opts);
    printResult(rDestroy, { entityCount: count });

    eids = [];
    for (let i = 0; i < count; i++) eids.push(world.createEntity());

    divider(`  addComponent — ${count.toLocaleString()}`);

    const rAdd = benchmark(`    addComponent`, () => {
      for (const eid of eids) {
        world.addComponent(eid, Transform);
        world.addComponent(eid, Velocity);
      }
    }, opts);
    printResult(rAdd, { entityCount: count * 2 });

    for (const eid of eids) world.removeComponent(eid, Velocity);

    divider(`  removeComponent — ${count.toLocaleString()}`);

    const rRemove = benchmark(`    removeComponent`, () => {
      for (const eid of eids) {
        world.removeComponent(eid, Velocity);
      }
    }, opts);
    printResult(rRemove, { entityCount: count });

    for (const eid of eids) {
      world.addComponent(eid, Velocity);
      world.addComponent(eid, Collider);
      world.addComponent(eid, Visible);
    }

    divider(`  getComponent — ${count.toLocaleString()}`);

    const rGet = benchmark(`    getComponent`, () => {
      for (const eid of eids) {
        world.getComponent(eid, Transform);
        world.getComponent(eid, Velocity);
        world.getComponent(eid, Collider);
      }
    }, opts);
    printResult(rGet, { entityCount: count * 3 });

    divider(`  setComponent — ${count.toLocaleString()}`);

    const rSet = benchmark(`    setComponent`, () => {
      for (const eid of eids) {
        world.setComponent(eid, Transform, { x: 1, y: 2 });
        world.setComponent(eid, Velocity, { x: 3, y: 4 });
      }
    }, opts);
    printResult(rSet, { entityCount: count * 2 });

    divider(`  addMany — ${count.toLocaleString()}`);

    const rAddMany = benchmark(`    addMany (2 components)`, () => {
      const fresh = [];
      for (let i = 0; i < count; i++) fresh.push(world.createEntity());
      for (const eid of fresh) {
        world.addMany(eid, Transform, Velocity);
      }
      for (const eid of fresh) world.destroyEntity(eid);
    }, opts);
    printResult(rAddMany, { entityCount: count });

    divider(`  removeMany — ${count.toLocaleString()}`);

    const rRemoveMany = benchmark(`    removeMany (2 components)`, () => {
      const fresh = [];
      for (let i = 0; i < count; i++) {
        const eid = world.createEntity();
        world.addMany(eid, Transform, Velocity, Collider);
        fresh.push(eid);
      }
      for (const eid of fresh) {
        world.removeMany(eid, Transform, Velocity);
      }
      for (const eid of fresh) world.destroyEntity(eid);
    }, opts);
    printResult(rRemoveMany, { entityCount: count });

    divider(`  clone — ${count.toLocaleString()}`);

    const rClone = benchmark(`    clone`, () => {
      for (const eid of eids) {
        world.clone(eid);
      }
    }, opts);
    printResult(rClone, { entityCount: count });

    divider(`  clear — ${count.toLocaleString()}`);

    const rClear = benchmark(`    clear`, () => {
      const fresh = [];
      for (let i = 0; i < count; i++) {
        const eid = world.createEntity();
        world.addMany(eid, Transform, Velocity, Collider, Visible);
        fresh.push(eid);
      }
      for (const eid of fresh) {
        world.clear(eid);
        world.destroyEntity(eid);
      }
    }, opts);
    printResult(rClear, { entityCount: count });

    divider(`  Archetype migration — ${count.toLocaleString()}`);

    const rMigrate = benchmark(`    add+remove cycle (2 components)`, () => {
      for (const eid of eids) {
        world.addComponent(eid, Collider);
        world.removeComponent(eid, Collider);
      }
    }, opts);
    printResult(rMigrate, { entityCount: count * 2 });

    for (const eid of eids) world.destroyEntity(eid);
  }
}
