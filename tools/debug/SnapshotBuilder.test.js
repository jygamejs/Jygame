import { describe, it, before, after } from "node:test";
import * as assert from "node:assert";
import { World } from "../../ecs/core/World.js";
import { Transform } from "../../ecs/components/Transform.js";
import { Velocity } from "../../ecs/components/Velocity.js";
import { SnapshotBuilder } from "../../debug/snapshots/SnapshotBuilder.js";

function createWorld() {
  const world = new World();
  world.register(Transform);
  world.register(Velocity);
  return world;
}

function addEntity(world, x, y, vx, vy) {
  const e = world.createEntity();
  world.add(e, Transform);
  world.set(e, Transform, { x, y, rotation: 0, scaleX: 1, scaleY: 1 });
  if (vx !== undefined) {
    world.add(e, Velocity);
    world.set(e, Velocity, { x: vx, y: vy });
  }
  return e;
}

describe("SnapshotBuilder", () => {
  it("builds an empty snapshot when no worlds registered", () => {
    const builder = new SnapshotBuilder();
    const snap = builder.build(1, 1000, null);
    assert.strictEqual(snap.frameNumber, 1);
    assert.strictEqual(snap.timestamp, 1000);
    assert.strictEqual(snap.diagnostics, null);
    assert.deepStrictEqual(snap.worlds, []);
    builder.release(snap);
  });

  it("captures entities from a registered world", () => {
    const world = createWorld();
    addEntity(world, 10, 20);
    addEntity(world, 30, 40);

    const builder = new SnapshotBuilder();
    builder.registerWorld("main", world);
    const snap = builder.build(1, 1000, null);

    assert.strictEqual(snap.worlds.length, 1);
    assert.strictEqual(snap.worlds[0].worldId, "main");
    assert.strictEqual(snap.worlds[0].entityCount, 2);
    assert.strictEqual(snap.worlds[0].entities.length, 2);

    builder.release(snap);
  });

  it("captures component field values", () => {
    const world = createWorld();
    addEntity(world, 10, 20);

    const builder = new SnapshotBuilder();
    builder.registerWorld("main", world);
    const snap = builder.build(1, 1000, null);

    const entity = snap.worlds[0].entities[0];
    assert.ok(entity.entityId > 0);
    assert.ok(entity.components.length > 0);

    const transform = entity.components.find(c => c.componentName === "Transform");
    assert.ok(transform, "Transform component snapshot should exist");
    assert.strictEqual(transform.fields.x, 10);
    assert.strictEqual(transform.fields.y, 20);
    assert.strictEqual(transform.fields.rotation, 0);
    assert.strictEqual(transform.fields.scaleX, 1);
    assert.strictEqual(transform.fields.scaleY, 1);

    builder.release(snap);
  });

  it("captures entities with multiple components", () => {
    const world = createWorld();
    addEntity(world, 10, 20, 5, -3);

    const builder = new SnapshotBuilder();
    builder.registerWorld("main", world);
    const snap = builder.build(1, 1000, null);

    const entity = snap.worlds[0].entities[0];
    assert.strictEqual(entity.components.length, 2);

    const vel = entity.components.find(c => c.componentName === "Velocity");
    assert.ok(vel, "Velocity component snapshot should exist");
    assert.strictEqual(vel.fields.x, 5);
    assert.strictEqual(vel.fields.y, -3);

    builder.release(snap);
  });

  it("supports multiple worlds", () => {
    const worldA = createWorld();
    addEntity(worldA, 1, 2);

    const worldB = createWorld();
    addEntity(worldB, 3, 4);
    addEntity(worldB, 5, 6);

    const builder = new SnapshotBuilder();
    builder.registerWorld("a", worldA);
    builder.registerWorld("b", worldB);
    const snap = builder.build(1, 1000, null);

    assert.strictEqual(snap.worlds.length, 2);
    const aData = snap.worlds.find(w => w.worldId === "a");
    const bData = snap.worlds.find(w => w.worldId === "b");
    assert.ok(aData);
    assert.ok(bData);
    assert.strictEqual(aData.entityCount, 1);
    assert.strictEqual(bData.entityCount, 2);

    builder.release(snap);
  });

  it("pools are reused across build-release cycles", () => {
    const world = createWorld();
    addEntity(world, 10, 20);
    addEntity(world, 30, 40);

    const builder = new SnapshotBuilder();
    builder.registerWorld("main", world);

    // First cycle
    const snap1 = builder.build(1, 1000, null);
    const stats1 = builder.stats;
    builder.release(snap1);

    // Second cycle — should reuse pooled objects
    const snap2 = builder.build(2, 1016, null);
    const stats2 = builder.stats;

    assert.ok(stats2.entityPool.active > 0);
    assert.ok(stats2.componentPool.active > 0);

    // After release, free pool should have grown
    const snap3 = builder.build(3, 1032, null);
    const stats3 = builder.stats;

    assert.strictEqual(snap3.frameNumber, 3);
    assert.strictEqual(snap3.worlds[0].entityCount, 2);

    builder.release(snap3);
    builder.release(snap2);
  });

  it("unregisterWorld stops capturing a world", () => {
    const world = createWorld();
    addEntity(world, 10, 20);

    const builder = new SnapshotBuilder();
    builder.registerWorld("main", world);
    builder.unregisterWorld("main");

    const snap = builder.build(1, 1000, null);
    assert.strictEqual(snap.worlds.length, 0);
    builder.release(snap);
  });

  it("captures entities with no components (empty archetype)", () => {
    const world = createWorld();
    world.createEntity();
    world.createEntity();

    const builder = new SnapshotBuilder();
    builder.registerWorld("main", world);
    const snap = builder.build(1, 1000, null);

    assert.strictEqual(snap.worlds[0].entityCount, 2);
    for (const entity of snap.worlds[0].entities) {
      assert.strictEqual(entity.components.length, 0);
    }

    builder.release(snap);
  });

  it("captures diagnostics snapshot reference", () => {
    const world = createWorld();
    const builder = new SnapshotBuilder();
    builder.registerWorld("main", world);

    const diagSnap = { frame: 42, fps: 60, frameTime: 16.67 };
    const snap = builder.build(42, 5000, diagSnap);

    assert.strictEqual(snap.diagnostics, diagSnap);
    assert.strictEqual(snap.diagnostics.frame, 42);

    builder.release(snap);
  });

  it("archetypeId is set on each entity snapshot", () => {
    const world = createWorld();
    addEntity(world, 10, 20);

    const builder = new SnapshotBuilder();
    builder.registerWorld("main", world);
    const snap = builder.build(1, 1000, null);

    const entity = snap.worlds[0].entities[0];
    assert.ok(entity.archetypeId > 0, `archetypeId should be positive, got ${entity.archetypeId}`);
    // Entities with only Transform should have a different archetype than those with Transform+Velocity

    builder.release(snap);
  });

  it("stats exposes pool sizes", () => {
    const builder = new SnapshotBuilder();
    const s = builder.stats;
    assert.ok(s.entityPool);
    assert.ok(s.componentPool);
    assert.ok(s.worldSnapshotPool);
    assert.strictEqual(s.entityPool.active, 0);
    assert.strictEqual(s.entityPool.free, 0);
  });
});
