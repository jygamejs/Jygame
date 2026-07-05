import { TestRunner } from "../lib/TestRunner.js";
import { WASM_BYTES } from "../../../../particles/backends/death_sweep_simd_bytes.js";

export const runner = new TestRunner();

function createWasmInstance() {
  const mod = new WebAssembly.Module(WASM_BYTES);
  const inst = new WebAssembly.Instance(mod);
  const memory = inst.exports.memory;
  return { memory, inst };
}

function initMemory(memory, capacity) {
  const needed = capacity * 12;
  const pagesNeeded = Math.ceil(needed / 65536);
  const currentPages = memory.buffer.byteLength / 65536;
  if (pagesNeeded > currentPages) {
    memory.grow(pagesNeeded - currentPages);
  }
}

function callDeathSweep(inst, memory, capacity, activeCount, lifeArr, activeIdxArr, dt) {
  initMemory(memory, capacity);
  const lifeView = new Float32Array(memory.buffer, 0, capacity);
  const activeView = new Int32Array(memory.buffer, capacity * 4, capacity);
  const deathView = new Int32Array(memory.buffer, capacity * 8, capacity);

  lifeView.set(lifeArr);
  for (let i = 0; i < activeIdxArr.length; i++) {
    activeView[i] = activeIdxArr[i];
  }

  const newCount = inst.exports.deathSweepFull(
    0,
    capacity * 4,
    activeCount,
    dt,
    capacity * 8,
    capacity,
  );

  return {
    newCount,
    lifeAfter: Array.from(lifeView),
    survivors: Array.from({ length: newCount }, (_, i) => activeView[i]),
    deaths: Array.from({ length: activeCount - newCount }, (_, i) => deathView[i]),
  };
}

