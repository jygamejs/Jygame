import { describe, it } from "node:test";
import * as assert from "node:assert";
import { ComponentRegistry } from "../../../ecs/core/ComponentRegistry.js";
import { ComponentSignature } from "../../../ecs/core/ComponentSignature.js";
import { EntityManager } from "../../../ecs/core/EntityManager.js";
import { Table } from "../../../ecs/core/Table.js";
import { ArchetypeSystem } from "../../../ecs/core/ArchetypeSystem.js";

function createFixture() {
  const registry = new ComponentRegistry();

  class Transform {
    static schema = { x: "f32", y: "f32" };
  }

  class Velocity {
    static schema = { vx: "f32", vy: "f32" };
  }

  class Health {
    static schema = { hp: "u32", maxHp: "u32" };
  }

  class Tag {}

  class Score {
    static schema = { value: "i32" };
  }

  registry.register(Tag);
  registry.register(Transform);
  registry.register(Velocity);
  registry.register(Health);
  registry.register(Score);

  const entityManager = new EntityManager({ initialCapacity: 64, maxEntities: 10000 });
  const archetypeSystem = new ArchetypeSystem(registry, entityManager);

  return {
    registry,
    entityManager,
    archetypeSystem,
    ids: {
      Tag: registry.getId(Tag),
      Transform: registry.getId(Transform),
      Velocity: registry.getId(Velocity),
      Health: registry.getId(Health),
      Score: registry.getId(Score),
    },
  };
}

function createEntityInEmpty(fixture) {
  const { entityManager, archetypeSystem } = fixture;
  const emptyTable = archetypeSystem.getTable(new ComponentSignature([]));
  const entity = entityManager.create();
  const row = emptyTable.allocate();
  emptyTable.setEntity(row, entity);
  entityManager.setLocation(entity, 1, row);
  return entity;
}

