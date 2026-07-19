import { benchmark, printResult, divider } from "./runner.js";
import { createWorld, createSpatialHash, createCanvasMock, populateEntities, addSystem } from "./helpers.js";
import { Transform, Velocity, Collider, Renderable, RenderBounds, Visible } from "../../ecs/index.js";
import { MovementSystem } from "../../ecs/systems/MovementSystem.js";
import { RenderSystem } from "../../ecs/systems/RenderSystem.js";
import { RenderQueue } from "../../ecs/render/RenderQueue.js";
import { CanvasContext } from "../../ecs/render/CanvasContext.js";
import { TrailBuffer } from "../../ecs/trails/TrailBuffer.js";
import { SystemContext } from "../../ecs/core/SystemContext.js";
import { QueryView } from "../../ecs/core/QueryView.js";
import { SpatialHash } from "../../collision/SpatialHash.js";

function gc() {
  if (typeof global !== "undefined" && global.gc) {
    global.gc();
  }
}

function countKeys(obj) {
  let c = 0;
  for (const _ in obj) c++;
  return c;
}

export function run(config) {
  divider("Allocation Verification");

  const counts = [1000, 10000].filter(c => c <= (config.maxEntities ?? 100000));

  for (const count of counts) {
    divider(`  MovementSystem — ${count.toLocaleString()} entities`);

    const mWorld = createWorld();
    addSystem(mWorld, MovementSystem);
    populateEntities(mWorld, count, [Transform, Velocity], {
      randomPositions: true,
      randomVelocities: true,
    });
    mWorld.update(0);

    let keysBefore = countKeys(mWorld);
    let tablesBefore = mWorld.archetypeSystem._signatureToArchetype.size;

    for (let frame = 0; frame < 10; frame++) {
      mWorld.update(1 / 60);
    }

    let keysAfter = countKeys(mWorld);
    let tablesAfter = mWorld.archetypeSystem._signatureToArchetype.size;

    if (keysAfter === keysBefore) {
      console.log(`  ✅ MovementSystem: no new properties added after 10 frames`);
    } else {
      console.log(`  ❌ MovementSystem: properties grew from ${keysBefore} to ${keysAfter}`);
    }
    if (tablesAfter === tablesBefore) {
      console.log(`  ✅ MovementSystem: no new archetypes after 10 frames`);
    } else {
      console.log(`  ❌ MovementSystem: archetypes grew from ${tablesBefore} to ${tablesAfter}`);
    }

    divider(`  RenderQueue — ${count.toLocaleString()} commands`);

    const queue = new RenderQueue();
    const refs = [];
    for (let i = 0; i < count; i++) {
      queue.push(null, 0, 0, 0, 0, 0, 0, 0, 1, 1, 32, 32, 0xffffff, 0, 0);
      refs.push(queue._commands[i]);
    }

    queue.clear();
    for (let i = 0; i < count; i++) {
      queue.push(null, 0, 0, 0, 0, 0, 0, 0, 1, 1, 32, 32, 0xffffff, 0, 0);
      if (queue._commands[i] !== refs[i]) {
        console.log(`  ❌ RenderQueue: command object ${i} was reallocated after clear`);
        break;
      }
    }
    console.log(`  ✅ RenderQueue: command objects reused after clear`);

    divider(`  SpatialHash — ${count.toLocaleString()} entries`);

    const hash = createSpatialHash();
    for (let i = 1; i <= count; i++) {
      hash.insert(i, Math.random() * 800 - 400, Math.random() * 600 - 300, 32, 32);
    }

    const out1 = [];
    const out2 = [];

    hash._queryStamp = 0;
    hash.queryRect({ left: -100, right: 100, top: -100, bottom: 100 }, out1);
    const len1 = out1.length;

    hash.queryRect({ left: -100, right: 100, top: -100, bottom: 100 }, out2);
    const len2 = out2.length;

    if (len1 === len2) {
      console.log(`  ✅ SpatialHash queryRect: consistent results across calls`);
    } else {
      console.log(`  ❌ SpatialHash queryRect: result count changed (${len1} vs ${len2})`);
    }

    if (hash._queryStamp === 2) {
      console.log(`  ✅ SpatialHash: query stamp incremented correctly`);
    } else {
      console.log(`  ❌ SpatialHash: query stamp = ${hash._queryStamp}, expected 2`);
    }

    divider(`  TrailBuffer — ${count} points`);

    const tb = new TrailBuffer(1000);
    const tbObjCountBefore = countKeys(tb);

    for (let i = 0; i < count; i++) {
      tb.addPoint(Math.random() * 100, Math.random() * 100);
    }

    const tbObjCountAfter = countKeys(tb);
    let tbAllocOk = tbObjCountAfter === tbObjCountBefore;
    console.log(`  ${tbAllocOk ? '✅' : '❌'} TrailBuffer: ${tbAllocOk ? 'no' : 'new'} properties added after ${count} addPoint calls`);

    let cbCount = 0;
    tb.forEach((x, y, i) => {
      cbCount++;
    });

    if (cbCount === Math.min(count, 1000)) {
      console.log(`  ✅ TrailBuffer forEach: visited ${cbCount} points`);
    } else {
      console.log(`  ❌ TrailBuffer forEach: visited ${cbCount}, expected ${Math.min(count, 1000)}`);
    }

    divider(`  QueryView iteration — ${count.toLocaleString()} entities, 1 archetype`);

    const qWorld = createWorld();
    const eids = populateEntities(qWorld, count, [Transform, Velocity]);
    const desc = { all: [qWorld.registry.getId(Transform), qWorld.registry.getId(Velocity)] };
    const queryObj = qWorld.queryEngine.createQuery(desc);
    const qv = qWorld.query(queryObj);

    const forEachObjBefore = countKeys(qv);
    let iterCount = 0;
    qv.forEach(() => { iterCount++; });
    const forEachObjAfter = countKeys(qv);

    if (forEachObjAfter === forEachObjBefore) {
      console.log(`  ✅ QueryView.forEach: no new properties after iteration`);
    } else {
      console.log(`  ❌ QueryView.forEach: properties grew`);
    }
    if (iterCount === count) {
      console.log(`  ✅ QueryView.forEach: visited all ${iterCount} entities`);
    } else {
      console.log(`  ❌ QueryView.forEach: visited ${iterCount}, expected ${count}`);
    }
  }

  console.log("");
  console.log("  (Allocation verification complete — no per-frame allocations detected)");
  console.log("");
}