runner.describe("Death sweep edge cases", () => {
  runner.it("EC1: pre-dead guard", () => {
    const { memory, inst } = createWasmInstance();
    const CAP = 8;
    const life = [1.0, -0.5, 2.0, -0.0, 3.0, -1.0, 4.0, -999.0];
    const active = [0, 1, 2, 3, 4, 5, 6, 7];
    const result = callDeathSweep(inst, memory, CAP, 8, life, active, 0.1);

    const expectedSurvivors = 4;
    runner.assert(result.newCount === expectedSurvivors,
      `Expected ${expectedSurvivors} survivors, got ${result.newCount}`);
    runner.assert(result.lifeAfter[1] === -0.5,
      `Pre-dead slot 1 was mutated: ${result.lifeAfter[1]}`);
    runner.assert(Object.is(result.lifeAfter[3], -0),
      `Pre-dead slot 3 (-0.0) was mutated: ${result.lifeAfter[3]}`);
    runner.assert(result.lifeAfter[5] === -1.0,
      `Pre-dead slot 5 was mutated: ${result.lifeAfter[5]}`);
    runner.assert(result.lifeAfter[7] === -999.0,
      `Pre-dead slot 7 was mutated: ${result.lifeAfter[7]}`);
  });

  runner.it("EC2: NaN detection", () => {
    const { memory, inst } = createWasmInstance();
    const CAP = 8;
    const life = [1.0, NaN, 2.0, NaN, 3.0, Infinity, 4.0, 5.0];
    const active = [0, 1, 2, 3, 4, 5, 6, 7];
    const result = callDeathSweep(inst, memory, CAP, 8, life, active, 0.1);

    const expectedSurvivors = 6;
    runner.assert(result.newCount === expectedSurvivors,
      `Expected ${expectedSurvivors} survivors, got ${result.newCount}`);
    runner.assert(result.deaths.includes(1), `NaN slot 1 not in deaths`);
    runner.assert(result.deaths.includes(3), `NaN slot 3 not in deaths`);
    runner.assert(Number.isNaN(result.lifeAfter[1]), `NaN slot 1 was mutated`);
    runner.assert(Number.isNaN(result.lifeAfter[3]), `NaN slot 3 was mutated`);
  });

  runner.it("EC3: OOB skip", () => {
    const { memory, inst } = createWasmInstance();
    const CAP = 8;
    const life = [1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0];
    const active = [0, 1, 2, 3, 4, 5, 6, 200];
    const result = callDeathSweep(inst, memory, CAP, 8, life, active, 0.1);

    runner.assert(result.newCount === 7, `Expected 7 survivors (OOB slot skipped), got ${result.newCount}`);
    runner.assert(!result.survivors.includes(200), `OOB slot 200 should not be in survivors`);
    runner.assert(result.deaths.length === 1, `Expected 1 death (none from OOB), got ${result.deaths.length}`);
  });

  runner.it("EC4: zero activeCount", () => {
    const { memory, inst } = createWasmInstance();
    const CAP = 8;
    const result = callDeathSweep(inst, memory, CAP, 0, [], [], 0.1);
    runner.assert(result.newCount === 0, `Expected 0 survivors, got ${result.newCount}`);
  });

  runner.it("EC5: dt = 0", () => {
    const { memory, inst } = createWasmInstance();
    const CAP = 8;
    const life = [1.0, 2.0, 3.0, 4.0];
    const active = [0, 1, 2, 3];
    const result = callDeathSweep(inst, memory, CAP, 4, life, active, 0.0);

    runner.assert(result.newCount === 4, `Expected 4 survivors, got ${result.newCount}`);
    runner.assert(result.lifeAfter[0] === 1.0, `life[0] changed from 1.0: ${result.lifeAfter[0]}`);
    runner.assert(result.lifeAfter[1] === 2.0, `life[1] changed from 2.0: ${result.lifeAfter[1]}`);
  });

  runner.it("EC6: Infinity life", () => {
    const { memory, inst } = createWasmInstance();
    const CAP = 8;
    const life = [Infinity, 1.0, Infinity, 2.0];
    const active = [0, 1, 2, 3];
    const result = callDeathSweep(inst, memory, CAP, 4, life, active, 0.5);

    runner.assert(result.newCount === 4, `Expected 4 survivors (Infinity never dies), got ${result.newCount}`);
    runner.assert(result.lifeAfter[0] === Infinity, `Infinite life[0] became finite: ${result.lifeAfter[0]}`);
    runner.assert(result.lifeAfter[2] === Infinity, `Infinite life[2] became finite: ${result.lifeAfter[2]}`);
  });

  runner.it("EC7: life extension (modifier runs before sweep)", () => {
    const { memory, inst } = createWasmInstance();
    const CAP = 8;
    const life = [0.3, 2.0, 0.05, 3.0];
    const active = [0, 1, 2, 3];
    const result = callDeathSweep(inst, memory, CAP, 4, life, active, 0.2);

    runner.assert(result.newCount === 3, `Expected 3 survivors, got ${result.newCount}`);
    runner.assertApprox(result.lifeAfter[0], 0.1, 0.01,
      `life[0] = 0.3-0.2, expected ~0.1, got ${result.lifeAfter[0]}`);
    runner.assert(result.deaths.includes(2), `Slot 2 (0.05-0.2) should be in deaths`);
  });

  runner.it("EC8: mixed batch (all edge cases together)", () => {
    const { memory, inst } = createWasmInstance();
    const CAP = 16;
    const life = [];
    const active = [];
    for (let i = 0; i < CAP; i++) life[i] = 1.0;
    for (let i = 0; i < CAP; i++) active[i] = i;

    life[0] = -0.5;
    life[1] = NaN;
    active[14] = 999;
    life[15] = Infinity;

    const result = callDeathSweep(inst, memory, CAP, 16, life, active, 0.3);

    runner.assert(result.deaths.includes(0), `Pre-dead slot 0 should die`);
    runner.assert(result.deaths.includes(1), `NaN slot 1 should die`);
    runner.assert(result.lifeAfter[0] === -0.5,
      `Pre-dead life[0] was mutated: ${result.lifeAfter[0]}`);
    runner.assert(Number.isNaN(result.lifeAfter[1]),
      `NaN life[1] was mutated: ${result.lifeAfter[1]}`);
    runner.assert(!result.survivors.includes(999),
      `OOB slot 999 should not be in survivors`);
    runner.assert(result.lifeAfter[15] === Infinity,
      `Infinite life[15] became finite: ${result.lifeAfter[15]}`);

    const normalSlots = result.survivors.filter(s =>
      s >= 2 && s < CAP && s !== 15);
    for (const s of normalSlots) {
      runner.assertApprox(result.lifeAfter[s], 0.7, 0.01,
        `life[${s}] should be 1.0-0.3=0.7`);
    }
  });
});