describe("ArchetypeSystem", () => {
  // ─── Constructor ──────────────────────────────────────────

  describe("constructor", () => {
    it("creates the empty archetype at construction", () => {
      const { archetypeSystem } = createFixture();
      assert.strictEqual(archetypeSystem.archetypeCount, 1);
    });

    it("empty archetype has id 1 and empty signature", () => {
      const { archetypeSystem } = createFixture();
      const emptySig = new ComponentSignature([]);
      assert.strictEqual(archetypeSystem.getArchetypeId(emptySig), 1);
      assert.strictEqual(archetypeSystem.has(emptySig), true);
    });

    it("empty archetype has a valid table with zero columns", () => {
      const { archetypeSystem } = createFixture();
      const emptySig = new ComponentSignature([]);
      const table = archetypeSystem.getTable(emptySig);
      assert.ok(table instanceof Table);
      assert.strictEqual(table.count, 0);
    });

    it("throws for invalid registry", () => {
      const em = new EntityManager();
      assert.throws(
        () => new ArchetypeSystem(null, em),
        TypeError
      );
      assert.throws(
        () => new ArchetypeSystem({}, em),
        TypeError
      );
    });

    it("throws for invalid entityManager", () => {
      const reg = new ComponentRegistry();
      assert.throws(
        () => new ArchetypeSystem(reg, null),
        TypeError
      );
      assert.throws(
        () => new ArchetypeSystem(reg, {}),
        TypeError
      );
    });

    it("throws for invalid initialTableCapacity", () => {
      const reg = new ComponentRegistry();
      const em = new EntityManager();
      assert.throws(
        () => new ArchetypeSystem(reg, em, { initialTableCapacity: 0 }),
        RangeError
      );
      assert.throws(
        () => new ArchetypeSystem(reg, em, { initialTableCapacity: -1 }),
        RangeError
      );
      assert.throws(
        () => new ArchetypeSystem(reg, em, { initialTableCapacity: 10.5 }),
        RangeError
      );
    });

    it("accepts custom initialTableCapacity", () => {
      const reg = new ComponentRegistry();
      const em = new EntityManager();
      const system = new ArchetypeSystem(reg, em, { initialTableCapacity: 128 });
      assert.strictEqual(system.archetypeCount, 1);
    });
  });

  // ─── createArchetype ──────────────────────────────────────

  describe("createArchetype", () => {
    it("creates a new archetype with a unique ID", () => {
      const { archetypeSystem } = createFixture();
      const sig = new ComponentSignature([65, 66]);
      const archetype = archetypeSystem.createArchetype(sig);
      assert.strictEqual(archetype.id, 2);
      assert.strictEqual(archetypeSystem.archetypeCount, 2);
    });

    it("creates multiple archetypes with incrementing IDs", () => {
      const { archetypeSystem } = createFixture();
      const a1 = archetypeSystem.createArchetype(new ComponentSignature([65]));
      const a2 = archetypeSystem.createArchetype(new ComponentSignature([66]));
      const a3 = archetypeSystem.createArchetype(new ComponentSignature([67]));
      assert.strictEqual(a1.id, 2);
      assert.strictEqual(a2.id, 3);
      assert.strictEqual(a3.id, 4);
      assert.strictEqual(archetypeSystem.archetypeCount, 4);
    });

    it("returns existing archetype for duplicate signature", () => {
      const { archetypeSystem } = createFixture();
      const sig = new ComponentSignature([65, 66]);
      const a1 = archetypeSystem.createArchetype(sig);
      const a2 = archetypeSystem.createArchetype(sig);
      assert.strictEqual(a1, a2);
      assert.strictEqual(archetypeSystem.archetypeCount, 2);
    });

    it("creates archetype with tag components", () => {
      const { archetypeSystem, ids } = createFixture();
      const sig = new ComponentSignature([ids.Tag]);
      const archetype = archetypeSystem.createArchetype(sig);
      assert.strictEqual(archetype.id, 2);
      assert.ok(archetype.table instanceof Table);
    });

    it("creates archetype with multiple components", () => {
      const { archetypeSystem, ids } = createFixture();
      const sig = new ComponentSignature([ids.Transform, ids.Velocity, ids.Health]);
      const archetype = archetypeSystem.createArchetype(sig);
      assert.strictEqual(archetype.id, 2);
      assert.strictEqual(archetype.table.count, 0);
    });

    it("throws for invalid signature (non-ComponentSignature)", () => {
      const { archetypeSystem } = createFixture();
      assert.throws(
        () => archetypeSystem.createArchetype([65, 66]),
        TypeError
      );
    });

    it("throws for unregistered component ID in signature", () => {
      const { archetypeSystem } = createFixture();
      const sig = new ComponentSignature([999]);
      assert.throws(
        () => archetypeSystem.createArchetype(sig),
        /not registered/i
      );
    });

    it("created archetype stores correct signature reference", () => {
      const { archetypeSystem } = createFixture();
      const sig = new ComponentSignature([65, 66]);
      const archetype = archetypeSystem.createArchetype(sig);
      assert.strictEqual(archetype.signature, sig);
    });
  });

  // ─── getTable ─────────────────────────────────────────────

  describe("getTable", () => {
    it("returns the table for an existing signature", () => {
      const { archetypeSystem } = createFixture();
      const sig = new ComponentSignature([65]);
      const archetype = archetypeSystem.createArchetype(sig);
      const table = archetypeSystem.getTable(sig);
      assert.strictEqual(table, archetype.table);
    });

    it("returns null for an unknown signature", () => {
      const { archetypeSystem } = createFixture();
      const sig = new ComponentSignature([65, 66, 67]);
      assert.strictEqual(archetypeSystem.getTable(sig), null);
    });

    it("returns table for empty signature", () => {
      const { archetypeSystem } = createFixture();
      const emptySig = new ComponentSignature([]);
      const table = archetypeSystem.getTable(emptySig);
      assert.ok(table instanceof Table);
    });

    it("throws for non-ComponentSignature argument", () => {
      const { archetypeSystem } = createFixture();
      assert.throws(() => archetypeSystem.getTable("bad"), TypeError);
      assert.throws(() => archetypeSystem.getTable(null), TypeError);
    });
  });

  // ─── getTableById ─────────────────────────────────────────

  describe("getTableById", () => {
    it("returns the table for a valid archetype ID", () => {
      const { archetypeSystem } = createFixture();
      const sig = new ComponentSignature([65]);
      const archetype = archetypeSystem.createArchetype(sig);
      const table = archetypeSystem.getTableById(archetype.id);
      assert.strictEqual(table, archetype.table);
    });

    it("returns the empty archetype table for ID 1", () => {
      const { archetypeSystem } = createFixture();
      const table = archetypeSystem.getTableById(1);
      assert.ok(table instanceof Table);
      assert.strictEqual(table.count, 0);
    });

    it("returns null for unknown ID", () => {
      const { archetypeSystem } = createFixture();
      assert.strictEqual(archetypeSystem.getTableById(999), null);
    });

    it("returns null for ID 0", () => {
      const { archetypeSystem } = createFixture();
      assert.strictEqual(archetypeSystem.getTableById(0), null);
    });

    it("throws for negative ID", () => {
      const { archetypeSystem } = createFixture();
      assert.throws(() => archetypeSystem.getTableById(-1), RangeError);
    });

    it("throws for non-integer ID", () => {
      const { archetypeSystem } = createFixture();
      assert.throws(() => archetypeSystem.getTableById(1.5), RangeError);
    });
  });

  // ─── getArchetypeId ───────────────────────────────────────

  describe("getArchetypeId", () => {
    it("returns the ID for an existing signature", () => {
      const { archetypeSystem } = createFixture();
      const sig = new ComponentSignature([65, 66]);
      const archetype = archetypeSystem.createArchetype(sig);
      assert.strictEqual(archetypeSystem.getArchetypeId(sig), archetype.id);
    });

    it("returns null for an unknown signature", () => {
      const { archetypeSystem } = createFixture();
      const sig = new ComponentSignature([99, 100]);
      assert.strictEqual(archetypeSystem.getArchetypeId(sig), null);
    });

    it("returns 1 for the empty signature", () => {
      const { archetypeSystem } = createFixture();
      const emptySig = new ComponentSignature([]);
      assert.strictEqual(archetypeSystem.getArchetypeId(emptySig), 1);
    });

    it("throws for non-ComponentSignature argument", () => {
      const { archetypeSystem } = createFixture();
      assert.throws(() => archetypeSystem.getArchetypeId("bad"), TypeError);
    });
  });

  // ─── getSignature ─────────────────────────────────────────

  describe("getSignature", () => {
    it("returns the signature for a valid archetype ID", () => {
      const { archetypeSystem } = createFixture();
      const sig = new ComponentSignature([65, 66]);
      const archetype = archetypeSystem.createArchetype(sig);
      const result = archetypeSystem.getSignature(archetype.id);
      assert.strictEqual(result, sig);
    });

    it("returns the empty signature for ID 1", () => {
      const { archetypeSystem } = createFixture();
      const sig = archetypeSystem.getSignature(1);
      assert.ok(sig instanceof ComponentSignature);
      assert.strictEqual(sig.size, 0);
    });

    it("returns null for unknown ID", () => {
      const { archetypeSystem } = createFixture();
      assert.strictEqual(archetypeSystem.getSignature(999), null);
    });

    it("returns null for ID 0", () => {
      const { archetypeSystem } = createFixture();
      assert.strictEqual(archetypeSystem.getSignature(0), null);
    });

    it("throws for negative ID", () => {
      const { archetypeSystem } = createFixture();
      assert.throws(() => archetypeSystem.getSignature(-1), RangeError);
    });
  });

  // ─── has ──────────────────────────────────────────────────

  describe("has", () => {
    it("returns true for existing signature", () => {
      const { archetypeSystem } = createFixture();
      const sig = new ComponentSignature([65]);
      archetypeSystem.createArchetype(sig);
      assert.strictEqual(archetypeSystem.has(sig), true);
    });

    it("returns true for empty signature", () => {
      const { archetypeSystem } = createFixture();
      const emptySig = new ComponentSignature([]);
      assert.strictEqual(archetypeSystem.has(emptySig), true);
    });

    it("returns false for unknown signature", () => {
      const { archetypeSystem } = createFixture();
      const sig = new ComponentSignature([65, 66, 67]);
      assert.strictEqual(archetypeSystem.has(sig), false);
    });

    it("returns false for signature with different key ordering", () => {
      const { archetypeSystem } = createFixture();
      const sig1 = new ComponentSignature([65, 66]);
      archetypeSystem.createArchetype(sig1);
      const sig2 = new ComponentSignature([65, 67]);
      assert.strictEqual(archetypeSystem.has(sig2), false);
    });

    it("throws for non-ComponentSignature argument", () => {
      const { archetypeSystem } = createFixture();
      assert.throws(() => archetypeSystem.has("bad"), TypeError);
    });
  });

  // ─── entityTable ──────────────────────────────────────────

  describe("entityTable", () => {
    it("returns the correct table for an entity", () => {
      const fixture = createFixture();
      const entity = createEntityInEmpty(fixture);
      const { archetypeSystem, ids } = fixture;

      const sig = new ComponentSignature([ids.Transform]);
      archetypeSystem.moveEntity(entity, sig);

      const table = archetypeSystem.entityTable(entity);
      assert.strictEqual(table, archetypeSystem.getTable(sig));
    });

    it("returns the empty archetype table for entity in empty archetype", () => {
      const fixture = createFixture();
      const entity = createEntityInEmpty(fixture);
      const { archetypeSystem } = fixture;

      const emptyTable = archetypeSystem.getTable(new ComponentSignature([]));
      const table = archetypeSystem.entityTable(entity);
      assert.strictEqual(table, emptyTable);
    });

    it("throws for dead entity", () => {
      const { archetypeSystem, entityManager } = createFixture();
      const entity = entityManager.create();
      entityManager.destroy(entity);
      assert.throws(
        () => archetypeSystem.entityTable(entity),
        /not alive/i
      );
    });

    it("throws for entity 0", () => {
      const { archetypeSystem } = createFixture();
      assert.throws(
        () => archetypeSystem.entityTable(0),
        /not alive/i
      );
    });
  });

  // ─── entitySignature ──────────────────────────────────────

  describe("entitySignature", () => {
    it("returns the correct signature for an entity", () => {
      const fixture = createFixture();
      const entity = createEntityInEmpty(fixture);
      const { archetypeSystem, ids } = fixture;

      const sig = new ComponentSignature([ids.Transform, ids.Velocity]);
      archetypeSystem.moveEntity(entity, sig);

      const result = archetypeSystem.entitySignature(entity);
      assert.strictEqual(result, sig);
    });

    it("returns empty signature for entity in empty archetype", () => {
      const fixture = createFixture();
      const entity = createEntityInEmpty(fixture);
      const { archetypeSystem } = fixture;

      const sig = archetypeSystem.entitySignature(entity);
      assert.ok(sig instanceof ComponentSignature);
      assert.strictEqual(sig.size, 0);
    });

    it("returns null for dead entity", () => {
      const { archetypeSystem, entityManager } = createFixture();
      const entity = entityManager.create();
      entityManager.destroy(entity);
      assert.strictEqual(archetypeSystem.entitySignature(entity), null);
    });

    it("returns null for entity 0", () => {
      const { archetypeSystem } = createFixture();
      assert.strictEqual(archetypeSystem.entitySignature(0), null);
    });
  });

  // ─── moveEntity (core migration) ──────────────────────────

  describe("moveEntity", () => {
    it("moves an entity from empty archetype to a target archetype", () => {
      const fixture = createFixture();
      const entity = createEntityInEmpty(fixture);
      const { archetypeSystem } = fixture;

      const sig = new ComponentSignature([65]);
      const row = archetypeSystem.moveEntity(entity, sig);

      const targetArchetypeId = archetypeSystem.getArchetypeId(sig);
      const loc = fixture.entityManager.getLocation(entity);
      assert.strictEqual(loc.archetype, targetArchetypeId);
      assert.strictEqual(loc.row, row);
    });

    it("moves an entity between two non-empty archetypes", () => {
      const fixture = createFixture();
      const entity = createEntityInEmpty(fixture);
      const { archetypeSystem, entityManager, ids } = fixture;

      const srcSig = new ComponentSignature([ids.Transform, ids.Velocity]);
      archetypeSystem.moveEntity(entity, srcSig);

      const tx = archetypeSystem.entityTable(entity).getColumn(ids.Transform, "x");
      const ty = archetypeSystem.entityTable(entity).getColumn(ids.Transform, "y");
      const vx = archetypeSystem.entityTable(entity).getColumn(ids.Velocity, "vx");
      const srcRow = entityManager.getRow(entity);
      tx[srcRow] = 1.5;
      ty[srcRow] = 2.5;
      vx[srcRow] = 3.5;

      const dstSig = new ComponentSignature([ids.Transform, ids.Health]);
      const dstRow = archetypeSystem.moveEntity(entity, dstSig);

      const loc = entityManager.getLocation(entity);
      const dstArchetypeId = archetypeSystem.getArchetypeId(dstSig);
      assert.strictEqual(loc.archetype, dstArchetypeId);
      assert.strictEqual(loc.row, dstRow);

      const dstTable = archetypeSystem.getTable(dstSig);
      assert.strictEqual(dstTable.getEntity(dstRow), entity);

      assert.strictEqual(dstTable.getColumn(ids.Transform, "x")[dstRow], 1.5);
      assert.strictEqual(dstTable.getColumn(ids.Transform, "y")[dstRow], 2.5);
      assert.strictEqual(dstTable.getColumn(ids.Health, "hp")[dstRow], 0);
      assert.strictEqual(dstTable.getColumn(ids.Health, "maxHp")[dstRow], 0);
    });

    it("initializes new components to zero defaults", () => {
      const fixture = createFixture();
      const entity = createEntityInEmpty(fixture);
      const { archetypeSystem, entityManager, ids } = fixture;

      const dstRow = archetypeSystem.moveEntity(entity, new ComponentSignature([ids.Score]));

      const dstTable = archetypeSystem.getTable(new ComponentSignature([ids.Score]));
      assert.strictEqual(dstTable.getColumn(ids.Score, "value")[dstRow], 0);
    });

    it("removes entity from source table after migration", () => {
      const fixture = createFixture();
      const entity = createEntityInEmpty(fixture);
      const { archetypeSystem, ids } = fixture;

      const srcSig = new ComponentSignature([ids.Transform]);
      archetypeSystem.moveEntity(entity, srcSig);
      const srcTable = archetypeSystem.getTable(srcSig);
      assert.strictEqual(srcTable.count, 1);

      archetypeSystem.moveEntity(entity, new ComponentSignature([ids.Velocity]));
      assert.strictEqual(srcTable.count, 0);
    });

    it("correctly updates moved entity's row after swap-remove", () => {
      const fixture = createFixture();
      const { archetypeSystem, entityManager, ids } = fixture;

      const e1 = createEntityInEmpty(fixture);
      const e2 = createEntityInEmpty(fixture);

      const srcSig = new ComponentSignature([ids.Transform]);
      archetypeSystem.moveEntity(e1, srcSig);
      archetypeSystem.moveEntity(e2, srcSig);

      const e1RowBefore = entityManager.getRow(e1);
      const e2RowBefore = entityManager.getRow(e2);

      archetypeSystem.moveEntity(e1, new ComponentSignature([ids.Velocity]));

      const e2Loc = entityManager.getLocation(e2);
      const srcTable = archetypeSystem.getTable(srcSig);
      assert.strictEqual(srcTable.getEntity(e2Loc.row), e2);
      assert.strictEqual(srcTable.count, 1);
    });

    it("handles tag components (zero-field) migration correctly", () => {
      const fixture = createFixture();
      const entity = createEntityInEmpty(fixture);
      const { archetypeSystem, entityManager, ids } = fixture;

      archetypeSystem.moveEntity(entity, new ComponentSignature([ids.Tag, ids.Transform]));

      const tx = archetypeSystem.entityTable(entity).getColumn(ids.Transform, "x");
      tx[entityManager.getRow(entity)] = 42;

      const trgSig = new ComponentSignature([ids.Tag, ids.Velocity]);
      const dstRow = archetypeSystem.moveEntity(entity, trgSig);

      const dstTable = archetypeSystem.getTable(trgSig);
      assert.strictEqual(dstTable.getEntity(dstRow), entity);
      assert.strictEqual(dstTable.getColumn(ids.Velocity, "vx")[dstRow], 0);
      assert.strictEqual(dstTable.hasComponent(ids.Tag), true);
      assert.strictEqual(dstTable.hasComponent(ids.Transform), false);
    });

    it("moves entity back to empty archetype", () => {
      const fixture = createFixture();
      const entity = createEntityInEmpty(fixture);
      const { archetypeSystem, entityManager, ids } = fixture;

      const srcSig = new ComponentSignature([ids.Transform]);
      archetypeSystem.moveEntity(entity, srcSig);

      const tx = archetypeSystem.getTable(srcSig).getColumn(ids.Transform, "x");
      tx[entityManager.getRow(entity)] = 99;

      const emptySig = new ComponentSignature([]);
      const dstRow = archetypeSystem.moveEntity(entity, emptySig);

      const emptyTable = archetypeSystem.getTable(emptySig);
      const loc = entityManager.getLocation(entity);
      assert.strictEqual(emptyTable.getEntity(dstRow), entity);
      assert.strictEqual(loc.archetype, 1);
      assert.strictEqual(archetypeSystem.getTable(srcSig).count, 0);
    });

    it("supports multiple sequential migrations of the same entity", () => {
      const fixture = createFixture();
      const entity = createEntityInEmpty(fixture);
      const { archetypeSystem, entityManager, ids } = fixture;

      archetypeSystem.moveEntity(entity, new ComponentSignature([ids.Transform]));
      assert.strictEqual(entityManager.getLocation(entity).archetype, 2);

      archetypeSystem.moveEntity(entity, new ComponentSignature([ids.Transform, ids.Velocity]));
      assert.strictEqual(entityManager.getLocation(entity).archetype, 3);

      archetypeSystem.moveEntity(entity, new ComponentSignature([ids.Velocity]));
      assert.strictEqual(entityManager.getLocation(entity).archetype, 4);

      archetypeSystem.moveEntity(entity, new ComponentSignature([]));
      assert.strictEqual(entityManager.getLocation(entity).archetype, 1);
    });

    it("preserves component data through migration chain", () => {
      const fixture = createFixture();
      const entity = createEntityInEmpty(fixture);
      const { archetypeSystem, entityManager, ids } = fixture;

      archetypeSystem.moveEntity(entity, new ComponentSignature([ids.Transform]));
      let tx = archetypeSystem.entityTable(entity).getColumn(ids.Transform, "x");
      tx[entityManager.getRow(entity)] = 7.5;

      archetypeSystem.moveEntity(entity, new ComponentSignature([ids.Transform, ids.Velocity]));
      tx = archetypeSystem.entityTable(entity).getColumn(ids.Transform, "x");
      assert.strictEqual(tx[entityManager.getRow(entity)], 7.5);

      const vx = archetypeSystem.entityTable(entity).getColumn(ids.Velocity, "vx");
      vx[entityManager.getRow(entity)] = 3.0;

      archetypeSystem.moveEntity(entity, new ComponentSignature([ids.Velocity]));
      assert.strictEqual(
        archetypeSystem.entityTable(entity).getColumn(ids.Velocity, "vx")[entityManager.getRow(entity)],
        3.0
      );
    });

    it("moves entity between tables with no shared components", () => {
      const fixture = createFixture();
      const entity = createEntityInEmpty(fixture);
      const { archetypeSystem, ids } = fixture;

      const row = archetypeSystem.moveEntity(entity, new ComponentSignature([ids.Score]));
      const table = archetypeSystem.entityTable(entity);
      assert.strictEqual(table.getColumn(ids.Score, "value")[row], 0);
    });

    it("handles multiple entities in the same archetype", () => {
      const fixture = createFixture();
      const { archetypeSystem, ids } = fixture;

      const e1 = createEntityInEmpty(fixture);
      const e2 = createEntityInEmpty(fixture);

      const sig = new ComponentSignature([ids.Transform]);
      archetypeSystem.moveEntity(e1, sig);
      archetypeSystem.moveEntity(e2, sig);

      assert.strictEqual(archetypeSystem.getTable(sig).count, 2);
    });

    it("throws for dead entity", () => {
      const { archetypeSystem, entityManager } = createFixture();
      const entity = entityManager.create();
      entityManager.destroy(entity);
      assert.throws(
        () => archetypeSystem.moveEntity(entity, new ComponentSignature([])),
        /not alive/i
      );
    });

    it("throws for entity 0", () => {
      const { archetypeSystem } = createFixture();
      assert.throws(
        () => archetypeSystem.moveEntity(0, new ComponentSignature([])),
        /not alive/i
      );
    });

    it("throws for invalid signature", () => {
      const fixture = createFixture();
      const entity = createEntityInEmpty(fixture);
      const { archetypeSystem } = fixture;

      assert.throws(
        () => archetypeSystem.moveEntity(entity, [65]),
        TypeError
      );
    });

    it("throws for unregistered component in destination", () => {
      const fixture = createFixture();
      const entity = createEntityInEmpty(fixture);
      const { archetypeSystem } = fixture;

      const badSig = new ComponentSignature([999]);
      assert.throws(
        () => archetypeSystem.moveEntity(entity, badSig),
        /not registered/i
      );
    });

    it("creates target archetype lazily during migration", () => {
      const fixture = createFixture();
      const entity = createEntityInEmpty(fixture);
      const { archetypeSystem } = fixture;

      const sig = new ComponentSignature([65]);
      assert.strictEqual(archetypeSystem.has(sig), false);

      archetypeSystem.moveEntity(entity, sig);

      assert.strictEqual(archetypeSystem.has(sig), true);
      assert.strictEqual(archetypeSystem.archetypeCount, 2);
    });

    it("reuses existing target archetype when available", () => {
      const fixture = createFixture();
      const { archetypeSystem } = fixture;

      const sig = new ComponentSignature([65]);
      archetypeSystem.createArchetype(sig);

      const e1 = createEntityInEmpty(fixture);
      const e2 = createEntityInEmpty(fixture);

      const countBefore = archetypeSystem.archetypeCount;
      archetypeSystem.moveEntity(e1, sig);
      archetypeSystem.moveEntity(e2, sig);
      const countAfter = archetypeSystem.archetypeCount;

      assert.strictEqual(countBefore, countAfter);
    });
  });

  // ─── Swap-Remove Bookkeeping ──────────────────────────────

  describe("swap-remove bookkeeping", () => {
    it("updates moved entity's row when swap-remove occurs", () => {
      const fixture = createFixture();
      const { archetypeSystem, entityManager, ids } = fixture;

      const e1 = createEntityInEmpty(fixture);
      const e2 = createEntityInEmpty(fixture);
      const e3 = createEntityInEmpty(fixture);

      const srcSig = new ComponentSignature([ids.Transform]);
      archetypeSystem.moveEntity(e1, srcSig);
      archetypeSystem.moveEntity(e2, srcSig);
      archetypeSystem.moveEntity(e3, srcSig);

      const dstSig = new ComponentSignature([ids.Health]);
      archetypeSystem.moveEntity(e1, dstSig);

      const srcTable = archetypeSystem.getTable(srcSig);
      assert.strictEqual(srcTable.count, 2);
      const loc2 = entityManager.getLocation(e2);
      const loc3 = entityManager.getLocation(e3);
      assert.strictEqual(srcTable.getEntity(loc2.row), e2);
      assert.strictEqual(srcTable.getEntity(loc3.row), e3);
    });

    it("does not update moved entity when removing last row", () => {
      const fixture = createFixture();
      const entity = createEntityInEmpty(fixture);
      const { archetypeSystem, entityManager, ids } = fixture;

      const srcSig = new ComponentSignature([ids.Transform]);
      archetypeSystem.moveEntity(entity, srcSig);

      const dstSig = new ComponentSignature([ids.Health]);
      archetypeSystem.moveEntity(entity, dstSig);

      assert.strictEqual(archetypeSystem.getTable(srcSig).count, 0);
      assert.strictEqual(entityManager.isAlive(entity), true);
    });
  });

  // ─── Large Numbers ────────────────────────────────────────

  describe("large numbers of archetypes", () => {
    it("handles many unique archetypes via combination signatures", () => {
      const { archetypeSystem } = createFixture();

      const registered = [65, 66, 67, 68];
      const combos = [];
      for (let i = 1; i < (1 << registered.length); i++) {
        const components = [];
        for (let j = 0; j < registered.length; j++) {
          if (i & (1 << j)) components.push(registered[j]);
        }
        combos.push(components);
      }

      for (const components of combos) {
        const sig = new ComponentSignature(components);
        archetypeSystem.createArchetype(sig);
      }

      assert.strictEqual(archetypeSystem.archetypeCount, combos.length + 1);
    });

    it("each archetype gets a unique ID", () => {
      const { archetypeSystem } = createFixture();

      const ids = [];
      for (let i = 0; i < 15; i++) {
        const components = [];
        for (let j = 0; j < 4; j++) {
          if (i & (1 << j)) components.push(65 + j);
        }
        if (components.length > 0) {
          const sig = new ComponentSignature(components);
          const arch = archetypeSystem.createArchetype(sig);
          ids.push(arch.id);
        }
      }

      const uniqueIds = new Set(ids);
      assert.strictEqual(uniqueIds.size, ids.length);
    });
  });

  // ─── Determinism and Caching ──────────────────────────────

  describe("determinism and caching", () => {
    it("same signature always returns same archetype", () => {
      const { archetypeSystem } = createFixture();

      const sigA = new ComponentSignature([65, 66, 67]);
      const sigB = new ComponentSignature([65, 66, 67]);

      const archA = archetypeSystem.createArchetype(sigA);
      const archB = archetypeSystem.createArchetype(sigB);

      assert.strictEqual(archA, archB);
    });

    it("signatures with different order produce same archetype", () => {
      const { archetypeSystem } = createFixture();

      const sigA = new ComponentSignature([67, 65, 66]);
      const sigB = new ComponentSignature([65, 66, 67]);

      const archA = archetypeSystem.createArchetype(sigA);
      const archB = archetypeSystem.createArchetype(sigB);

      assert.strictEqual(archA, archB);
    });

    it("createArchetype does not duplicate existing archetypes", () => {
      const { archetypeSystem } = createFixture();

      const sig = new ComponentSignature([65]);
      const a1 = archetypeSystem.createArchetype(sig);
      const a2 = archetypeSystem.createArchetype(sig);
      const a3 = archetypeSystem.createArchetype(sig);

      assert.strictEqual(a1, a2);
      assert.strictEqual(a2, a3);
      assert.strictEqual(archetypeSystem.archetypeCount, 2);
    });
  });

  // ─── Edge Cases ───────────────────────────────────────────

  describe("edge cases", () => {
    it("archetypeCount is 1 before any custom archetypes", () => {
      const { archetypeSystem } = createFixture();
      assert.strictEqual(archetypeSystem.archetypeCount, 1);
    });

    it("archetypeCount increments with each new archetype", () => {
      const { archetypeSystem } = createFixture();

      archetypeSystem.createArchetype(new ComponentSignature([65]));
      assert.strictEqual(archetypeSystem.archetypeCount, 2);

      archetypeSystem.createArchetype(new ComponentSignature([66]));
      assert.strictEqual(archetypeSystem.archetypeCount, 3);

      archetypeSystem.createArchetype(new ComponentSignature([65, 66]));
      assert.strictEqual(archetypeSystem.archetypeCount, 4);
    });

    it("getTable returns valid table for empty signature", () => {
      const { archetypeSystem } = createFixture();
      const sig = new ComponentSignature([]);
      const table = archetypeSystem.getTable(sig);
      assert.ok(table instanceof Table);
    });

    it("moveEntity with same source and destination is a no-op", () => {
      const fixture = createFixture();
      const entity = createEntityInEmpty(fixture);
      const { archetypeSystem, entityManager } = fixture;

      const emptySig = new ComponentSignature([]);
      const row = archetypeSystem.moveEntity(entity, emptySig);

      assert.strictEqual(entityManager.getLocation(entity).archetype, 1);
      assert.strictEqual(row, 0);
      assert.strictEqual(archetypeSystem.getTable(emptySig).count, 1);
    });

    it("multiple entities can coexist in the same target archetype", () => {
      const fixture = createFixture();
      const { archetypeSystem, ids } = fixture;

      const entities = [];
      for (let i = 0; i < 10; i++) {
        const e = createEntityInEmpty(fixture);
        entities.push(e);
      }

      const sig = new ComponentSignature([ids.Transform]);
      for (const e of entities) {
        archetypeSystem.moveEntity(e, sig);
      }

      assert.strictEqual(archetypeSystem.getTable(sig).count, 10);
    });
  });

  // ─── Repeated Migrations ──────────────────────────────────

  describe("repeated migrations", () => {
    it("entity can move back and forth between archetypes", () => {
      const fixture = createFixture();
      const entity = createEntityInEmpty(fixture);
      const { archetypeSystem, entityManager, ids } = fixture;

      const sigA = new ComponentSignature([ids.Transform]);
      const sigB = new ComponentSignature([]);

      for (let i = 0; i < 5; i++) {
        archetypeSystem.moveEntity(entity, sigA);
        assert.strictEqual(
          entityManager.getLocation(entity).archetype,
          archetypeSystem.getArchetypeId(sigA)
        );

        archetypeSystem.moveEntity(entity, sigB);
        assert.strictEqual(
          entityManager.getLocation(entity).archetype,
          archetypeSystem.getArchetypeId(sigB)
        );
      }
    });

    it("data persists across repeated migrations with shared components", () => {
      const fixture = createFixture();
      const entity = createEntityInEmpty(fixture);
      const { archetypeSystem, entityManager, ids } = fixture;

      archetypeSystem.moveEntity(entity, new ComponentSignature([ids.Transform]));

      const tx = archetypeSystem.entityTable(entity).getColumn(ids.Transform, "x");
      tx[entityManager.getRow(entity)] = 42;

      for (let i = 0; i < 3; i++) {
        archetypeSystem.moveEntity(entity, new ComponentSignature([ids.Transform, ids.Velocity]));
        archetypeSystem.moveEntity(entity, new ComponentSignature([ids.Transform]));
      }

      assert.strictEqual(
        archetypeSystem.entityTable(entity).getColumn(ids.Transform, "x")[entityManager.getRow(entity)],
        42
      );
    });
  });

  // ─── Multiple Archetypes ──────────────────────────────────

  describe("multiple archetypes", () => {
    it("tables are independent across archetypes", () => {
      const fixture = createFixture();
      const { archetypeSystem, ids } = fixture;

      const e1 = createEntityInEmpty(fixture);
      const e2 = createEntityInEmpty(fixture);

      archetypeSystem.moveEntity(e1, new ComponentSignature([ids.Transform]));
      archetypeSystem.moveEntity(e2, new ComponentSignature([ids.Velocity]));

      const transformTable = archetypeSystem.entityTable(e1);
      const velocityTable = archetypeSystem.entityTable(e2);

      assert.notStrictEqual(transformTable, velocityTable);
      assert.strictEqual(transformTable.count, 1);
      assert.strictEqual(velocityTable.count, 1);
    });
  });
});
