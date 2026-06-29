import { describe, it } from "node:test";
import * as assert from "node:assert";
import { World } from "../../../ecs/core/World.js";
import { System } from "../../../ecs/core/System.js";

class Position { static schema = { x: "f32", y: "f32" }; }
class Velocity { static schema = { vx: "f32", vy: "f32" }; }
class Health { static schema = { hp: "u32", maxHp: "u32" }; }
class Sprite { static schema = { texture: "u32", alpha: "f32" }; }
class Enemy {}
class Sleeping {}

function createWorld() {
  const world = new World({ initialCapacity: 64, maxEntities: 10000 });
  world.register(Position);
  world.register(Velocity);
  world.register(Health);
  world.register(Sprite);
  world.register(Enemy);
  world.register(Sleeping);
  return world;
}

describe("World Runtime Integration", () => {
  // ─── Subsystem Construction ────────────────────────────
  describe("subsystem construction", () => {
    it("creates ComponentRegistry", () => {
      const world = new World();
      assert.ok(world.registry);
    });

    it("creates EntityManager", () => {
      const world = new World();
      assert.ok(world.entityManager);
    });

    it("creates ArchetypeSystem", () => {
      const world = new World();
      assert.ok(world.archetypeSystem);
    });

    it("creates QueryEngine", () => {
      const world = new World();
      assert.ok(world.queryEngine);
    });

    it("creates SystemScheduler", () => {
      const world = new World();
      assert.ok(world.scheduler);
    });

    it("all five subsystems are distinct objects", () => {
      const world = new World();
      const subs = [world.registry, world.entityManager, world.archetypeSystem, world.queryEngine, world.scheduler];
      for (let i = 0; i < subs.length; i++) {
        for (let j = i + 1; j < subs.length; j++) {
          assert.notStrictEqual(subs[i], subs[j]);
        }
      }
    });
  });

  // ─── Scheduler Wiring ──────────────────────────────────
  describe("scheduler wiring", () => {
    it("scheduler receives the world reference", () => {
      const world = new World();
      assert.strictEqual(world.scheduler.world, world);
    });

    it("scheduler receives queryEngine", () => {
      const world = new World();
      assert.strictEqual(world.scheduler._queryEngine, world.queryEngine);
    });

    it("scheduler receives componentRegistry", () => {
      const world = new World();
      assert.strictEqual(world.scheduler._componentRegistry, world.registry);
    });
  });

  // ─── Archetype Creation Notification ───────────────────
  describe("archetype creation notification", () => {
    it("calls queryEngine.onArchetypeCreated when a new archetype is created", () => {
      const world = createWorld();
      let callCount = 0;
      const original = world.queryEngine.onArchetypeCreated;
      world.queryEngine.onArchetypeCreated = (arch) => { callCount++; };

      const e = world.createEntity();
      assert.strictEqual(callCount, 0);

      world.addComponent(e, Position);
      assert.strictEqual(callCount, 1);

      world.queryEngine.onArchetypeCreated = original;
    });

    it("calls onArchetypeCreated exactly once per new archetype", () => {
      const world = createWorld();
      let callCount = 0;
      const original = world.queryEngine.onArchetypeCreated;
      world.queryEngine.onArchetypeCreated = (arch) => { callCount++; };

      const e1 = world.createEntity();
      world.addComponent(e1, Position);
      assert.strictEqual(callCount, 1);

      const e2 = world.createEntity();
      world.addComponent(e2, Position);
      assert.strictEqual(callCount, 1);

      world.addComponent(e1, Velocity);
      assert.strictEqual(callCount, 2);

      world.queryEngine.onArchetypeCreated = original;
    });

    it("does not call onArchetypeCreated for existing archetypes", () => {
      const world = createWorld();
      let callCount = 0;
      const original = world.queryEngine.onArchetypeCreated;
      world.queryEngine.onArchetypeCreated = (arch) => { callCount++; };

      const e1 = world.createEntity();
      world.addComponent(e1, Position);
      const firstCount = callCount;

      const e2 = world.createEntity();
      world.addComponent(e2, Position);
      assert.strictEqual(callCount, firstCount);

      world.queryEngine.onArchetypeCreated = original;
    });
  });

  // ─── addSystem ─────────────────────────────────────────
  describe("addSystem", () => {
    it("registers a system", () => {
      const world = createWorld();
      class TestSystem extends System { update(w, dt) {} }
      world.addSystem(new TestSystem());
      assert.strictEqual(world.scheduler.systemCount, 1);
    });

    it("rejects duplicate systems", () => {
      const world = createWorld();
      class TestSystem extends System { update(w, dt) {} }
      const system = new TestSystem();
      world.addSystem(system);
      assert.throws(() => world.addSystem(system), /already registered/);
    });

    it("rejects non-System instances", () => {
      const world = createWorld();
      assert.throws(() => world.addSystem({}), { name: "TypeError" });
      assert.throws(() => world.addSystem(null), { name: "TypeError" });
    });

    it("rejects adding during update", () => {
      const world = createWorld();
      class BadSystem extends System {
        update(w, dt) {
          world.addSystem(new BadSystem());
        }
      }
      world.addSystem(new BadSystem());
      assert.throws(() => world.update(16), /cannot add systems during update/);
    });

    it("compiles static query from component classes", () => {
      const world = createWorld();
      class MovementSystem extends System {
        static query = { all: [Position, Velocity] };
        update(w, dt) {}
      }
      const system = new MovementSystem();
      world.addSystem(system);
      assert.ok(system.query);
    });

    it("does not compile query if none defined", () => {
      const world = createWorld();
      class NoQuerySystem extends System { update(w, dt) {} }
      const system = new NoQuerySystem();
      world.addSystem(system);
      assert.strictEqual(system.query, null);
    });

    it("rejects query with unregistered component", () => {
      const world = new World();
      class Unregistered {}
      class BadSystem extends System {
        static query = { all: [Unregistered] };
        update(w, dt) {}
      }
      assert.throws(() => world.addSystem(new BadSystem()), /not registered/);
    });

    it("reuses cached queries for same filter across systems", () => {
      const world = createWorld();
      class SysA extends System {
        static query = { all: [Position] };
        update(w, dt) {}
      }
      class SysB extends System {
        static query = { all: [Position] };
        update(w, dt) {}
      }
      const a = new SysA();
      const b = new SysB();
      world.addSystem(a);
      world.addSystem(b);
      assert.strictEqual(a.query, b.query);
    });
  });

  // ─── removeSystem ──────────────────────────────────────
  describe("removeSystem", () => {
    it("removes a registered system", () => {
      const world = createWorld();
      class TestSystem extends System { update(w, dt) {} }
      const system = new TestSystem();
      world.addSystem(system);
      world.removeSystem(system);
      assert.strictEqual(world.scheduler.systemCount, 0);
    });

    it("throws for unregistered system", () => {
      const world = createWorld();
      class TestSystem extends System { update(w, dt) {} }
      assert.throws(() => world.removeSystem(new TestSystem()), /not registered/);
    });

    it("calls onRemoved on removal", () => {
      const world = createWorld();
      let removed = false;
      class TestSystem extends System {
        onRemoved(w) { removed = true; }
        update(w, dt) {}
      }
      const system = new TestSystem();
      world.addSystem(system);
      world.removeSystem(system);
      assert.strictEqual(removed, true);
    });
  });

  // ─── clearSystems ──────────────────────────────────────
  describe("clearSystems", () => {
    it("removes all systems", () => {
      const world = createWorld();
      class A extends System { update(w, dt) {} }
      class B extends System { update(w, dt) {} }
      world.addSystem(new A());
      world.addSystem(new B());
      world.clearSystems();
      assert.strictEqual(world.scheduler.systemCount, 0);
    });

    it("calls onRemoved for each system", () => {
      const world = createWorld();
      const removed = [];
      class A extends System {
        onRemoved(w) { removed.push("A"); }
        update(w, dt) {}
      }
      class B extends System {
        onRemoved(w) { removed.push("B"); }
        update(w, dt) {}
      }
      world.addSystem(new A());
      world.addSystem(new B());
      world.clearSystems();
      assert.deepStrictEqual(removed, ["A", "B"]);
    });
  });

  // ─── update ────────────────────────────────────────────
  describe("update", () => {
    it("calls update on all registered systems", () => {
      const world = createWorld();
      let calledA = false;
      let calledB = false;
      class A extends System { update(w, dt) { calledA = true; } }
      class B extends System { update(w, dt) { calledB = true; } }
      world.addSystem(new A());
      world.addSystem(new B());
      world.update(16);
      assert.strictEqual(calledA, true);
      assert.strictEqual(calledB, true);
    });

    it("forwards dt to systems", () => {
      const world = createWorld();
      let received = 0;
      class TestSystem extends System { update(w, dt) { received = dt; } }
      world.addSystem(new TestSystem());
      world.update(42.5);
      assert.strictEqual(received, 42.5);
    });

    it("forwards world to systems", () => {
      const world = createWorld();
      let received = null;
      class TestSystem extends System { update(w, dt) { received = w; } }
      world.addSystem(new TestSystem());
      world.update(16);
      assert.strictEqual(received, world);
    });

    it("throws for recursive update", () => {
      const world = createWorld();
      class RecursiveSystem extends System {
        update(w, dt) { w.update(dt); }
      }
      world.addSystem(new RecursiveSystem());
      assert.throws(() => world.update(16), /recursive update/);
    });

    it("does not throw when no systems are registered", () => {
      const world = createWorld();
      world.update(16);
    });

    it("does not throw when update is called multiple times", () => {
      const world = createWorld();
      class TestSystem extends System { update(w, dt) {} }
      world.addSystem(new TestSystem());
      world.update(16);
      world.update(16);
      world.update(16);
    });
  });

  // ─── Priority Ordering ─────────────────────────────────
  describe("priority ordering", () => {
    it("executes systems in ascending priority order", () => {
      const world = createWorld();
      const order = [];

      class Low extends System {
        static priority = 0;
        update(w, dt) { order.push("low"); }
      }
      class High extends System {
        static priority = 100;
        update(w, dt) { order.push("high"); }
      }
      class Mid extends System {
        static priority = 50;
        update(w, dt) { order.push("mid"); }
      }

      world.addSystem(new Low());
      world.addSystem(new High());
      world.addSystem(new Mid());
      world.update(16);

      assert.deepStrictEqual(order, ["low", "mid", "high"]);
    });

    it("supports negative priorities", () => {
      const world = createWorld();
      const order = [];

      class Early extends System {
        static priority = -100;
        update(w, dt) { order.push("early"); }
      }
      class Normal extends System {
        static priority = 0;
        update(w, dt) { order.push("normal"); }
      }

      world.addSystem(new Normal());
      world.addSystem(new Early());
      world.update(16);

      assert.deepStrictEqual(order, ["early", "normal"]);
    });

    it("maintains registration order for equal priorities", () => {
      const world = createWorld();
      const order = [];

      class A extends System {
        static priority = 0;
        update(w, dt) { order.push("A"); }
      }
      class B extends System {
        static priority = 0;
        update(w, dt) { order.push("B"); }
      }
      class C extends System {
        static priority = 0;
        update(w, dt) { order.push("C"); }
      }

      world.addSystem(new A());
      world.addSystem(new B());
      world.addSystem(new C());
      world.update(16);

      assert.deepStrictEqual(order, ["A", "B", "C"]);
    });

    it("re-add at end of priority group after remove", () => {
      const world = createWorld();
      const order = [];

      class A extends System {
        static priority = 0;
        update(w, dt) { order.push("A"); }
      }
      class B extends System {
        static priority = 0;
        update(w, dt) { order.push("B"); }
      }
      class C extends System {
        static priority = 0;
        update(w, dt) { order.push("C"); }
      }

      const a = new A();
      const b = new B();
      const c = new C();
      world.addSystem(a);
      world.addSystem(b);
      world.addSystem(c);
      world.removeSystem(b);
      world.addSystem(b);
      world.update(16);

      assert.deepStrictEqual(order, ["A", "C", "B"]);
    });
  });

  // ─── Disabled Systems ──────────────────────────────────
  describe("disabled systems", () => {
    it("skips a disabled system", () => {
      const world = createWorld();
      const executed = [];
      class A extends System { update(w, dt) { executed.push("A"); } }
      class B extends System { update(w, dt) { executed.push("B"); } }
      const a = new A();
      a.enabled = false;
      world.addSystem(a);
      world.addSystem(new B());
      world.update(16);
      assert.deepStrictEqual(executed, ["B"]);
    });

    it("skips only disabled systems, executes others", () => {
      const world = createWorld();
      const executed = [];
      class A extends System { update(w, dt) { executed.push("A"); } }
      class B extends System { update(w, dt) { executed.push("B"); } }
      class C extends System { update(w, dt) { executed.push("C"); } }
      const b = new B();
      b.enabled = false;
      world.addSystem(new A());
      world.addSystem(b);
      world.addSystem(new C());
      world.update(16);
      assert.deepStrictEqual(executed, ["A", "C"]);
    });
  });

  // ─── Lifecycle Callbacks ───────────────────────────────
  describe("lifecycle callbacks", () => {
    it("calls onAdded when system is added", () => {
      const world = createWorld();
      let called = false;
      let received = null;
      class TestSystem extends System {
        onAdded(w) { called = true; received = w; }
        update(w, dt) {}
      }
      world.addSystem(new TestSystem());
      assert.strictEqual(called, true);
      assert.strictEqual(received, world);
    });

    it("calls onRemoved when system is removed", () => {
      const world = createWorld();
      let called = false;
      let received = null;
      class TestSystem extends System {
        onRemoved(w) { called = true; received = w; }
        update(w, dt) {}
      }
      const system = new TestSystem();
      world.addSystem(system);
      world.removeSystem(system);
      assert.strictEqual(called, true);
      assert.strictEqual(received, world);
    });

    it("calls onRemoved for all systems on clear", () => {
      const world = createWorld();
      const removed = [];
      class A extends System {
        onRemoved(w) { removed.push("A"); }
        update(w, dt) {}
      }
      class B extends System {
        onRemoved(w) { removed.push("B"); }
        update(w, dt) {}
      }
      world.addSystem(new A());
      world.addSystem(new B());
      world.clearSystems();
      assert.deepStrictEqual(removed, ["A", "B"]);
    });

    it("onAdded receives world with all subsystems accessible", () => {
      const world = createWorld();
      let received = null;
      class TestSystem extends System {
        onAdded(w) { received = w; }
        update(w, dt) {}
      }
      world.addSystem(new TestSystem());
      assert.ok(received.registry);
      assert.ok(received.entityManager);
      assert.ok(received.archetypeSystem);
      assert.ok(received.queryEngine);
      assert.ok(received.scheduler);
    });
  });

  // ─── Query Compilation ─────────────────────────────────
  describe("query compilation", () => {
    it("compiles all query", () => {
      const world = createWorld();
      class TestSystem extends System {
        static query = { all: [Position, Velocity] };
        update(w, dt) {}
      }
      const system = new TestSystem();
      world.addSystem(system);
      assert.ok(system.query);
      assert.strictEqual(system.query.all.contains(world.registry.getId(Position)), true);
      assert.strictEqual(system.query.all.contains(world.registry.getId(Velocity)), true);
    });

    it("compiles any and none query", () => {
      const world = createWorld();
      class TestSystem extends System {
        static query = { all: [Position], any: [Velocity], none: [Enemy] };
        update(w, dt) {}
      }
      const system = new TestSystem();
      world.addSystem(system);
      assert.ok(system.query);
      assert.strictEqual(system.query.hasAll, true);
      assert.strictEqual(system.query.hasAny, true);
      assert.strictEqual(system.query.hasNone, true);
    });

    it("compiles wildcard query (empty filters)", () => {
      const world = createWorld();
      class TestSystem extends System {
        static query = {};
        update(w, dt) {}
      }
      const system = new TestSystem();
      world.addSystem(system);
      assert.ok(system.query);
    });

    it("rejects impossible query (all ∩ none)", () => {
      const world = createWorld();
      class BadSystem extends System {
        static query = { all: [Position], none: [Position] };
        update(w, dt) {}
      }
      assert.throws(() => world.addSystem(new BadSystem()), /impossible query/);
    });

    it("rejects impossible query (any ∩ none)", () => {
      const world = createWorld();
      class BadSystem extends System {
        static query = { any: [Velocity], none: [Velocity] };
        update(w, dt) {}
      }
      assert.throws(() => world.addSystem(new BadSystem()), /impossible query/);
    });
  });

  // ─── Query Cache ───────────────────────────────────────
  describe("query cache", () => {
    it("reuses cached query for identical filter", () => {
      const world = createWorld();
      class SysA extends System {
        static query = { all: [Position] };
        update(w, dt) {}
      }
      class SysB extends System {
        static query = { all: [Position] };
        update(w, dt) {}
      }
      const a = new SysA();
      const b = new SysB();
      world.addSystem(a);
      world.addSystem(b);
      assert.strictEqual(a.query, b.query);
    });

    it("different filters produce different query objects", () => {
      const world = createWorld();
      class SysA extends System {
        static query = { all: [Position] };
        update(w, dt) {}
      }
      class SysB extends System {
        static query = { all: [Velocity] };
        update(w, dt) {}
      }
      const a = new SysA();
      const b = new SysB();
      world.addSystem(a);
      world.addSystem(b);
      assert.notStrictEqual(a.query, b.query);
    });
  });

  // ─── Archetype Discovery via Queries ───────────────────
  describe("archetype discovery", () => {
    it("system queries discover archetypes created before registration", () => {
      const world = createWorld();
      const e1 = world.createEntity();
      world.addComponent(e1, Position);
      world.addComponent(e1, Velocity);

      let tableCount = 0;
      class MovementSystem extends System {
        static query = { all: [Position, Velocity] };
        update(w, dt) {
          tableCount = w.queryEngine.getTables(this.query).length;
        }
      }
      world.addSystem(new MovementSystem());
      world.update(16);
      assert.strictEqual(tableCount, 1);
    });

    it("system queries discover archetypes created after registration", () => {
      const world = createWorld();
      let tableCount = 0;

      class MovementSystem extends System {
        static query = { all: [Position, Velocity] };
        update(w, dt) {
          tableCount = w.queryEngine.getTables(this.query).length;
        }
      }
      world.addSystem(new MovementSystem());

      const e1 = world.createEntity();
      world.addComponent(e1, Position);
      world.addComponent(e1, Velocity);

      world.update(16);
      assert.strictEqual(tableCount, 1);
    });

    it("query matches correct number of archetypes across multiple adds", () => {
      const world = createWorld();
      let tableCount = 0;

      class PosSystem extends System {
        static query = { all: [Position] };
        update(w, dt) {
          tableCount = w.queryEngine.getTables(this.query).length;
        }
      }
      world.addSystem(new PosSystem());

      world.update(16);
      const emptyCount = tableCount;

      const e1 = world.createEntity();
      world.addComponent(e1, Position);

      world.update(16);
      const afterOne = tableCount;

      const e2 = world.createEntity();
      world.addComponent(e2, Position);
      world.addComponent(e2, Velocity);

      world.update(16);
      const afterTwo = tableCount;

      assert.strictEqual(emptyCount, 0);
      assert.strictEqual(afterOne, 1);
      assert.strictEqual(afterTwo, 2);
    });

    it("system with any-only query discovers matching archetypes", () => {
      const world = createWorld();
      let tableCount = 0;

      class AnySystem extends System {
        static query = { any: [Position, Sprite] };
        update(w, dt) {
          tableCount = w.queryEngine.getTables(this.query).length;
        }
      }
      world.addSystem(new AnySystem());

      world.update(16);
      assert.strictEqual(tableCount, 0);

      const e = world.createEntity();
      world.addComponent(e, Position);
      world.update(16);
      assert.strictEqual(tableCount, 1);
    });

    it("system with none-only query excludes archetypes with none components", () => {
      const world = createWorld();
      let tableCount = 0;

      class NoneSystem extends System {
        static query = { none: [Enemy] };
        update(w, dt) {
          tableCount = w.queryEngine.getTables(this.query).length;
        }
      }
      world.addSystem(new NoneSystem());

      const e1 = world.createEntity();
      world.addComponent(e1, Position);
      const e2 = world.createEntity();
      world.addComponent(e2, Position);
      world.addComponent(e2, Enemy);

      // Empty archetype + Position archetype both match (no Enemy).
      // Position+Enemy archetype is excluded.
      world.update(16);
      assert.strictEqual(tableCount, 2);
    });
  });

  // ─── End-to-End Integration ────────────────────────────
  describe("end-to-end integration", () => {
    it("full lifecycle: register → create → add components → update systems", () => {
      const world = createWorld();
      const log = [];

      class MovementSystem extends System {
        static query = { all: [Position, Velocity] };
        update(w, dt) {
          const tables = w.queryEngine.getTables(this.query);
          for (let t = 0; t < tables.length; t++) {
            const table = tables[t];
            const entities = table.entityIds;
            const posX = table.getColumn(w.registry.getId(Position), "x");
            const posY = table.getColumn(w.registry.getId(Position), "y");
            const velX = table.getColumn(w.registry.getId(Velocity), "vx");
            const velY = table.getColumn(w.registry.getId(Velocity), "vy");
            for (let r = 0; r < table.count; r++) {
              posX[r] += velX[r] * dt;
              posY[r] += velY[r] * dt;
              log.push({ entity: entities[r], x: posX[r], y: posY[r] });
            }
          }
        }
      }

      world.addSystem(new MovementSystem());

      const e1 = world.createEntity();
      world.addComponent(e1, Position);
      world.addComponent(e1, Velocity);
      world.setComponent(e1, Position, { x: 10, y: 20 });
      world.setComponent(e1, Velocity, { vx: 1, vy: 2 });

      world.update(1);

      assert.strictEqual(log.length, 1);
      assert.strictEqual(log[0].entity, e1);
      assert.strictEqual(log[0].x, 11);
      assert.strictEqual(log[0].y, 22);
    });

    it("multiple entities with different components are correctly handled", () => {
      const world = createWorld();
      const moved = [];

      class MovementSystem extends System {
        static query = { all: [Position, Velocity] };
        update(w, dt) {
          const tables = w.queryEngine.getTables(this.query);
          for (let t = 0; t < tables.length; t++) {
            const table = tables[t];
            const entities = table.entityIds;
            const posX = table.getColumn(w.registry.getId(Position), "x");
            const velX = table.getColumn(w.registry.getId(Velocity), "vx");
            for (let r = 0; r < table.count; r++) {
              posX[r] += velX[r] * dt;
              moved.push(entities[r]);
            }
          }
        }
      }

      world.addSystem(new MovementSystem());

      const moving1 = world.createEntity();
      world.addComponent(moving1, Position);
      world.addComponent(moving1, Velocity);
      world.setComponent(moving1, Velocity, { vx: 5 });

      const moving2 = world.createEntity();
      world.addComponent(moving2, Position);
      world.addComponent(moving2, Velocity);
      world.setComponent(moving2, Velocity, { vx: 10 });

      const stationary = world.createEntity();
      world.addComponent(stationary, Position);

      world.update(1);

      assert.strictEqual(moved.length, 2);
      assert.ok(moved.includes(moving1));
      assert.ok(moved.includes(moving2));
      assert.ok(!moved.includes(stationary));
    });

    it("systems can read and write entity data through World API", () => {
      const world = createWorld();
      let posView = null;
      let targetEntity = null;

      class TestSystem extends System {
        update(w, dt) {
          if (targetEntity !== null) {
            posView = w.getComponent(targetEntity, Position);
          }
        }
      }

      world.addSystem(new TestSystem());

      const e = world.createEntity();
      targetEntity = e;
      world.addComponent(e, Position);
      world.setComponent(e, Position, { x: 99, y: 88 });

      world.update(16);

      assert.ok(posView);
      assert.strictEqual(posView.x, 99);
      assert.strictEqual(posView.y, 88);
    });

    it("system can access getTables for its compiled query", () => {
      const world = createWorld();
      let tablesLen = 0;

      class TestSystem extends System {
        static query = { all: [Health] };
        update(w, dt) {
          tablesLen = w.queryEngine.getTables(this.query).length;
        }
      }

      world.addSystem(new TestSystem());

      const e = world.createEntity();
      world.addComponent(e, Health);

      world.update(16);
      assert.strictEqual(tablesLen, 1);
    });
  });

  // ─── Error States ──────────────────────────────────────
  describe("error states", () => {
    it("rejects duplicate system via addSystem", () => {
      const world = createWorld();
      class TestSystem extends System { update(w, dt) {} }
      const system = new TestSystem();
      world.addSystem(system);
      assert.throws(() => world.addSystem(system), /already registered/);
    });

    it("rejects removing unregistered system", () => {
      const world = createWorld();
      class TestSystem extends System { update(w, dt) {} }
      assert.throws(() => world.removeSystem(new TestSystem()), /not registered/);
    });

    it("rejects recursive update", () => {
      const world = createWorld();
      class Recursive extends System {
        update(w, dt) { w.update(dt); }
      }
      world.addSystem(new Recursive());
      assert.throws(() => world.update(16), /recursive update/);
    });

    it("rejects adding system during update", () => {
      const world = createWorld();
      class Adder extends System {
        update(w, dt) { w.addSystem(new Adder()); }
      }
      world.addSystem(new Adder());
      assert.throws(() => world.update(16), /cannot add systems during update/);
    });

    it("rejects removing system during update", () => {
      const world = createWorld();
      class Remover extends System {
        update(w, dt) { w.removeSystem(this); }
      }
      world.addSystem(new Remover());
      assert.throws(() => world.update(16), /cannot remove systems during update/);
    });

    it("rejects clearing systems during update", () => {
      const world = createWorld();
      class Clearer extends System {
        update(w, dt) { w.clearSystems(); }
      }
      world.addSystem(new Clearer());
      assert.throws(() => world.update(16), /cannot clear systems during update/);
    });

    it("isAlive returns false for entity 0", () => {
      const world = createWorld();
      assert.strictEqual(world.isAlive(0), false);
    });

    it("destroyEntity is no-op for dead entity", () => {
      const world = createWorld();
      world.destroyEntity(99999);
    });

    it("hasComponent returns false for dead entity", () => {
      const world = createWorld();
      assert.strictEqual(world.hasComponent(99999, Position), false);
    });

    it("addComponent throws for dead entity", () => {
      const world = createWorld();
      assert.throws(() => world.addComponent(99999, Position), /not alive/);
    });

    it("getComponent throws for dead entity", () => {
      const world = createWorld();
      assert.throws(() => world.getComponent(99999, Position), /not alive/);
    });

    it("setComponent throws for dead entity", () => {
      const world = createWorld();
      assert.throws(() => world.setComponent(99999, Position, { x: 0 }), /not alive/);
    });
  });

  // ─── Runtime Invariants ────────────────────────────────
  describe("runtime invariants", () => {
    it("cannot mutate system list during update via addSystem", () => {
      const world = createWorld();
      class EvilSystem extends System {
        update(w, dt) {
          class Inner extends System { update(w2, dt2) {} }
          w.addSystem(new Inner());
        }
      }
      world.addSystem(new EvilSystem());
      assert.throws(() => world.update(16), /cannot add systems during update/);
    });

    it("scheduler.world is always the same world instance", () => {
      const world = createWorld();
      let seen = null;
      class TestSystem extends System {
        update(w, dt) { seen = w; }
      }
      world.addSystem(new TestSystem());
      world.update(16);
      assert.strictEqual(seen, world);
      assert.strictEqual(seen.scheduler.world, world);
    });

    it("version increments when new archetypes are created", () => {
      const world = createWorld();
      const v0 = world.archetypeSystem.version;

      const e = world.createEntity();
      world.addComponent(e, Position);
      const v1 = world.archetypeSystem.version;

      assert.ok(v1 > v0);
    });

    it("version does not increment for existing archetype", () => {
      const world = createWorld();
      const e1 = world.createEntity();
      world.addComponent(e1, Position);
      const v1 = world.archetypeSystem.version;

      const e2 = world.createEntity();
      world.addComponent(e2, Position);
      const v2 = world.archetypeSystem.version;

      assert.strictEqual(v2, v1);
    });
  });

  // ─── No Per-Frame Allocations ──────────────────────────
  describe("no per-frame allocations", () => {
    it("does not sort every update when no systems change", () => {
      const world = createWorld();
      class TestSystem extends System {
        update(w, dt) {}
      }
      world.addSystem(new TestSystem());

      world.update(16);
      world.update(16);
      world.update(16);

      assert.strictEqual(world.scheduler._needsSort, false);
    });

    it("re-sorts after adding a new system", () => {
      const world = createWorld();
      class A extends System { update(w, dt) {} }
      class B extends System { update(w, dt) {} }

      world.addSystem(new A());
      world.update(16);
      assert.strictEqual(world.scheduler._needsSort, false);

      world.addSystem(new B());
      assert.strictEqual(world.scheduler._needsSort, true);

      world.update(16);
      assert.strictEqual(world.scheduler._needsSort, false);
    });
  });

  // ─── Archetype System Wiring ───────────────────────────
  describe("archetype system wiring", () => {
    it("onArchetypeCreated callback is set on archetypeSystem", () => {
      const world = createWorld();
      assert.strictEqual(typeof world.archetypeSystem.onArchetypeCreated, "function");
    });

    it("onArchetypeCreated receives the archetype object", () => {
      const world = createWorld();
      let received = null;
      const original = world.queryEngine.onArchetypeCreated;
      world.queryEngine.onArchetypeCreated = (arch) => { received = arch; };

      const e = world.createEntity();
      world.addComponent(e, Position);

      assert.ok(received);
      assert.ok(received.id);
      assert.ok(received.signature);
      assert.ok(received.table);

      world.queryEngine.onArchetypeCreated = original;
    });

    it("onArchetypeCreated is called for multiple new archetypes", () => {
      const world = createWorld();
      const ids = [];
      const original = world.queryEngine.onArchetypeCreated;
      world.queryEngine.onArchetypeCreated = (arch) => { ids.push(arch.id); };

      const e = world.createEntity();
      world.addComponent(e, Position);
      world.addComponent(e, Velocity);
      world.addComponent(e, Health);

      assert.strictEqual(ids.length, 3);

      world.queryEngine.onArchetypeCreated = original;
    });
  });
});
