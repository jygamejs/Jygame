import { benchmark, printResult, divider } from "./runner.js";
import { createWorld } from "./helpers.js";
import { Transform, Collider, Visible } from "../../ecs/index.js";
import { CollisionSystem } from "../../ecs/systems/CollisionSystem.js";
import { SpatialHash } from "../../collision/SpatialHash.js";

export function run(config) {
  divider("Spatial Density Benchmark");

  const counts = [100, 1000, 10000, 100000].filter(c => c <= (config.maxEntities ?? 100000));

  for (const count of counts) {
    const opts = benchOpts(config, count);

    for (const density of ["sparse", "medium", "dense"]) {
      const totalNeeded = count * (opts.warmup + opts.iterations + 1);
      const entries = buildEntries(totalNeeded, density);

      divider(`  ${density} — ${count.toLocaleString()} entries`);

      const ecOpts = { ...opts, entityCount: count };

      let offset = 0;
      const rInsert = benchmark(`    insert (${density})`, () => {
        const hash = new SpatialHash();
        const batch = entries.slice(offset, offset + count);
        offset += count;
        for (const e of batch) hash.insert(e.id, e.cx, e.cy, e.w, e.h);
      }, ecOpts);
      printResult(rInsert, { entityCount: count });

      offset = 0;
      const rQuery = benchmark(`    queryRect (${density})`, () => {
        const hash = new SpatialHash();
        const batch = entries.slice(offset, offset + count);
        offset += count;
        for (const e of batch) hash.insert(e.id, e.cx, e.cy, e.w, e.h);
        const out = [];
        for (let i = 0; i < 100; i++) hash.queryRect({ left: -50, right: 50, top: -50, bottom: 50 }, out);
      }, ecOpts);
      printResult(rQuery, { entityCount: count });

      offset = 0;
      const rPairs = benchmark(`    collision pairs (${density})`, () => {
        const world = createWorld();
        const hash = new SpatialHash();
        world.setResource(SpatialHash, hash);
        const collision = new CollisionSystem();
        world.addSystem(collision);
        const batch = entries.slice(offset, offset + count);
        offset += count;
        for (const e of batch) {
          const eid = world.createEntity();
          world.addMany(eid, Transform, Collider, Visible);
          world.setComponent(eid, Transform, { x: e.cx, y: e.cy });
          world.setComponent(eid, Collider, { width: e.w, height: e.h });
          world.setComponent(eid, Visible, { value: 1 });
        }
        collision._ctx._refresh(1 / 60);
        collision.update(collision._ctx, 1 / 60);
      }, ecOpts);
      printResult(rPairs, { entityCount: count });
    }
  }
}

function buildEntries(count, density) {
  const rng = makeRng(42);
  const entries = [];
  let spread, sizeRange;
  switch (density) {
    case "sparse": spread = 10000; sizeRange = 16; break;
    case "medium": spread = 1000; sizeRange = 32; break;
    case "dense": spread = 100; sizeRange = 48; break;
    default: spread = 1000; sizeRange = 32;
  }
  for (let i = 0; i < count; i++) {
    entries.push({
      id: i + 1,
      cx: rng() * spread - spread / 2,
      cy: rng() * spread - spread / 2,
      w: rng() * sizeRange + 8,
      h: rng() * sizeRange + 8,
    });
  }
  return entries;
}

function makeRng(seed) {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}

function benchOpts(config, count) {
  let iterations, warmup;
  if (count <= 100) { iterations = Math.min(config.iterations, 200); warmup = Math.min(config.warmup, 20); }
  else if (count <= 1000) { iterations = Math.min(config.iterations, 50); warmup = Math.min(config.warmup, 10); }
  else if (count <= 10000) { iterations = Math.min(config.iterations, 20); warmup = Math.min(config.warmup, 5); }
  else { iterations = Math.min(config.iterations, 5); warmup = Math.min(config.warmup, 3); }
  return { iterations, warmup };
}
