import { describe, it } from "node:test";
import * as assert from "node:assert";
import { ComponentRegistry } from "../../../ecs/core/ComponentRegistry.js";
import { ComponentSignature } from "../../../ecs/core/ComponentSignature.js";
import { EntityManager } from "../../../ecs/core/EntityManager.js";
import { ArchetypeSystem } from "../../../ecs/core/ArchetypeSystem.js";
import { QueryEngine } from "../../../ecs/core/QueryEngine.js";
import { System } from "../../../ecs/core/System.js";
import { SystemScheduler } from "../../../ecs/core/SystemScheduler.js";

class Transform { static schema = { x: "f32", y: "f32" }; }
class Velocity { static schema = { vx: "f32", vy: "f32" }; }
class Health { static schema = { hp: "u32" }; }
class Sprite { static schema = { texture: "u32" }; }
class Sleeping {}
class Enemy {}

function createFixture(extraComponents) {
  const registry = new ComponentRegistry();

  registry.register(Transform);
  registry.register(Velocity);
  registry.register(Health);
  registry.register(Sprite);
  registry.register(Sleeping);
  registry.register(Enemy);

  if (extraComponents) {
    for (const comp of extraComponents) {
      registry.register(comp);
    }
  }

  registry.lock();

  const entityManager = new EntityManager({ initialCapacity: 64, maxEntities: 10000 });
  const archetypeSystem = new ArchetypeSystem(registry, entityManager);
  const queryEngine = new QueryEngine(archetypeSystem);
  const scheduler = new SystemScheduler(queryEngine, registry);

  const world = { registry, entityManager, archetypeSystem, queryEngine, scheduler };
  scheduler.world = world;

  const ids = {
    Transform: registry.getId(Transform),
    Velocity: registry.getId(Velocity),
    Health: registry.getId(Health),
    Sprite: registry.getId(Sprite),
    Sleeping: registry.getId(Sleeping),
    Enemy: registry.getId(Enemy),
  };

  return { registry, entityManager, archetypeSystem, queryEngine, scheduler, world, ids };
}

function createArchetype(fixture, componentIds) {
  const { archetypeSystem } = fixture;
  const sig = new ComponentSignature(componentIds);
  return archetypeSystem.createArchetype(sig);
}

