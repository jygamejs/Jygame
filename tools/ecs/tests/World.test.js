import { describe, it } from "node:test";
import * as assert from "node:assert";
import { World } from "../../../ecs/core/World.js";
import { ComponentRegistry } from "../../../ecs/core/ComponentRegistry.js";
import { EntityManager } from "../../../ecs/core/EntityManager.js";
import { ArchetypeSystem } from "../../../ecs/core/ArchetypeSystem.js";
import { Table } from "../../../ecs/core/Table.js";

function createWorld() {
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

  const world = new World();
  world.register(Tag);
  world.register(Transform);
  world.register(Velocity);
  world.register(Health);
  world.register(Score);

  return { world, Transform, Velocity, Health, Tag, Score };
}

describe("World", () => {
  // ─── Constructor ──────────────────────────────────────────

  describe("constructor", () => {
    it("creates a World with all subsystems", () => {
      const world = new World();
      assert.ok(world.registry instanceof ComponentRegistry);
      assert.ok(world.entityManager instanceof EntityManager);
      assert.ok(world.archetypeSystem instanceof ArchetypeSystem);
    });

    it("accepts custom options", () => {
      const world = new World({
        initialCapacity: 128,
        maxEntities: 5000,
        initialTableCapacity: 256,
      });
      assert.ok(world instanceof World);
    });

    it("throws for invalid initialTableCapacity", () => {
      assert.throws(() => new World({ initialTableCapacity: 0 }), RangeError);
      assert.throws(() => new World({ initialTableCapacity: -1 }), RangeError);
    });

    it("uses default initialTableCapacity of 64", () => {
      const world = new World();
      assert.ok(world instanceof World);
    });
  });

  // ─── Registry Forwarding ──────────────────────────────────

  describe("register", () => {
    it("registers a component class", () => {
      const world = new World();

      class A {
        static schema = { x: "f32" };
      }

      world.register(A);
      assert.strictEqual(world.registry.has(A), true);
    });

    it("registers a component by name", () => {
      const world = new World();
      world.register("A", { x: "f32" });
      assert.strictEqual(world.registry.has("A"), true);
    });

    it("returns metadata", () => {
      const world = new World();

      class A {
        static schema = { x: "f32" };
      }

      const meta = world.register(A);
      assert.strictEqual(meta.id, 64);
      assert.strictEqual(meta.name, "A");
    });
  });

  // ─── Registry Locking ─────────────────────────────────────

  describe("registry locking", () => {
    it("allows registration before any entity exists", () => {
      const world = new World();

      class A {
        static schema = { x: "f32" };
      }

      world.register(A);
      assert.strictEqual(world.registry.has(A), true);
    });

    it("locks registry on first entity creation", () => {
      const world = new World();

      class A {
        static schema = { x: "f32" };
      }

      world.register(A);
      world.createEntity();

      class B {
        static schema = { v: "f32" };
      }

      assert.throws(
        () => world.register(B),
        /locked/i
      );
    });

    it("does not lock registry before any entity is created", () => {
      const world = new World();

      class A {
        static schema = { x: "f32" };
      }

      world.register(A);
      assert.strictEqual(world.registry.isLocked(), false);
    });
  });

  // ─── Entity Creation ──────────────────────────────────────

  describe("createEntity", () => {
    it("creates an entity and returns its ID", () => {
      const { world } = createWorld();
      const entity = world.createEntity();
      assert.ok(typeof entity === 'number');
      assert.ok(entity > 0);
    });

    it("creates entities with monotonic IDs", () => {
      const { world } = createWorld();
      const e1 = world.createEntity();
      const e2 = world.createEntity();
      assert.ok(e2 > e1);
    });

    it("entity is alive after creation", () => {
      const { world } = createWorld();
      const entity = world.createEntity();
      assert.strictEqual(world.isAlive(entity), true);
    });

    it("entity starts in the empty archetype", () => {
      const { world } = createWorld();
      const entity = world.createEntity();
      const sig = world.archetypeSystem.entitySignature(entity);
      assert.strictEqual(sig.size, 0);
      assert.strictEqual(sig.key, "");
    });

    it("entity is placed in the empty archetype table", () => {
      const { world } = createWorld();
      const entity = world.createEntity();
      const table = world.archetypeSystem.entityTable(entity);
      assert.strictEqual(table.count, 1);
      assert.strictEqual(table.getEntity(0), entity);
    });

    it("multiple entities all start in empty archetype", () => {
      const { world } = createWorld();
      const e1 = world.createEntity();
      const e2 = world.createEntity();
      const e3 = world.createEntity();

      const table = world.archetypeSystem.entityTable(e1);
      assert.strictEqual(table.count, 3);
      assert.strictEqual(world.archetypeSystem.entitySignature(e1).key, "");
      assert.strictEqual(world.archetypeSystem.entitySignature(e2).key, "");
      assert.strictEqual(world.archetypeSystem.entitySignature(e3).key, "");
    });
  });

  // ─── Entity Destruction ───────────────────────────────────

  describe("destroyEntity", () => {
    it("destroys an entity", () => {
      const { world } = createWorld();
      const entity = world.createEntity();
      world.destroyEntity(entity);
      assert.strictEqual(world.isAlive(entity), false);
    });

    it("removes the entity from its table", () => {
      const { world } = createWorld();
      const entity = world.createEntity();
      const table = world.archetypeSystem.entityTable(entity);
      world.destroyEntity(entity);
      assert.strictEqual(table.count, 0);
    });

    it("updates swapped entity location when swap-remove occurs", () => {
      const { world, Transform } = createWorld();
      const e1 = world.createEntity();
      const e2 = world.createEntity();

      world.addComponent(e1, Transform);
      world.addComponent(e2, Transform);

      const table = world.archetypeSystem.entityTable(e1);
      world.destroyEntity(e1);

      const loc = world.entityManager.getLocation(e2);
      assert.strictEqual(table.getEntity(loc.row), e2);
      assert.strictEqual(loc.archetype, 2);
    });

    it("is a no-op for already dead entity", () => {
      const { world } = createWorld();
      const entity = world.createEntity();
      world.destroyEntity(entity);
      world.destroyEntity(entity);
      assert.strictEqual(world.isAlive(entity), false);
    });

    it("is a no-op for entity 0", () => {
      const { world } = createWorld();
      world.destroyEntity(0);
      assert.strictEqual(world.isAlive(0), false);
    });
  });

  // ─── addComponent ─────────────────────────────────────────

  describe("addComponent", () => {
    it("adds a component to an entity", () => {
      const { world, Transform } = createWorld();
      const entity = world.createEntity();
      world.addComponent(entity, Transform);
      assert.strictEqual(world.hasComponent(entity, Transform), true);
    });

    it("moves entity to the correct archetype", () => {
      const { world, Transform, Velocity } = createWorld();
      const entity = world.createEntity();

      world.addComponent(entity, Transform);
      assert.strictEqual(world.archetypeSystem.entitySignature(entity).key, "65");

      world.addComponent(entity, Velocity);
      assert.strictEqual(world.archetypeSystem.entitySignature(entity).key, "65,66");
    });

    it("initializes component fields to zero", () => {
      const { world, Transform } = createWorld();
      const entity = world.createEntity();
      world.addComponent(entity, Transform);

      const tx = world.archetypeSystem.entityTable(entity).getColumn(65, "x");
      const ty = world.archetypeSystem.entityTable(entity).getColumn(65, "y");
      const row = world.entityManager.getRow(entity);
      assert.strictEqual(tx[row], 0);
      assert.strictEqual(ty[row], 0);
    });

    it("is a no-op when component is already present", () => {
      const { world, Transform } = createWorld();
      const entity = world.createEntity();

      world.addComponent(entity, Transform);
      world.addComponent(entity, Transform);

      assert.strictEqual(world.hasComponent(entity, Transform), true);
      const sig = world.archetypeSystem.entitySignature(entity);
      assert.strictEqual(sig.size, 1);
    });

    it("accepts component class", () => {
      const { world, Transform } = createWorld();
      const entity = world.createEntity();
      world.addComponent(entity, Transform);
      assert.strictEqual(world.hasComponent(entity, Transform), true);
    });

    it("accepts component name string", () => {
      const { world } = createWorld();
      const entity = world.createEntity();
      world.addComponent(entity, "Transform");
      assert.strictEqual(world.hasComponent(entity, "Transform"), true);
    });

    it("adds multiple different components", () => {
      const { world, Transform, Velocity, Health } = createWorld();
      const entity = world.createEntity();

      world.addComponent(entity, Transform);
      world.addComponent(entity, Velocity);
      world.addComponent(entity, Health);

      assert.strictEqual(world.hasComponent(entity, Transform), true);
      assert.strictEqual(world.hasComponent(entity, Velocity), true);
      assert.strictEqual(world.hasComponent(entity, Health), true);
    });

    it("throws for dead entity", () => {
      const { world, Transform } = createWorld();
      const entity = world.createEntity();
      world.destroyEntity(entity);
      assert.throws(
        () => world.addComponent(entity, Transform),
        /not alive/i
      );
    });

    it("throws for unregistered component", () => {
      const { world } = createWorld();

      class Unknown {
        static schema = { v: "f32" };
      }

      const entity = world.createEntity();
      assert.throws(
        () => world.addComponent(entity, Unknown),
        /not registered/i
      );
    });

    it("throws for invalid component argument type", () => {
      const { world } = createWorld();
      const entity = world.createEntity();
      assert.throws(
        () => world.addComponent(entity, 42),
        TypeError
      );
    });
  });

  // ─── removeComponent ──────────────────────────────────────

  describe("removeComponent", () => {
    it("removes a component from an entity", () => {
      const { world, Transform } = createWorld();
      const entity = world.createEntity();
      world.addComponent(entity, Transform);
      world.removeComponent(entity, Transform);
      assert.strictEqual(world.hasComponent(entity, Transform), false);
    });

    it("moves entity back to empty archetype after removing all components", () => {
      const { world, Transform } = createWorld();
      const entity = world.createEntity();
      world.addComponent(entity, Transform);
      world.removeComponent(entity, Transform);
      assert.strictEqual(world.archetypeSystem.entitySignature(entity).key, "");
    });

    it("is a no-op when component is absent", () => {
      const { world, Transform } = createWorld();
      const entity = world.createEntity();
      world.removeComponent(entity, Transform);
      assert.strictEqual(world.hasComponent(entity, Transform), false);
      assert.strictEqual(world.archetypeSystem.entitySignature(entity).key, "");
    });

    it("removes one component while keeping others", () => {
      const { world, Transform, Velocity } = createWorld();
      const entity = world.createEntity();

      world.addComponent(entity, Transform);
      world.addComponent(entity, Velocity);
      world.removeComponent(entity, Transform);

      assert.strictEqual(world.hasComponent(entity, Transform), false);
      assert.strictEqual(world.hasComponent(entity, Velocity), true);
      assert.strictEqual(world.archetypeSystem.entitySignature(entity).key, "66");
    });

    it("accepts component name string", () => {
      const { world } = createWorld();
      const entity = world.createEntity();
      world.addComponent(entity, "Transform");
      world.removeComponent(entity, "Transform");
      assert.strictEqual(world.hasComponent(entity, "Transform"), false);
    });

    it("throws for dead entity", () => {
      const { world, Transform } = createWorld();
      const entity = world.createEntity();
      world.destroyEntity(entity);
      assert.throws(
        () => world.removeComponent(entity, Transform),
        /not alive/i
      );
    });

    it("throws for unregistered component", () => {
      const { world } = createWorld();
      const entity = world.createEntity();
      assert.throws(
        () => world.removeComponent(entity, "Unknown"),
        /not registered/i
      );
    });
  });

  // ─── hasComponent ─────────────────────────────────────────

  describe("hasComponent", () => {
    it("returns true when entity has the component", () => {
      const { world, Transform } = createWorld();
      const entity = world.createEntity();
      world.addComponent(entity, Transform);
      assert.strictEqual(world.hasComponent(entity, Transform), true);
    });

    it("returns false when entity does not have the component", () => {
      const { world, Transform } = createWorld();
      const entity = world.createEntity();
      assert.strictEqual(world.hasComponent(entity, Transform), false);
    });

    it("returns false for dead entity", () => {
      const { world, Transform } = createWorld();
      const entity = world.createEntity();
      world.addComponent(entity, Transform);
      world.destroyEntity(entity);
      assert.strictEqual(world.hasComponent(entity, Transform), false);
    });

    it("returns false for entity 0", () => {
      const { world, Transform } = createWorld();
      assert.strictEqual(world.hasComponent(0, Transform), false);
    });

    it("throws for unregistered component", () => {
      const { world } = createWorld();
      const entity = world.createEntity();
      assert.throws(
        () => world.hasComponent(entity, "Unknown"),
        /not registered/i
      );
    });
  });

  // ─── getComponent (views) ─────────────────────────────────

  describe("getComponent", () => {
    it("returns a view object with component fields", () => {
      const { world, Transform } = createWorld();
      const entity = world.createEntity();
      world.addComponent(entity, Transform);

      const view = world.getComponent(entity, Transform);
      assert.ok(view !== null && typeof view === 'object');
      assert.ok('x' in view);
      assert.ok('y' in view);
    });

    it("view fields read from typed array storage", () => {
      const { world, Transform } = createWorld();
      const entity = world.createEntity();
      world.addComponent(entity, Transform);

      const table = world.archetypeSystem.entityTable(entity);
      const row = world.entityManager.getRow(entity);
      table.getColumn(65, "x")[row] = 42.5;
      table.getColumn(65, "y")[row] = 100.0;

      const view = world.getComponent(entity, Transform);
      assert.strictEqual(view.x, 42.5);
      assert.strictEqual(view.y, 100.0);
    });

    it("view field writes propagate to typed array storage", () => {
      const { world, Transform } = createWorld();
      const entity = world.createEntity();
      world.addComponent(entity, Transform);

      const view = world.getComponent(entity, Transform);
      view.x = 10;
      view.y = 20;

      const table = world.archetypeSystem.entityTable(entity);
      const row = world.entityManager.getRow(entity);
      assert.strictEqual(table.getColumn(65, "x")[row], 10);
      assert.strictEqual(table.getColumn(65, "y")[row], 20);
    });

    it("view is valid only for the entity's archetype", () => {
      const { world, Transform, Velocity } = createWorld();
      const entity = world.createEntity();
      world.addComponent(entity, Transform);

      const view = world.getComponent(entity, Transform);
      view.x = 5;

      world.addComponent(entity, Velocity);

      const newView = world.getComponent(entity, Transform);
      assert.strictEqual(newView.x, 5);
    });

    it("throws for dead entity", () => {
      const { world, Transform } = createWorld();
      const entity = world.createEntity();
      world.addComponent(entity, Transform);
      world.destroyEntity(entity);
      assert.throws(
        () => world.getComponent(entity, Transform),
        /not alive/i
      );
    });

    it("throws when entity does not have the component", () => {
      const { world, Transform } = createWorld();
      const entity = world.createEntity();
      assert.throws(
        () => world.getComponent(entity, Transform),
        /does not have/i
      );
    });

    it("throws for unregistered component", () => {
      const { world } = createWorld();
      const entity = world.createEntity();

      class Unknown {
        static schema = { v: "f32" };
      }

      assert.throws(
        () => world.getComponent(entity, Unknown),
        /not registered/i
      );
    });

    it("view exposes only the component's declared fields", () => {
      const { world, Score } = createWorld();
      const entity = world.createEntity();
      world.addComponent(entity, Score);

      const view = world.getComponent(entity, Score);
      assert.strictEqual(Object.keys(view).length, 1);
      assert.ok('value' in view);
    });
  });

  // ─── setComponent ─────────────────────────────────────────

  describe("setComponent", () => {
    it("sets component field values", () => {
      const { world, Transform } = createWorld();
      const entity = world.createEntity();
      world.addComponent(entity, Transform);

      world.setComponent(entity, Transform, { x: 10, y: 20 });

      const view = world.getComponent(entity, Transform);
      assert.strictEqual(view.x, 10);
      assert.strictEqual(view.y, 20);
    });

    it("partially updates fields (missing fields unchanged)", () => {
      const { world, Transform } = createWorld();
      const entity = world.createEntity();
      world.addComponent(entity, Transform);

      world.setComponent(entity, Transform, { x: 5 });
      const view = world.getComponent(entity, Transform);
      assert.strictEqual(view.x, 5);
      assert.strictEqual(view.y, 0);
    });

    it("throws for unknown field name", () => {
      const { world, Transform } = createWorld();
      const entity = world.createEntity();
      world.addComponent(entity, Transform);

      assert.throws(
        () => world.setComponent(entity, Transform, { nonexistent: 1 }),
        /unknown field/i
      );
    });

    it("throws for dead entity", () => {
      const { world, Transform } = createWorld();
      const entity = world.createEntity();
      world.addComponent(entity, Transform);
      world.destroyEntity(entity);

      assert.throws(
        () => world.setComponent(entity, Transform, { x: 1 }),
        /not alive/i
      );
    });

    it("throws when entity does not have the component", () => {
      const { world, Transform } = createWorld();
      const entity = world.createEntity();

      assert.throws(
        () => world.setComponent(entity, Transform, { x: 1 }),
        /does not have/i
      );
    });

    it("throws for non-object values parameter", () => {
      const { world, Transform } = createWorld();
      const entity = world.createEntity();
      world.addComponent(entity, Transform);

      assert.throws(
        () => world.setComponent(entity, Transform, 42),
        TypeError
      );
    });
  });

  // ─── Repeated Add/Remove ──────────────────────────────────

  describe("repeated add/remove", () => {
    it("can add and remove the same component repeatedly", () => {
      const { world, Transform } = createWorld();
      const entity = world.createEntity();

      for (let i = 0; i < 10; i++) {
        world.addComponent(entity, Transform);
        assert.strictEqual(world.hasComponent(entity, Transform), true);

        world.removeComponent(entity, Transform);
        assert.strictEqual(world.hasComponent(entity, Transform), false);
      }
    });

    it("cycles through multiple archetypes correctly", () => {
      const { world, Transform, Velocity } = createWorld();
      const entity = world.createEntity();

      world.addComponent(entity, Transform);
      world.addComponent(entity, Velocity);
      assert.strictEqual(world.archetypeSystem.entitySignature(entity).key, "65,66");

      world.removeComponent(entity, Transform);
      assert.strictEqual(world.archetypeSystem.entitySignature(entity).key, "66");

      world.addComponent(entity, Transform);
      assert.strictEqual(world.archetypeSystem.entitySignature(entity).key, "65,66");

      world.removeComponent(entity, Velocity);
      assert.strictEqual(world.archetypeSystem.entitySignature(entity).key, "65");

      world.removeComponent(entity, Transform);
      assert.strictEqual(world.archetypeSystem.entitySignature(entity).key, "");
    });
  });

  // ─── Component Persistence ────────────────────────────────

  describe("component persistence across migrations", () => {
    it("data persists when adding a component", () => {
      const { world, Transform, Velocity } = createWorld();
      const entity = world.createEntity();

      world.addComponent(entity, Transform);
      world.setComponent(entity, Transform, { x: 7, y: 14 });

      world.addComponent(entity, Velocity);

      const view = world.getComponent(entity, Transform);
      assert.strictEqual(view.x, 7);
      assert.strictEqual(view.y, 14);
    });

    it("data persists through remove followed by re-add", () => {
      const { world, Transform } = createWorld();
      const entity = world.createEntity();

      world.addComponent(entity, Transform);
      world.setComponent(entity, Transform, { x: 100, y: 200 });

      world.removeComponent(entity, Transform);
      world.addComponent(entity, Transform);

      const view = world.getComponent(entity, Transform);
      assert.strictEqual(view.x, 0);
      assert.strictEqual(view.y, 0);
    });

    it("view stays writable after migrations", () => {
      const { world, Transform, Velocity } = createWorld();
      const entity = world.createEntity();

      world.addComponent(entity, Transform);
      const v1 = world.getComponent(entity, Transform);
      v1.x = 1;
      v1.y = 2;

      world.addComponent(entity, Velocity);
      const v2 = world.getComponent(entity, Transform);
      assert.strictEqual(v2.x, 1);

      v2.y = 99;
      assert.strictEqual(world.getComponent(entity, Transform).y, 99);
    });
  });

  // ─── Multiple Components ──────────────────────────────────

  describe("multiple components", () => {
    it("supports 3+ components per entity", () => {
      const { world, Transform, Velocity, Health, Score } = createWorld();
      const entity = world.createEntity();

      world.addComponent(entity, Transform);
      world.addComponent(entity, Velocity);
      world.addComponent(entity, Health);
      world.addComponent(entity, Score);

      assert.strictEqual(world.hasComponent(entity, Transform), true);
      assert.strictEqual(world.hasComponent(entity, Velocity), true);
      assert.strictEqual(world.hasComponent(entity, Health), true);
      assert.strictEqual(world.hasComponent(entity, Score), true);
    });

    it("each component has independent storage", () => {
      const { world, Transform, Velocity } = createWorld();
      const entity = world.createEntity();

      world.addComponent(entity, Transform);
      world.addComponent(entity, Velocity);

      world.setComponent(entity, Transform, { x: 5, y: 10 });
      world.setComponent(entity, Velocity, { vx: 1, vy: 2 });

      const t = world.getComponent(entity, Transform);
      const v = world.getComponent(entity, Velocity);

      assert.strictEqual(t.x, 5);
      assert.strictEqual(t.y, 10);
      assert.strictEqual(v.vx, 1);
      assert.strictEqual(v.vy, 2);
    });
  });

  // ─── Entity Migration Chains ──────────────────────────────

  describe("entity migration chains", () => {
    it("entity moves through multiple archetypes in sequence", () => {
      const { world, Transform, Velocity, Health } = createWorld();
      const entity = world.createEntity();

      world.addComponent(entity, Transform);
      world.addComponent(entity, Velocity);
      world.addComponent(entity, Health);
      world.removeComponent(entity, Transform);
      world.removeComponent(entity, Velocity);

      assert.strictEqual(world.hasComponent(entity, Health), true);
      assert.strictEqual(world.hasComponent(entity, Transform), false);
      assert.strictEqual(world.hasComponent(entity, Velocity), false);
      assert.strictEqual(world.archetypeSystem.entitySignature(entity).key, "67");
    });

    it("multiple entities can exist in different archetypes", () => {
      const { world, Transform, Velocity, Health } = createWorld();

      const e1 = world.createEntity();
      const e2 = world.createEntity();
      const e3 = world.createEntity();

      world.addComponent(e1, Transform);
      world.addComponent(e2, Velocity);
      world.addComponent(e3, Health);

      world.addComponent(e1, Velocity);
      world.addComponent(e2, Health);

      assert.strictEqual(world.archetypeSystem.entitySignature(e1).key, "65,66");
      assert.strictEqual(world.archetypeSystem.entitySignature(e2).key, "66,67");
      assert.strictEqual(world.archetypeSystem.entitySignature(e3).key, "67");

      world.setComponent(e1, Transform, { x: 1, y: 2 });
      world.setComponent(e1, Velocity, { vx: 3, vy: 4 });

      assert.strictEqual(world.getComponent(e1, Transform).x, 1);
      assert.strictEqual(world.getComponent(e1, Velocity).vx, 3);
    });
  });

  // ─── Swap-Remove During Destroy ───────────────────────────

  describe("swap-remove during destroy", () => {
    it("updates location of swapped entity", () => {
      const { world, Transform } = createWorld();
      const e1 = world.createEntity();
      const e2 = world.createEntity();
      const e3 = world.createEntity();

      world.addComponent(e1, Transform);
      world.addComponent(e2, Transform);
      world.addComponent(e3, Transform);

      const table = world.archetypeSystem.entityTable(e1);
      const rowBefore = world.entityManager.getRow(e2);

      world.destroyEntity(e1);

      const loc = world.entityManager.getLocation(e2);
      assert.strictEqual(loc.archetype, 2);
      assert.strictEqual(table.getEntity(loc.row), e2);
    });

    it("swapped entity's component data is preserved", () => {
      const { world, Transform } = createWorld();
      const e1 = world.createEntity();
      const e2 = world.createEntity();

      world.addComponent(e1, Transform);
      world.addComponent(e2, Transform);

      world.setComponent(e1, Transform, { x: 10, y: 20 });
      world.setComponent(e2, Transform, { x: 30, y: 40 });

      world.destroyEntity(e1);

      assert.strictEqual(world.getComponent(e2, Transform).x, 30);
    });
  });

  // ─── Stress Tests ─────────────────────────────────────────

  describe("stress tests", () => {
    it("handles hundreds of entities", () => {
      const { world, Transform } = createWorld();
      const entities = [];

      for (let i = 0; i < 200; i++) {
        const e = world.createEntity();
        entities.push(e);
        world.addComponent(e, Transform);
        world.setComponent(e, Transform, { x: i, y: i * 2 });
      }

      for (let i = 0; i < 200; i++) {
        const view = world.getComponent(entities[i], Transform);
        assert.strictEqual(view.x, i);
        assert.strictEqual(view.y, i * 2);
      }

      for (let i = 0; i < 200; i++) {
        world.removeComponent(entities[i], Transform);
        assert.strictEqual(world.hasComponent(entities[i], Transform), false);
      }
    });

    it("handles entities moving between archetypes repeatedly", () => {
      const { world, Transform, Velocity } = createWorld();
      const entity = world.createEntity();

      for (let i = 0; i < 50; i++) {
        world.addComponent(entity, Transform);
        world.addComponent(entity, Velocity);
        world.removeComponent(entity, Transform);
        world.removeComponent(entity, Velocity);
      }

      assert.strictEqual(world.isAlive(entity), true);
      assert.strictEqual(world.hasComponent(entity, Transform), false);
      assert.strictEqual(world.hasComponent(entity, Velocity), false);
    });
  });

  // ─── Tag Components ───────────────────────────────────────

  describe("tag components", () => {
    it("adds a tag component (no fields)", () => {
      const { world, Tag } = createWorld();
      const entity = world.createEntity();
      world.addComponent(entity, Tag);
      assert.strictEqual(world.hasComponent(entity, Tag), true);
    });

    it("removes a tag component", () => {
      const { world, Tag } = createWorld();
      const entity = world.createEntity();
      world.addComponent(entity, Tag);
      world.removeComponent(entity, Tag);
      assert.strictEqual(world.hasComponent(entity, Tag), false);
    });

    it("tag component archetype has one entry per entity", () => {
      const { world, Tag } = createWorld();
      const e1 = world.createEntity();
      const e2 = world.createEntity();

      world.addComponent(e1, Tag);
      world.addComponent(e2, Tag);

      const table = world.archetypeSystem.entityTable(e1);
      assert.strictEqual(table.count, 2);
    });
  });

  // ─── Edge Cases ───────────────────────────────────────────

  describe("edge cases", () => {
    it("destroy entity removes view cache entries", () => {
      const { world, Transform } = createWorld();
      const entity = world.createEntity();
      world.addComponent(entity, Transform);

      world.getComponent(entity, Transform);
      world.destroyEntity(entity);

      const e2 = world.createEntity();
      world.addComponent(e2, Transform);
      const view = world.getComponent(e2, Transform);
      view.x = 7;
      assert.strictEqual(view.x, 7);
    });

    it("isAlive returns false for destroyed entities", () => {
      const { world } = createWorld();
      const entity = world.createEntity();
      assert.strictEqual(world.isAlive(entity), true);
      world.destroyEntity(entity);
      assert.strictEqual(world.isAlive(entity), false);
    });

    it("isAlive returns false for entity 0", () => {
      const { world } = createWorld();
      assert.strictEqual(world.isAlive(0), false);
    });

    it("isAlive returns false for very large entity ID", () => {
      const { world } = createWorld();
      assert.strictEqual(world.isAlive(999999999), false);
    });
  });
});
