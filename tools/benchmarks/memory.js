import { benchmark, printResult, divider } from "./runner.js";
import { createWorld, populateEntities } from "./helpers.js";
import { Transform, Velocity, Collider, Visible } from "../../ecs/index.js";

function getHeap() {
  if (typeof process !== "undefined" && process.memoryUsage) {
    return process.memoryUsage().heapUsed;
  }
  return null;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function run(config) {
  divider("Memory Benchmark");

  const counts = [100, 1000, 10000, 100000].filter(c => c <= (config.maxEntities ?? 100000));

  for (const count of counts) {
    const world = createWorld();

    if (typeof global !== "undefined" && global.gc) {
      global.gc();
      global.gc();
    }

    const before = getHeap();
    if (before === null) {
      console.log(`  Skipping memory measurement (no process.memoryUsage)`);
      console.log("");
      return;
    }

    const eids = populateEntities(world, count, [Transform, Velocity, Collider, Visible], {
      randomPositions: true,
      randomVelocities: true,
    });

    const after = getHeap();
    const delta = after - before;

    if (delta < 0) {
      console.log(`  ${count.toLocaleString().padStart(6)} entities with 4 components:`);
      console.log(`    (GC noise — heap decreased by ${formatBytes(-delta)}, try --expose-gc)`);
      console.log("");
    } else {
      console.log(`  ${count.toLocaleString().padStart(6)} entities with 4 components:`);
      console.log(`    Heap before: ${formatBytes(before)}`);
      console.log(`    Heap after:  ${formatBytes(after)}`);
      console.log(`    Delta:       ${formatBytes(delta)}`);
      console.log(`    Per entity:  ${formatBytes(delta / count)}`);
      console.log("");
    }

    for (const eid of eids) world.destroyEntity(eid);
  }
}