describe("SystemScheduler", () => {
  // ─── Constructor ────────────────────────────────────────

  describe("constructor", () => {
    it("creates a scheduler with valid dependencies", () => {
      const { queryEngine, registry } = createFixture();
      const s = new SystemScheduler(queryEngine, registry);
      assert.ok(s instanceof SystemScheduler);
    });

    it("throws for null queryEngine", () => {
      const { registry } = createFixture();
      assert.throws(
        () => new SystemScheduler(null, registry),
        { name: "TypeError" }
      );
    });

    it("throws for null componentRegistry", () => {
      const { queryEngine } = createFixture();
      assert.throws(
        () => new SystemScheduler(queryEngine, null),
        { name: "TypeError" }
      );
    });

    it("starts with zero systems", () => {
      const { scheduler } = createFixture();
      assert.strictEqual(scheduler.systemCount, 0);
    });
  });

  // ─── Registration ──────────────────────────────────────

  describe("add", () => {
    it("registers a system", () => {
      const { scheduler } = createFixture();
      class TestSystem extends System {}
      scheduler.add(new TestSystem());
      assert.strictEqual(scheduler.systemCount, 1);
    });

    it("rejects duplicate systems", () => {
      const { scheduler } = createFixture();
      class TestSystem extends System {}
      const system = new TestSystem();
      scheduler.add(system);
      assert.throws(
        () => scheduler.add(system),
        /already registered/
      );
    });

    it("rejects non-System instances", () => {
      const { scheduler } = createFixture();
      assert.throws(
        () => scheduler.add({}),
        { name: "TypeError" }
      );
      assert.throws(
        () => scheduler.add(null),
        { name: "TypeError" }
      );
      assert.throws(
        () => scheduler.add("foo"),
        { name: "TypeError" }
      );
    });

    it("rejects adding during update", () => {
      const { scheduler } = createFixture();
      class TestSystem extends System {
        update(ctx, dt) {
          const s = new TestSystem();
          scheduler.add(s);
        }
      }
      scheduler.add(new TestSystem());
      assert.throws(
        () => scheduler.update(16),
        /cannot add systems during update/
      );
    });
  });

  describe("remove", () => {
    it("removes a registered system", () => {
      const { scheduler } = createFixture();
      class TestSystem extends System {}
      const system = new TestSystem();
      scheduler.add(system);
      scheduler.remove(system);
      assert.strictEqual(scheduler.systemCount, 0);
    });

    it("throws for unregistered system", () => {
      const { scheduler } = createFixture();
      class TestSystem extends System {}
      assert.throws(
        () => scheduler.remove(new TestSystem()),
        /not registered/
      );
    });

    it("rejects removing during update", () => {
      const { scheduler } = createFixture();
      class RemoveSystem extends System {
        update(ctx, dt) {
          scheduler.remove(this);
        }
      }
      scheduler.add(new RemoveSystem());
      assert.throws(
        () => scheduler.update(16),
        /cannot remove systems during update/
      );
    });
  });

  describe("has", () => {
    it("returns true for registered system", () => {
      const { scheduler } = createFixture();
      class TestSystem extends System {}
      const system = new TestSystem();
      scheduler.add(system);
      assert.strictEqual(scheduler.has(system), true);
    });

    it("returns false for unregistered system", () => {
      const { scheduler } = createFixture();
      class TestSystem extends System {}
      assert.strictEqual(scheduler.has(new TestSystem()), false);
    });

    it("returns false after removal", () => {
      const { scheduler } = createFixture();
      class TestSystem extends System {}
      const system = new TestSystem();
      scheduler.add(system);
      scheduler.remove(system);
      assert.strictEqual(scheduler.has(system), false);
    });
  });

  describe("clear", () => {
    it("removes all systems", () => {
      const { scheduler } = createFixture();
      class A extends System {}
      class B extends System {}
      scheduler.add(new A());
      scheduler.add(new B());
      scheduler.clear();
      assert.strictEqual(scheduler.systemCount, 0);
    });

    it("rejects clearing during update", () => {
      const { scheduler } = createFixture();
      class ClearSystem extends System {
        update(ctx, dt) {
          scheduler.clear();
        }
      }
      scheduler.add(new ClearSystem());
      assert.throws(
        () => scheduler.update(16),
        /cannot clear systems during update/
      );
    });
  });

  describe("systemCount", () => {
    it("reflects the number of registered systems", () => {
      const { scheduler } = createFixture();
      class A extends System {}
      class B extends System {}
      class C extends System {}
      assert.strictEqual(scheduler.systemCount, 0);
      scheduler.add(new A());
      assert.strictEqual(scheduler.systemCount, 1);
      scheduler.add(new B());
      assert.strictEqual(scheduler.systemCount, 2);
      scheduler.add(new C());
      assert.strictEqual(scheduler.systemCount, 3);
      scheduler.remove(scheduler._systems[0]);
      assert.strictEqual(scheduler.systemCount, 2);
    });
  });

  // ─── Query Compilation ────────────────────────────────

  describe("query compilation", () => {
    it("compiles a system query with component classes", () => {
      class A { static schema = { x: "f32" }; }
      const { scheduler } = createFixture([A]);
      const ids = { A: scheduler._componentRegistry.getId(A) };

      class TestSystem extends System {
        static query = { all: [A] };
      }

      const system = new TestSystem();
      scheduler.add(system);

      assert.ok(system.query);
      assert.strictEqual(system.query.all.contains(ids.A), true);
    });

    it("compiles a system with any and none", () => {
      class A { static schema = { v: "f32" }; }
      class B {}
      class C {}
      const { scheduler } = createFixture([A, B, C]);
      const ids = {
        A: scheduler._componentRegistry.getId(A),
        B: scheduler._componentRegistry.getId(B),
        C: scheduler._componentRegistry.getId(C),
      };

      class TestSystem extends System {
        static query = { all: [A], any: [B], none: [C] };
      }

      const system = new TestSystem();
      scheduler.add(system);

      assert.ok(system.query);
      assert.strictEqual(system.query.all.size, 1);
      assert.strictEqual(system.query.any.size, 1);
      assert.strictEqual(system.query.none.size, 1);
    });

    it("does not compile if system has no query", () => {
      const { scheduler } = createFixture();
      class TestSystem extends System {}
      const system = new TestSystem();
      scheduler.add(system);
      assert.strictEqual(system.query, null);
    });

    it("reuses cached queries for same component filter", () => {
      class A { static schema = { v: "f32" }; }
      const { scheduler } = createFixture([A]);

      class SysA extends System {
        static query = { all: [A] };
      }
      class SysB extends System {
        static query = { all: [A] };
      }

      const sysA = new SysA();
      const sysB = new SysB();
      scheduler.add(sysA);
      scheduler.add(sysB);

      assert.strictEqual(sysA.query, sysB.query);
    });

    it("throws for unregistered component in query", () => {
      const { scheduler } = createFixture();
      class Unregistered {}
      class TestSystem extends System {
        static query = { all: [Unregistered] };
      }
      const system = new TestSystem();
      assert.throws(
        () => scheduler.add(system),
        /not registered/
      );
    });
  });

  // ─── Ordering ──────────────────────────────────────────

  describe("ordering", () => {
    it("executes systems in ascending priority order", () => {
      const { scheduler } = createFixture();
      const order = [];

      class LowPri extends System {
        static priority = 0;
        update(ctx, dt) { order.push("low"); }
      }
      class HighPri extends System {
        static priority = 100;
        update(ctx, dt) { order.push("high"); }
      }
      class MidPri extends System {
        static priority = 50;
        update(ctx, dt) { order.push("mid"); }
      }

      scheduler.add(new LowPri());
      scheduler.add(new HighPri());
      scheduler.add(new MidPri());
      scheduler.update(16);

      assert.deepStrictEqual(order, ["low", "mid", "high"]);
    });

    it("maintains stable registration order for same priority", () => {
      const { scheduler } = createFixture();
      const order = [];

      class SysA extends System {
        static priority = 0;
        update(ctx, dt) { order.push("A"); }
      }
      class SysB extends System {
        static priority = 0;
        update(ctx, dt) { order.push("B"); }
      }
      class SysC extends System {
        static priority = 0;
        update(ctx, dt) { order.push("C"); }
      }

      scheduler.add(new SysA());
      scheduler.add(new SysB());
      scheduler.add(new SysC());
      scheduler.update(16);

      assert.deepStrictEqual(order, ["A", "B", "C"]);
    });

    it("supports negative priorities", () => {
      const { scheduler } = createFixture();
      const order = [];

      class Normal extends System {
        static priority = 0;
        update(ctx, dt) { order.push("normal"); }
      }
      class Early extends System {
        static priority = -100;
        update(ctx, dt) { order.push("early"); }
      }

      scheduler.add(new Normal());
      scheduler.add(new Early());
      scheduler.update(16);

      assert.deepStrictEqual(order, ["early", "normal"]);
    });

    it("remove and re-add places system at end of priority group", () => {
      const { scheduler } = createFixture();
      const order = [];

      class SysA extends System {
        static priority = 0;
        update(ctx, dt) { order.push("A"); }
      }
      class SysB extends System {
        static priority = 0;
        update(ctx, dt) { order.push("B"); }
      }
      class SysC extends System {
        static priority = 0;
        update(ctx, dt) { order.push("C"); }
      }

      const a = new SysA();
      const b = new SysB();
      const c = new SysC();
      scheduler.add(a);
      scheduler.add(b);
      scheduler.add(c);
      scheduler.remove(b);
      scheduler.add(b);
      scheduler.update(16);

      assert.deepStrictEqual(order, ["A", "C", "B"]);
    });
  });

  // ─── Execution ─────────────────────────────────────────

  describe("execution", () => {
    it("calls update on registered systems", () => {
      const { scheduler } = createFixture();
      let called = false;

      class TestSystem extends System {
        update(ctx, dt) { called = true; }
      }

      scheduler.add(new TestSystem());
      scheduler.update(16);

      assert.strictEqual(called, true);
    });

    it("forwards correct dt to systems", () => {
      const { scheduler } = createFixture();
      let receivedDt = -1;

      class TestSystem extends System {
        update(ctx, dt) { receivedDt = dt; }
      }

      scheduler.add(new TestSystem());
      scheduler.update(42.5);

      assert.strictEqual(receivedDt, 42.5);
    });

    it("forwards world to systems", () => {
      const { scheduler, world } = createFixture();
      let receivedWorld = null;

      class TestSystem extends System {
        update(ctx, dt) { receivedWorld = ctx.world; }
      }

      scheduler.add(new TestSystem());
      scheduler.update(16);

      assert.strictEqual(receivedWorld, world);
    });

    it("skips disabled systems", () => {
      const { scheduler } = createFixture();
      let called = false;

      class TestSystem extends System {
        update(ctx, dt) { called = true; }
      }

      const system = new TestSystem();
      system.enabled = false;
      scheduler.add(system);
      scheduler.update(16);

      assert.strictEqual(called, false);
    });

    it("executes multiple systems", () => {
      const { scheduler } = createFixture();
      const executed = [];

      class SysA extends System {
        update(ctx, dt) { executed.push("A"); }
      }
      class SysB extends System {
        update(ctx, dt) { executed.push("B"); }
      }

      scheduler.add(new SysA());
      scheduler.add(new SysB());
      scheduler.update(16);

      assert.deepStrictEqual(executed, ["A", "B"]);
    });

    it("executes system with no query definition", () => {
      const { scheduler } = createFixture();
      let called = false;

      class TestSystem extends System {
        update(ctx, dt) { called = true; }
      }

      scheduler.add(new TestSystem());
      scheduler.update(16);

      assert.strictEqual(called, true);
    });

    it("allows systems to access matching tables via query and queryEngine", () => {
      const f = createFixture();
      createArchetype(f, [f.ids.Transform, f.ids.Velocity]);
      createArchetype(f, [f.ids.Transform]);
      createArchetype(f, [f.ids.Sprite]);

      let tableCount = 0;

      class TestSystem extends System {
        static query = { all: [Transform] };
        update(ctx, dt) {
          const tables = ctx.world.queryEngine.getTables(this.query);
          tableCount = tables.length;
        }
      }

      f.scheduler.add(new TestSystem());
      f.scheduler.update(16);

      assert.strictEqual(tableCount, 2);
    });

    it("system with no query definition executes without error", () => {
      const f = createFixture();
      createArchetype(f, [f.ids.Transform]);
      createArchetype(f, [f.ids.Velocity]);
      createArchetype(f, [f.ids.Sleeping]);

      let executed = false;

      class SimpleSystem extends System {
        update(ctx, dt) {
          executed = true;
        }
      }

      f.scheduler.add(new SimpleSystem());
      f.scheduler.update(16);

      assert.strictEqual(executed, true);
    });
  });

  // ─── Lifecycle ─────────────────────────────────────────

  describe("lifecycle", () => {
    it("calls onAdded once when system is added with world set", () => {
      const { scheduler, world } = createFixture();
      let callCount = 0;
      let receivedWorld = null;

      class TestSystem extends System {
        onAdded(w) {
          callCount++;
          receivedWorld = w;
        }
      }

      const system = new TestSystem();
      scheduler.add(system);

      assert.strictEqual(callCount, 1);
      assert.strictEqual(receivedWorld, world);
    });

    it("calls onRemoved once when system is removed", () => {
      const { scheduler, world } = createFixture();
      let callCount = 0;
      let receivedWorld = null;

      class TestSystem extends System {
        onRemoved(w) {
          callCount++;
          receivedWorld = w;
        }
      }

      const system = new TestSystem();
      scheduler.add(system);
      scheduler.remove(system);

      assert.strictEqual(callCount, 1);
      assert.strictEqual(receivedWorld, world);
    });

    it("calls onRemoved for all systems on clear", () => {
      const { scheduler, world } = createFixture();
      const calls = [];

      class SysA extends System {
        onRemoved(w) { calls.push("A"); }
      }
      class SysB extends System {
        onRemoved(w) { calls.push("B"); }
      }

      scheduler.add(new SysA());
      scheduler.add(new SysB());
      scheduler.clear();

      assert.deepStrictEqual(calls, ["A", "B"]);
    });

    it("does not call onAdded if world is not set", () => {
      const { queryEngine, registry } = createFixture();
      const s = new SystemScheduler(queryEngine, registry);
      let callCount = 0;

      class TestSystem extends System {
        onAdded(w) { callCount++; }
      }

      s.add(new TestSystem());
      assert.strictEqual(callCount, 0);

      // Setting world later does not retroactively call onAdded
      s.world = { mock: true };
      assert.strictEqual(callCount, 0);
    });
  });

  // ─── Error Paths ───────────────────────────────────────

  describe("error paths", () => {
    it("update throws if world is not set", () => {
      const { queryEngine, registry } = createFixture();
      const scheduler = new SystemScheduler(queryEngine, registry);

      class TestSystem extends System {}
      scheduler.add(new TestSystem());

      assert.throws(
        () => scheduler.update(16),
        /world reference is not set/
      );
    });

    it("update throws on recursive call", () => {
      const { scheduler } = createFixture();
      class RecursiveSystem extends System {
        update(ctx, dt) {
          scheduler.update(dt);
        }
      }
      scheduler.add(new RecursiveSystem());
      assert.throws(
        () => scheduler.update(16),
        /recursive update/
      );
    });

    it("rejects invalid query definition with unregistered component", () => {
      const { scheduler } = createFixture();
      class FakeComponent {}
      class TestSystem extends System {
        static query = { all: [FakeComponent] };
      }
      assert.throws(
        () => scheduler.add(new TestSystem()),
        /not registered/
      );
    });
  });

  // ─── No Steady-State Allocations ───────────────────────

  describe("no per-frame allocations", () => {
    it("does not sort every update when no systems change", () => {
      const { scheduler } = createFixture();
      let sortCalled = 0;

      class TestSystem extends System {
        update(ctx, dt) {}
      }

      scheduler.add(new TestSystem());

      scheduler.update(16);
      scheduler.update(16);
      scheduler.update(16);

      // After the first update sorts, _needsSort is false
      // and _sortSystems is not called again
      assert.strictEqual(scheduler._needsSort, false);
    });
  });
});
