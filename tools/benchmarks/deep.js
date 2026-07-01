import { benchmark, printResult, divider } from "./runner.js";
import { createWorld } from "./helpers.js";
import { Transform, Velocity, Collider, Visible } from "../../ecs/index.js";
import { ComponentSignature } from "../../ecs/core/ComponentSignature.js";

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
  divider("Deep Micro-Benchmarks");

  const counts = [100, 1000, 10000].filter(c => c <= (config.maxEntities ?? 100000));

  // ── 1. Archetype migration costs (raw moveEntity) ──
  divider("1. Archetype Migration Cost (raw moveEntity)");

  for (const count of counts) {
    const opts = benchOpts(config, count);
    divider(`  Migration: empty → [T] — ${count.toLocaleString()}`);

    // Pool approach: fresh entities per iteration to avoid no-op on subsequent iterations
    const totalNeeded = count * (opts.warmup + opts.iterations + 1);
    const world = createWorld();
    const pool = [];
    for (let i = 0; i < totalNeeded; i++) pool.push(world.createEntity());
    const pre = world._resolveComponentId(Transform, "bench");
    const sigT = new ComponentSignature([pre]);

    let offset = 0;
    const rMoveT = benchmark("    moveEntity empty→[T]", () => {
      const batch = pool.slice(offset, offset + count);
      offset += count;
      for (const eid of batch) world.archetypeSystem.moveEntity(eid, sigT);
    }, opts);
    printResult(rMoveT, { entityCount: count });

    // Now move [T] → [T,V] — need fresh entities already in [T]
    const world2 = createWorld();
    const pool2 = [];
    const preV = world2._resolveComponentId(Velocity, "bench");
    const sigTV = new ComponentSignature([pre, preV]);
    for (let i = 0; i < totalNeeded; i++) {
      const eid = world2.createEntity();
      world2.archetypeSystem.moveEntity(eid, sigT);
      pool2.push(eid);
    }

    divider(`  Migration: [T] → [T,V] — ${count.toLocaleString()}`);

    offset = 0;
    const rMoveTV = benchmark("    moveEntity [T]→[T,V]", () => {
      const batch = pool2.slice(offset, offset + count);
      offset += count;
      for (const eid of batch) world2.archetypeSystem.moveEntity(eid, sigTV);
    }, opts);
    printResult(rMoveTV, { entityCount: count });

    // Now move [T,V] → [T,V,C,Vis]
    const world3 = createWorld();
    const pool3 = [];
    const preC = world3._resolveComponentId(Collider, "bench");
    const preVis = world3._resolveComponentId(Visible, "bench");
    const sigTVCVis = new ComponentSignature([pre, preV, preC, preVis]);
    for (let i = 0; i < totalNeeded; i++) {
      const eid = world3.createEntity();
      world3.archetypeSystem.moveEntity(eid, sigT);
      world3.archetypeSystem.moveEntity(eid, sigTV);
      pool3.push(eid);
    }

    divider(`  Migration: [T,V] → [T,V,C,Vis] — ${count.toLocaleString()}`);

    offset = 0;
    const rMoveTVCVis = benchmark("    moveEntity [T,V]→[T,V,C,Vis]", () => {
      const batch = pool3.slice(offset, offset + count);
      offset += count;
      for (const eid of batch) world3.archetypeSystem.moveEntity(eid, sigTVCVis);
    }, opts);
    printResult(rMoveTVCVis, { entityCount: count });
  }

  // ── 2. addMany: breakdown ──
  divider("2. addMany Breakdown");
  countLoop(config, (count, opts) => {
    const iters = opts.warmup + opts.iterations + 1;

    // Separate pool for individual addComponent benchmark
    const wIndiv = createWorld();
    const poolIndiv = [];
    for (let i = 0; i < count * iters; i++) poolIndiv.push(wIndiv.createEntity());
    let offset = 0;
    const rIndiv1 = benchmark("    addComponent × 2 (individual)", () => {
      const batch = poolIndiv.slice(offset, offset + count);
      offset += count;
      for (const eid of batch) wIndiv.addComponent(eid, Transform);
      for (const eid of batch) wIndiv.addComponent(eid, Velocity);
    }, opts);
    printResult(rIndiv1, { entityCount: count * 2 });
    for (const eid of poolIndiv) wIndiv.destroyEntity(eid);

    // Separate pool for addMany benchmark
    const wMany = createWorld();
    const poolMany = [];
    for (let i = 0; i < count * iters; i++) poolMany.push(wMany.createEntity());
    offset = 0;
    const rMany = benchmark("    addMany (2 components)", () => {
      const batch = poolMany.slice(offset, offset + count);
      offset += count;
      for (const eid of batch) wMany.addMany(eid, Transform, Velocity);
    }, opts);
    printResult(rMany, { entityCount: count * 2 });
    for (const eid of poolMany) wMany.destroyEntity(eid);
  });

  // ── 3. removeMany: breakdown ──
  divider("3. removeMany Breakdown");
  countLoop(config, (count, opts) => {
    const iters = opts.warmup + opts.iterations + 1;

    // Separate pool for individual removeComponent benchmark
    const wRemIndiv = createWorld();
    const poolRemIndiv = [];
    for (let i = 0; i < count * iters; i++) {
      const eid = wRemIndiv.createEntity();
      wRemIndiv.addMany(eid, Transform, Velocity, Collider, Visible);
      poolRemIndiv.push(eid);
    }
    let offset = 0;
    const rRemIndiv = benchmark("    removeComponent × 2 (individual)", () => {
      const batch = poolRemIndiv.slice(offset, offset + count);
      offset += count;
      for (const eid of batch) wRemIndiv.removeComponent(eid, Velocity);
      for (const eid of batch) wRemIndiv.removeComponent(eid, Collider);
    }, opts);
    printResult(rRemIndiv, { entityCount: count * 2 });
    for (const eid of poolRemIndiv) wRemIndiv.destroyEntity(eid);

    // Separate pool for removeMany benchmark
    const wRemMany = createWorld();
    const poolRemMany = [];
    for (let i = 0; i < count * iters; i++) {
      const eid = wRemMany.createEntity();
      wRemMany.addMany(eid, Transform, Velocity, Collider, Visible);
      poolRemMany.push(eid);
    }
    offset = 0;
    const rRemMany = benchmark("    removeMany (2 components)", () => {
      const batch = poolRemMany.slice(offset, offset + count);
      offset += count;
      for (const eid of batch) wRemMany.removeMany(eid, Velocity, Collider);
    }, opts);
    printResult(rRemMany, { entityCount: count * 2 });
    for (const eid of poolRemMany) wRemMany.destroyEntity(eid);
  });

  // ── 4. clone: breakdown ──
  divider("4. Clone Breakdown");
  for (const count of counts) {
    const opts = benchOpts(config, count);
    const componentsList = [
      { label: "empty", comps: [] },
      { label: "1 component [T]", comps: [Transform] },
      { label: "2 components [T,V]", comps: [Transform, Velocity] },
      { label: "4 components [T,V,C,Vis]", comps: [Transform, Velocity, Collider, Visible] },
    ];

    for (const { label, comps } of componentsList) {
      divider(`    clone — ${label} × ${count.toLocaleString()}`);

      const total = count * (opts.warmup + opts.iterations + 1);
      const world = createWorld();
      const pool = [];
      for (let i = 0; i < total; i++) {
        const eid = world.createEntity();
        if (comps.length > 0) world.addMany(eid, ...comps);
        pool.push(eid);
      }

      let offset = 0;
      const rClone = benchmark(`      clone (total)`, () => {
        const batch = pool.slice(offset, offset + count);
        offset += count;
        const clones = [];
        for (const eid of batch) clones.push(world.clone(eid));
        for (const c of clones) world.destroyEntity(c);
      }, opts);
      printResult(rClone, { entityCount: count });

      offset = 0;
      const rCreate = benchmark(`      createEntity only`, () => {
        const batch = pool.slice(offset, offset + count);
        offset += count;
        const fresh = [];
        for (const eid of batch) fresh.push(eid);
      }, opts);
      printResult(rCreate, { entityCount: count });

      for (const eid of pool) world.destroyEntity(eid);
    }
  }

  // ── 5. clear: breakdown ──
  divider("5. Clear Breakdown");
  for (const count of counts) {
    const opts = benchOpts(config, count);
    const componentSets = [
      { label: "1 component [T]", comps: [Transform] },
      { label: "4 components [T,V,C,Vis]", comps: [Transform, Velocity, Collider, Visible] },
    ];

    for (const { label, comps } of componentSets) {
      divider(`    clear — ${label} × ${count.toLocaleString()}`);

      const total = count * (opts.warmup + opts.iterations + 1);
      const world = createWorld();
      const pool = [];
      for (let i = 0; i < total; i++) {
        const eid = world.createEntity();
        world.addMany(eid, ...comps);
        pool.push(eid);
      }

      let offset = 0;
      const rClear = benchmark(`      clear (total)`, () => {
        const batch = pool.slice(offset, offset + count);
        offset += count;
        for (const eid of batch) world.clear(eid);
        for (const eid of batch) world.destroyEntity(eid);
      }, opts);
      printResult(rClear, { entityCount: count });

      for (const eid of pool) world.destroyEntity(eid);
    }
  }

  // ── 6. Scale breakdown: addMany across entity counts ──
  divider("6. addMany: Per-Component Cost Scaling");

  const scaleCounts = [10, 100, 1000];
  for (const count of scaleCounts) {
    const opts = { iterations: 30, warmup: 5 };
    const total = count * (opts.warmup + opts.iterations + 1);
    const world = createWorld();
    const pool = [];
    for (let i = 0; i < total; i++) pool.push(world.createEntity());

    let offset = 0;
    const rAddMany = benchmark(`    addMany 2comp at ${count}`, () => {
      const batch = pool.slice(offset, offset + count);
      offset += count;
      for (const eid of batch) world.addMany(eid, Transform, Velocity);
      for (const eid of batch) world.destroyEntity(eid);
    }, opts);

    printResult(rAddMany, { entityCount: count * 2 });

    for (const eid of pool) world.destroyEntity(eid);
  }

  // ── 7. Internal step costs (isolated, single entity) ──
  divider("7. Internal Step Costs (1000 entities, isolated)");

  const microOpts = { iterations: 100, warmup: 20 };
  const N = 1000;

  {
    const worldM = createWorld();
    const tId = worldM._resolveComponentId(Transform, "bench");
    const sigT = new ComponentSignature([tId]);
    const sigTV = new ComponentSignature([tId, worldM._resolveComponentId(Velocity, "bench")]);

    const total = N * (microOpts.warmup + microOpts.iterations + 1);
    const pool = [];
    for (let i = 0; i < total; i++) {
      const eid = worldM.createEntity();
      worldM.addComponent(eid, Transform);
      pool.push(eid);
    }

    let offset = 0;
    const rResolve = benchmark("    _resolveComponentId (pure)", () => {
      for (let i = 0; i < N; i++) worldM._resolveComponentId(Transform, "bench");
    }, microOpts);
    printResult(rResolve, { entityCount: N });

    offset = 0;
    const rSigLookup = benchmark("    entitySignature (lookup)", () => {
      const batch = pool.slice(offset, offset + N);
      offset += N;
      for (const eid of batch) worldM.archetypeSystem.entitySignature(eid);
    }, microOpts);
    printResult(rSigLookup, { entityCount: N });

    offset = 0;
    const rArchExisting = benchmark("    createArchetype (existing)", () => {
      for (let i = 0; i < N; i++) worldM.archetypeSystem.createArchetype(sigT);
    }, microOpts);
    printResult(rArchExisting);

    offset = 0;
    const rArchNew = benchmark("    createArchetype (new, sigTV)", () => {
      for (let i = 0; i < N; i++) worldM.archetypeSystem.createArchetype(sigTV);
    }, microOpts);
    printResult(rArchNew);

    for (const eid of pool) worldM.destroyEntity(eid);
  }

  {
    const worldM = createWorld();
    const total = N * (microOpts.warmup + microOpts.iterations + 1);
    const pool = [];
    for (let i = 0; i < total; i++) pool.push(worldM.createEntity());

    let offset = 0;
    const rLifecycle = benchmark("    createEntity + addComponent(Transform)", () => {
      const batch = pool.slice(offset, offset + N);
      offset += N;
      for (const eid of batch) worldM.addComponent(eid, Transform);
    }, microOpts);
    printResult(rLifecycle, { entityCount: N });

    offset = 0;
    const rAddOnExisting = benchmark("    addComponent on existing entity", () => {
      const batch = pool.slice(offset, offset + N);
      offset += N;
      for (const eid of batch) worldM.addComponent(eid, Transform);
    }, microOpts);
    printResult(rAddOnExisting, { entityCount: N });

    for (const eid of pool) worldM.destroyEntity(eid);
  }

  // ── 8. Entity lifecycle: full path ──
  divider("8. Full Entity Lifecycle (per entity)");
  {
    const w2 = createWorld();
    const w4 = createWorld();
    const microOpts2 = { iterations: 20, warmup: 5 };
    const n = 10000;

    // create+addMany+destroy per entity enclosed in each iteration
    const rLC2 = benchmark("    create + addMany(2) + destroy per entity", () => {
      for (let i = 0; i < n; i++) {
        const eid = w2.createEntity();
        w2.addMany(eid, Transform, Velocity);
        w2.destroyEntity(eid);
      }
    }, microOpts2);
    printResult(rLC2, { entityCount: n });

    const rLC4 = benchmark("    create + addMany(4) + destroy per entity", () => {
      for (let i = 0; i < n; i++) {
        const eid = w4.createEntity();
        w4.addMany(eid, Transform, Velocity, Collider, Visible);
        w4.destroyEntity(eid);
      }
    }, microOpts2);
    printResult(rLC4, { entityCount: n });
  }
}

function countLoop(config, fn) {
  for (const c of [100, 1000, 10000].filter(x => x <= (config.maxEntities ?? 100000))) {
    const opts = benchOpts(config, c);
    divider(`  count = ${c.toLocaleString()}`);
    fn(c, opts);
  }
}
