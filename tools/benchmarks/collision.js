import { benchmark, printResult, divider } from "./runner.js";
import { createSpatialHash, formatThroughput } from "./helpers.js";

function randomEntries(count, seed = 42) {
  let rng = seed;
  function rand() {
    rng = (rng * 16807) % 2147483647;
    return (rng - 1) / 2147483646;
  }

  const entries = [];
  for (let i = 1; i <= count; i++) {
    entries.push({
      id: i,
      cx: rand() * 800 - 400,
      cy: rand() * 600 - 300,
      w: rand() * 32 + 8,
      h: rand() * 32 + 8,
    });
  }
  return entries;
}

function populateHash(hash, entries) {
  for (const e of entries) {
    hash.insert(e.id, e.cx, e.cy, e.w, e.h);
  }
}

export function run(config) {
  divider("Collision Benchmark");

  const counts = [100, 1000, 10000, 100000].filter(c => c <= (config.maxEntities ?? 100000));

  for (const count of counts) {
    const entries = randomEntries(count);

    divider(`  Insertion — ${count.toLocaleString()} entries`);

    const rIns = benchmark(`    Insert ${count}`, () => {
      const hash = createSpatialHash();
      populateHash(hash, entries);
    }, { iterations: Math.min(config.iterations, 500), warmup: config.warmup });
    printResult(rIns, { entityCount: count });

    const hash = createSpatialHash();
    populateHash(hash, entries);

    const queryRect = { left: -50, right: 50, top: -50, bottom: 50 };
    const rQr = benchmark(`    queryRect — ${count.toLocaleString()} entries`, () => {
      hash.queryRect(queryRect);
    }, { iterations: Math.min(config.iterations, 500), warmup: config.warmup });
    printResult(rQr);

    const rQp = benchmark(`    queryPoint — ${count.toLocaleString()} entries`, () => {
      hash.queryPoint({ x: 0, y: 0 });
    }, { iterations: Math.min(config.iterations, 500), warmup: config.warmup });
    printResult(rQp);

    const rQc = benchmark(`    queryCircle — ${count.toLocaleString()} entries`, () => {
      hash.queryCircle(0, 0, 100);
    }, { iterations: Math.min(config.iterations, 500), warmup: config.warmup });
    printResult(rQc);

    const rQa = benchmark(`    queryAABB — ${count.toLocaleString()} entries`, () => {
      hash.queryAABB(0, 0, 100, 100);
    }, { iterations: Math.min(config.iterations, 500), warmup: config.warmup });
    printResult(rQa);

    const rRay = benchmark(`    raycast — ${count.toLocaleString()} entries`, () => {
      hash.raycast(0, 0, 1, 0, 500);
    }, { iterations: Math.min(config.iterations, 500), warmup: config.warmup });
    printResult(rRay);
  }
}
