import { describe, it } from "node:test";
import * as assert from "node:assert";
import { ComponentRegistry } from "../../../ecs/core/ComponentRegistry.js";
import { ComponentSignature } from "../../../ecs/core/ComponentSignature.js";
import { EntityManager } from "../../../ecs/core/EntityManager.js";
import { ArchetypeSystem } from "../../../ecs/core/ArchetypeSystem.js";
import { QueryEngine } from "../../../ecs/core/QueryEngine.js";

function createFixture() {
  const registry = new ComponentRegistry();

  class Transform { static schema = { x: "f32", y: "f32" }; }
  class Velocity { static schema = { vx: "f32", vy: "f32" }; }
  class Health { static schema = { hp: "u32", maxHp: "u32" }; }
  class Sprite { static schema = { texture: "u32", width: "f32", height: "f32" }; }
  class Mesh { static schema = { vertexCount: "u32" }; }
  class Sleeping {}
  class Enemy {}
  class Player {}

  registry.register(Transform);
  registry.register(Velocity);
  registry.register(Health);
  registry.register(Sprite);
  registry.register(Mesh);
  registry.register(Sleeping);
  registry.register(Enemy);
  registry.register(Player);
  registry.lock();

  const entityManager = new EntityManager({ initialCapacity: 64, maxEntities: 10000 });
  const archetypeSystem = new ArchetypeSystem(registry, entityManager);
  const queryEngine = new QueryEngine(archetypeSystem);

  const ids = {
    Transform: registry.getId(Transform),
    Velocity: registry.getId(Velocity),
    Health: registry.getId(Health),
    Sprite: registry.getId(Sprite),
    Mesh: registry.getId(Mesh),
    Sleeping: registry.getId(Sleeping),
    Enemy: registry.getId(Enemy),
    Player: registry.getId(Player),
  };

  return { registry, entityManager, archetypeSystem, queryEngine, ids };
}

function createArchetype(fixture, componentIds, existing = {}) {
  const { archetypeSystem } = fixture;
  const sig = new ComponentSignature(componentIds);
  return archetypeSystem.createArchetype(sig);
}

function qid(queryEngine, ids, config) {
  const resolved = {};
  if (config.all) resolved.all = config.all.map(id => ids[id]);
  if (config.any) resolved.any = config.any.map(id => ids[id]);
  if (config.none) resolved.none = config.none.map(id => ids[id]);
  return queryEngine.createQuery(resolved);
}

describe("QueryEngine", () => {
  // ─── Construction ────────────────────────────────────────

  describe("constructor", () => {
    it("creates a QueryEngine with a valid ArchetypeSystem", () => {
      const { archetypeSystem } = createFixture();
      const qe = new QueryEngine(archetypeSystem);
      assert.ok(qe instanceof QueryEngine);
    });

    it("throws for null archetypeSystem", () => {
      assert.throws(() => new QueryEngine(null), { name: "TypeError" });
    });

    it("throws for undefined archetypeSystem", () => {
      assert.throws(() => new QueryEngine(), { name: "TypeError" });
    });

    it("throws for object without version", () => {
      assert.throws(() => new QueryEngine({}), { name: "TypeError" });
    });

    it("throws for object without getSignature", () => {
      assert.throws(
        () => new QueryEngine({ version: 1 }),
        { name: "TypeError" }
      );
    });

    it("throws for object without getArchetypeById", () => {
      assert.throws(
        () => new QueryEngine({ version: 1, getSignature: () => {} }),
        { name: "TypeError" }
      );
    });
  });

  // ─── Query Creation ─────────────────────────────────────

  describe("createQuery", () => {
    it("creates a query with only 'all' components", () => {
      const { queryEngine, ids } = createFixture();
      const query = qid(queryEngine, ids, { all: ["Transform", "Velocity"] });
      assert.ok(query);
      assert.ok(query.all instanceof ComponentSignature);
      assert.ok(query.any instanceof ComponentSignature);
      assert.ok(query.none instanceof ComponentSignature);
      assert.strictEqual(query.all.size, 2);
      assert.strictEqual(query.any.size, 0);
      assert.strictEqual(query.none.size, 0);
    });

    it("creates a query with only 'any' components", () => {
      const { queryEngine, ids } = createFixture();
      const query = qid(queryEngine, ids, { any: ["Sprite", "Mesh"] });
      assert.ok(query);
      assert.strictEqual(query.all.size, 0);
      assert.strictEqual(query.any.size, 2);
      assert.strictEqual(query.none.size, 0);
    });

    it("creates a query with only 'none' components", () => {
      const { queryEngine, ids } = createFixture();
      const query = qid(queryEngine, ids, { none: ["Sleeping"] });
      assert.strictEqual(query.all.size, 0);
      assert.strictEqual(query.any.size, 0);
      assert.strictEqual(query.none.size, 1);
    });

    it("creates a query with all, any, and none combined", () => {
      const { queryEngine, ids } = createFixture();
      const query = qid(queryEngine, ids, {
        all: ["Transform"],
        any: ["Sprite", "Mesh"],
        none: ["Sleeping"],
      });
      assert.strictEqual(query.all.size, 1);
      assert.strictEqual(query.any.size, 2);
      assert.strictEqual(query.none.size, 1);
    });

    it("creates an empty (wildcard) query with no arguments", () => {
      const { queryEngine } = createFixture();
      const query = queryEngine.createQuery();
      assert.strictEqual(query.all.size, 0);
      assert.strictEqual(query.any.size, 0);
      assert.strictEqual(query.none.size, 0);
    });

    it("creates an empty (wildcard) query with empty object", () => {
      const { queryEngine } = createFixture();
      const query = queryEngine.createQuery({});
      assert.strictEqual(query.all.size, 0);
      assert.strictEqual(query.any.size, 0);
      assert.strictEqual(query.none.size, 0);
    });

    it("creates a query with only 'all' as empty array", () => {
      const { queryEngine } = createFixture();
      const query = queryEngine.createQuery({ all: [] });
      assert.strictEqual(query.all.size, 0);
    });

    it("assigns monotonic query IDs", () => {
      const { queryEngine, ids } = createFixture();
      const q1 = qid(queryEngine, ids, { all: ["Transform"] });
      const q2 = qid(queryEngine, ids, { all: ["Velocity"] });
      const q3 = qid(queryEngine, ids, { all: ["Health"] });
      assert.strictEqual(q2.id, q1.id + 1);
      assert.strictEqual(q3.id, q2.id + 1);
    });

    it("throws for impossible query where all and none overlap", () => {
      const { queryEngine, ids } = createFixture();
      assert.throws(
        () => qid(queryEngine, ids, { all: ["Transform"], none: ["Transform"] }),
        /appears in both/
      );
    });

    it("throws for impossible query where any and none overlap", () => {
      const { queryEngine, ids } = createFixture();
      assert.throws(
        () => qid(queryEngine, ids, { any: ["Transform"], none: ["Transform"] }),
        /appears in both/
      );
    });
  });

  // ─── Canonicalization ───────────────────────────────────

  describe("canonicalization", () => {
    it("different input orders produce the same cached query for 'all'", () => {
      const { queryEngine, ids } = createFixture();
      const q1 = qid(queryEngine, ids, { all: ["Transform", "Velocity", "Health"] });
      const q2 = qid(queryEngine, ids, { all: ["Health", "Transform", "Velocity"] });
      assert.strictEqual(q1, q2);
    });

    it("different input orders produce the same cached query for 'any'", () => {
      const { queryEngine, ids } = createFixture();
      const q1 = qid(queryEngine, ids, { any: ["Sprite", "Mesh", "Enemy"] });
      const q2 = qid(queryEngine, ids, { any: ["Mesh", "Enemy", "Sprite"] });
      assert.strictEqual(q1, q2);
    });

    it("duplicate IDs in input collapse to the same cache entry", () => {
      const { queryEngine, ids } = createFixture();
      const q1 = qid(queryEngine, ids, { all: ["Transform", "Velocity", "Transform"] });
      const q2 = qid(queryEngine, ids, { all: ["Transform", "Velocity"] });
      assert.strictEqual(q1, q2);
    });
  });

  // ─── Cache Behavior ─────────────────────────────────────

  describe("query cache", () => {
    it("same query filter returns the same object (===)", () => {
      const { queryEngine, ids } = createFixture();
      const q1 = qid(queryEngine, ids, { all: ["Transform"] });
      const q2 = qid(queryEngine, ids, { all: ["Transform"] });
      assert.strictEqual(q1, q2);
    });

    it("different query filters return different objects", () => {
      const { queryEngine, ids } = createFixture();
      const q1 = qid(queryEngine, ids, { all: ["Transform"] });
      const q2 = qid(queryEngine, ids, { all: ["Velocity"] });
      assert.notStrictEqual(q1, q2);
    });

    it("query with same all and none returns the same object", () => {
      const { queryEngine, ids } = createFixture();
      const q1 = qid(queryEngine, ids, { all: ["Transform"], none: ["Sleeping"] });
      const q2 = qid(queryEngine, ids, { all: ["Transform"], none: ["Sleeping"] });
      assert.strictEqual(q1, q2);
    });

    it("empty wildcard query is cached", () => {
      const { queryEngine } = createFixture();
      const q1 = queryEngine.createQuery();
      const q2 = queryEngine.createQuery();
      assert.strictEqual(q1, q2);
    });
  });

  // ─── Query Immutability ─────────────────────────────────

  describe("query immutability", () => {
    it("query object is frozen", () => {
      const { queryEngine, ids } = createFixture();
      const query = qid(queryEngine, ids, { all: ["Transform"] });
      assert.ok(Object.isFrozen(query));
    });

    it("cannot modify query properties", () => {
      const { queryEngine, ids } = createFixture();
      const query = qid(queryEngine, ids, { all: ["Transform"] });
      assert.throws(() => { query.foo = "bar"; });
    });

    it("all signature is frozen", () => {
      const { queryEngine, ids } = createFixture();
      const query = qid(queryEngine, ids, { all: ["Transform"] });
      assert.ok(Object.isFrozen(query.all));
    });

    it("any signature is frozen", () => {
      const { queryEngine, ids } = createFixture();
      const query = qid(queryEngine, ids, { any: ["Sprite"] });
      assert.ok(Object.isFrozen(query.any));
    });

    it("none signature is frozen", () => {
      const { queryEngine, ids } = createFixture();
      const query = qid(queryEngine, ids, { none: ["Sleeping"] });
      assert.ok(Object.isFrozen(query.none));
    });
  });

  // ─── Matching ───────────────────────────────────────────

  describe("matching", () => {
    it("matches archetype with all required components", () => {
      const f = createFixture();
      const arch = createArchetype(f, [f.ids.Transform, f.ids.Velocity, f.ids.Health]);
      const query = qid(f.queryEngine, f.ids, { all: ["Transform", "Velocity"] });
      assert.ok(f.queryEngine.matches(arch.signature, query));
    });

    it("rejects archetype missing a required component in 'all'", () => {
      const f = createFixture();
      const arch = createArchetype(f, [f.ids.Transform]);
      const query = qid(f.queryEngine, f.ids, { all: ["Transform", "Velocity"] });
      assert.ok(!f.queryEngine.matches(arch.signature, query));
    });

    it("matches archetype with at least one 'any' component", () => {
      const f = createFixture();
      const arch = createArchetype(f, [f.ids.Transform, f.ids.Sprite]);
      const query = qid(f.queryEngine, f.ids, { any: ["Sprite", "Mesh"] });
      assert.ok(f.queryEngine.matches(arch.signature, query));
    });

    it("rejects archetype with none of the 'any' components", () => {
      const f = createFixture();
      const arch = createArchetype(f, [f.ids.Transform]);
      const query = qid(f.queryEngine, f.ids, { any: ["Sprite", "Mesh"] });
      assert.ok(!f.queryEngine.matches(arch.signature, query));
    });

    it("rejects archetype with a 'none' component", () => {
      const f = createFixture();
      const arch = createArchetype(f, [f.ids.Transform, f.ids.Sleeping]);
      const query = qid(f.queryEngine, f.ids, { none: ["Sleeping"] });
      assert.ok(!f.queryEngine.matches(arch.signature, query));
    });

    it("matches archetype without any 'none' components", () => {
      const f = createFixture();
      const arch = createArchetype(f, [f.ids.Transform]);
      const query = qid(f.queryEngine, f.ids, { none: ["Sleeping"] });
      assert.ok(f.queryEngine.matches(arch.signature, query));
    });

    it("matches archetype with combined all, any, none", () => {
      const f = createFixture();
      const arch = createArchetype(f, [
        f.ids.Transform, f.ids.Velocity, f.ids.Sprite,
      ]);
      const query = qid(f.queryEngine, f.ids, {
        all: ["Transform"],
        any: ["Sprite", "Mesh"],
        none: ["Sleeping"],
      });
      assert.ok(f.queryEngine.matches(arch.signature, query));
    });

    it("rejects archetype when combined query fails the 'none' check", () => {
      const f = createFixture();
      const arch = createArchetype(f, [
        f.ids.Transform, f.ids.Velocity, f.ids.Sleeping,
      ]);
      const query = qid(f.queryEngine, f.ids, {
        all: ["Transform"],
        any: ["Sprite", "Mesh"],
        none: ["Sleeping"],
      });
      assert.ok(!f.queryEngine.matches(arch.signature, query));
    });

    it("empty archetype matches wildcard query", () => {
      const f = createFixture();
      const emptySig = new ComponentSignature([]);
      const wildcard = f.queryEngine.createQuery();
      assert.ok(f.queryEngine.matches(emptySig, wildcard));
    });

    it("empty archetype does not match query with 'all'", () => {
      const f = createFixture();
      const emptySig = new ComponentSignature([]);
      const query = qid(f.queryEngine, f.ids, { all: ["Transform"] });
      assert.ok(!f.queryEngine.matches(emptySig, query));
    });

    it("tag-only archetype matches tag-specific query", () => {
      const f = createFixture();
      const arch = createArchetype(f, [f.ids.Enemy]);
      const query = qid(f.queryEngine, f.ids, { all: ["Enemy"] });
      assert.ok(f.queryEngine.matches(arch.signature, query));
    });

    it("tag-only archetype rejected by query requiring field component", () => {
      const f = createFixture();
      const arch = createArchetype(f, [f.ids.Enemy]);
      const query = qid(f.queryEngine, f.ids, { all: ["Transform"] });
      assert.ok(!f.queryEngine.matches(arch.signature, query));
    });

    it("wildcard query with empty any matches all archetypes", () => {
      const f = createFixture();
      const arch1 = createArchetype(f, [f.ids.Transform, f.ids.Velocity]);
      const arch2 = createArchetype(f, [f.ids.Sprite, f.ids.Mesh]);
      const arch3 = createArchetype(f, [f.ids.Enemy]);
      const wildcard = f.queryEngine.createQuery();
      assert.ok(f.queryEngine.matches(arch1.signature, wildcard));
      assert.ok(f.queryEngine.matches(arch2.signature, wildcard));
      assert.ok(f.queryEngine.matches(arch3.signature, wildcard));
    });

    it("query with only none matches archetypes without those components", () => {
      const f = createFixture();
      const archOk = createArchetype(f, [f.ids.Transform]);
      const archBad = createArchetype(f, [f.ids.Sleeping]);
      const query = qid(f.queryEngine, f.ids, { none: ["Sleeping"] });
      assert.ok(f.queryEngine.matches(archOk.signature, query));
      assert.ok(!f.queryEngine.matches(archBad.signature, query));
    });

    it("query with only any matches archetypes with at least one of those", () => {
      const f = createFixture();
      const archOk = createArchetype(f, [f.ids.Sprite]);
      const archBad = createArchetype(f, [f.ids.Transform]);
      const query = qid(f.queryEngine, f.ids, { any: ["Sprite", "Mesh"] });
      assert.ok(f.queryEngine.matches(archOk.signature, query));
      assert.ok(!f.queryEngine.matches(archBad.signature, query));
    });

    it("empty archetype matches none-only query", () => {
      const f = createFixture();
      const emptySig = new ComponentSignature([]);
      const query = qid(f.queryEngine, f.ids, { none: ["Sleeping"] });
      assert.ok(f.queryEngine.matches(emptySig, query));
    });

    it("empty archetype does not match any-only query", () => {
      const f = createFixture();
      const emptySig = new ComponentSignature([]);
      const query = qid(f.queryEngine, f.ids, { any: ["Sprite"] });
      assert.ok(!f.queryEngine.matches(emptySig, query));
    });
  });

  // ─── Archetype Cache ────────────────────────────────────

  describe("archetype cache", () => {
    it("initial query returns matching archetypes from existing archetypes", () => {
      const f = createFixture();
      createArchetype(f, [f.ids.Transform, f.ids.Velocity]);
      createArchetype(f, [f.ids.Transform]);
      createArchetype(f, [f.ids.Sprite]);

      const query = qid(f.queryEngine, f.ids, { all: ["Transform"] });
      const archetypes = f.queryEngine.getArchetypes(query);
      assert.strictEqual(archetypes.length, 2);
    });

    it("getTables returns matching tables", () => {
      const f = createFixture();
      createArchetype(f, [f.ids.Transform, f.ids.Velocity]);
      createArchetype(f, [f.ids.Transform]);

      const query = qid(f.queryEngine, f.ids, { all: ["Transform"] });
      const tables = f.queryEngine.getTables(query);
      assert.strictEqual(tables.length, 2);
      tables.forEach(t => assert.ok(t));
    });

    it("lazy rebuild after new archetype creation", () => {
      const f = createFixture();
      const query = qid(f.queryEngine, f.ids, { all: ["Transform"] });

      assert.strictEqual(f.queryEngine.getArchetypes(query).length, 0);

      createArchetype(f, [f.ids.Transform]);

      const archetypes = f.queryEngine.getArchetypes(query);
      assert.strictEqual(archetypes.length, 1);
    });

    it("multiple new archetypes are picked up in one rebuild", () => {
      const f = createFixture();
      const query = qid(f.queryEngine, f.ids, { all: ["Transform"] });

      createArchetype(f, [f.ids.Transform]);
      createArchetype(f, [f.ids.Transform, f.ids.Velocity]);
      createArchetype(f, [f.ids.Sprite]);

      const archetypes = f.queryEngine.getArchetypes(query);
      assert.strictEqual(archetypes.length, 2);
    });

    it("no unnecessary rebuilds when version has not changed", () => {
      const f = createFixture();
      createArchetype(f, [f.ids.Transform]);
      const query = qid(f.queryEngine, f.ids, { all: ["Transform"] });

      const first = f.queryEngine.getArchetypes(query);
      const second = f.queryEngine.getArchetypes(query);
      assert.strictEqual(first.length, second.length);
      assert.deepStrictEqual(first, second);
    });

    it("repeated getTables does not rescan archetypes", () => {
      const f = createFixture();
      createArchetype(f, [f.ids.Transform]);
      const query = qid(f.queryEngine, f.ids, { all: ["Transform"] });

      const first = f.queryEngine.getTables(query);
      const second = f.queryEngine.getTables(query);
      assert.strictEqual(first.length, second.length);
      assert.deepStrictEqual(first, second);
    });

    it("creates query before any archetypes returns empty matches", () => {
      const f = createFixture();
      const query = qid(f.queryEngine, f.ids, { all: ["Transform"] });
      assert.strictEqual(f.queryEngine.getArchetypes(query).length, 0);
    });

    it("arch created before query is included in initial scan", () => {
      const f = createFixture();
      const arch1 = createArchetype(f, [f.ids.Transform, f.ids.Velocity]);
      const arch2 = createArchetype(f, [f.ids.Sprite]);

      const query = qid(f.queryEngine, f.ids, { any: ["Sprite", "Mesh"] });
      const archetypes = f.queryEngine.getArchetypes(query);
      assert.strictEqual(archetypes.length, 1);
    });

    it("new archetype caught by existing any-only query", () => {
      const f = createFixture();
      const query = qid(f.queryEngine, f.ids, { any: ["Sprite", "Mesh"] });

      assert.strictEqual(f.queryEngine.getArchetypes(query).length, 0);

      createArchetype(f, [f.ids.Sprite]);
      assert.strictEqual(f.queryEngine.getArchetypes(query).length, 1);

      createArchetype(f, [f.ids.Mesh]);
      assert.strictEqual(f.queryEngine.getArchetypes(query).length, 2);
    });

    it("new archetype caught by existing none-only query", () => {
      const f = createFixture();
      const query = qid(f.queryEngine, f.ids, { none: ["Sleeping"] });

      createArchetype(f, [f.ids.Transform]);
      // Empty archetype + Transform archetype both lack Sleeping → 2 matches
      assert.strictEqual(f.queryEngine.getArchetypes(query).length, 2);

      createArchetype(f, [f.ids.Sleeping]);
      // Sleeping archetype excluded → still 2 matches (empty + Transform)
      assert.strictEqual(f.queryEngine.getArchetypes(query).length, 2);
    });
  });

  // ─── Returned Collections ────────────────────────────────

  describe("returned collections", () => {
    it("getTables returns the cached internal array (zero allocation)", () => {
      const f = createFixture();
      createArchetype(f, [f.ids.Transform]);
      const query = qid(f.queryEngine, f.ids, { all: ["Transform"] });

      const tables1 = f.queryEngine.getTables(query);
      const tables2 = f.queryEngine.getTables(query);
      assert.strictEqual(tables1, tables2);
    });

    it("getArchetypes returns a new array (not internal reference)", () => {
      const f = createFixture();
      createArchetype(f, [f.ids.Transform]);
      const query = qid(f.queryEngine, f.ids, { all: ["Transform"] });

      const archs = f.queryEngine.getArchetypes(query);
      archs.length = 0;
      assert.notStrictEqual(archs.length, f.queryEngine.getArchetypes(query).length);
    });
  });

  // ─── Error Paths ─────────────────────────────────────────

  describe("error paths", () => {
    it("getTables throws for non-Query argument", () => {
      const { queryEngine } = createFixture();
      assert.throws(() => queryEngine.getTables({}), { name: "TypeError" });
      assert.throws(() => queryEngine.getTables(null), { name: "TypeError" });
      assert.throws(() => queryEngine.getTables("foo"), { name: "TypeError" });
    });

    it("getArchetypes throws for non-Query argument", () => {
      const { queryEngine } = createFixture();
      assert.throws(() => queryEngine.getArchetypes({}), { name: "TypeError" });
      assert.throws(() => queryEngine.getArchetypes(null), { name: "TypeError" });
    });

    it("matches throws for non-ComponentSignature", () => {
      const { queryEngine, ids } = createFixture();
      const query = qid(queryEngine, ids, { all: ["Transform"] });
      assert.throws(() => queryEngine.matches(null, query), { name: "TypeError" });
      assert.throws(() => queryEngine.matches({}, query), { name: "TypeError" });
    });

    it("matches throws for non-Query", () => {
      const f = createFixture();
      const sig = new ComponentSignature([f.ids.Transform]);
      assert.throws(() => f.queryEngine.matches(sig, null), { name: "TypeError" });
      assert.throws(() => f.queryEngine.matches(sig, {}), { name: "TypeError" });
    });

    it("createQuery throws for invalid component ID (zero)", () => {
      const { queryEngine } = createFixture();
      assert.throws(
        () => queryEngine.createQuery({ all: [0] }),
        { name: "RangeError" }
      );
    });

    it("createQuery throws for invalid component ID (negative)", () => {
      const { queryEngine } = createFixture();
      assert.throws(
        () => queryEngine.createQuery({ all: [-1] }),
        { name: "RangeError" }
      );
    });

    it("createQuery throws for invalid component ID (above max)", () => {
      const { queryEngine } = createFixture();
      assert.throws(
        () => queryEngine.createQuery({ all: [65536] }),
        { name: "RangeError" }
      );
    });

    it("createQuery throws for invalid component ID (float)", () => {
      const { queryEngine } = createFixture();
      assert.throws(
        () => queryEngine.createQuery({ all: [1.5] }),
        { name: "RangeError" }
      );
    });

    it("createQuery throws for non-array all", () => {
      const { queryEngine } = createFixture();
      assert.throws(
        () => queryEngine.createQuery({ all: "foo" }),
        { name: "TypeError" }
      );
    });

    it("createQuery throws for non-array any", () => {
      const { queryEngine } = createFixture();
      assert.throws(
        () => queryEngine.createQuery({ any: "foo" }),
        { name: "TypeError" }
      );
    });

    it("createQuery throws for non-array none", () => {
      const { queryEngine } = createFixture();
      assert.throws(
        () => queryEngine.createQuery({ none: "foo" }),
        { name: "TypeError" }
      );
    });

    it("createQuery throws when array contains string", () => {
      const { queryEngine } = createFixture();
      assert.throws(
        () => queryEngine.createQuery({ all: ["Transform"] }),
        { name: "RangeError" }
      );
    });
  });

  // ─── matches Function ───────────────────────────────────

  describe("matches function", () => {
    it("returns true when all conditions are satisfied", () => {
      const f = createFixture();
      const arch = createArchetype(f, [f.ids.Transform, f.ids.Velocity]);
      const query = qid(f.queryEngine, f.ids, { all: ["Transform"] });
      assert.strictEqual(f.queryEngine.matches(arch.signature, query), true);
    });

    it("returns false when 'all' is not satisfied", () => {
      const f = createFixture();
      const arch = createArchetype(f, [f.ids.Transform]);
      const query = qid(f.queryEngine, f.ids, { all: ["Velocity"] });
      assert.strictEqual(f.queryEngine.matches(arch.signature, query), false);
    });

    it("returns true when 'any' is empty", () => {
      const f = createFixture();
      const arch = createArchetype(f, [f.ids.Transform]);
      const query = qid(f.queryEngine, f.ids, { all: ["Transform"] });
      assert.strictEqual(f.queryEngine.matches(arch.signature, query), true);
    });

    it("returns true when 'none' is empty", () => {
      const f = createFixture();
      const arch = createArchetype(f, [f.ids.Transform, f.ids.Sleeping]);
      const query = qid(f.queryEngine, f.ids, { all: ["Transform"] });
      assert.strictEqual(f.queryEngine.matches(arch.signature, query), true);
    });
  });

  // ─── Lazy Invalidation ────────────────────────────────

  describe("lazy invalidation", () => {
    it("creating an archetype automatically invalidates queries", () => {
      const f = createFixture();
      const query = qid(f.queryEngine, f.ids, { all: ["Transform"] });
      assert.strictEqual(f.queryEngine.getArchetypes(query).length, 0);

      createArchetype(f, [f.ids.Transform]);
      assert.strictEqual(f.queryEngine.getArchetypes(query).length, 1);
    });

    it("query is not rebuilt if no new archetypes since last access", () => {
      const f = createFixture();
      const query = qid(f.queryEngine, f.ids, { all: ["Transform"] });
      assert.strictEqual(f.queryEngine.getArchetypes(query).length, 0);

      createArchetype(f, [f.ids.Transform]);
      assert.strictEqual(f.queryEngine.getArchetypes(query).length, 1);

      const before = f.queryEngine.getArchetypes(query);
      const after = f.queryEngine.getArchetypes(query);
      assert.strictEqual(before.length, after.length);
    });

    it("multiple queries all get rebuilt lazily after new archetypes", () => {
      const f = createFixture();
      const qT = qid(f.queryEngine, f.ids, { all: ["Transform"] });
      const qS = qid(f.queryEngine, f.ids, { all: ["Sprite"] });

      createArchetype(f, [f.ids.Transform]);
      createArchetype(f, [f.ids.Sprite]);

      assert.strictEqual(f.queryEngine.getArchetypes(qT).length, 1);
      assert.strictEqual(f.queryEngine.getArchetypes(qS).length, 1);
    });

    it("version is derived from ArchetypeSystem automatically", () => {
      const f = createFixture();
      const query = qid(f.queryEngine, f.ids, { all: ["Transform"] });
      assert.strictEqual(f.queryEngine.getArchetypes(query).length, 0);

      createArchetype(f, [f.ids.Transform]);
      // ArchetypeSystem.version auto-incremented by createArchetype
      assert.strictEqual(f.queryEngine.getArchetypes(query).length, 1);
    });
  });

  // ─── Complex Matching Scenarios ──────────────────────────

  describe("complex matching scenarios", () => {
    it("handles multiple archetypes with different component sets", () => {
      const f = createFixture();
      createArchetype(f, [f.ids.Transform, f.ids.Velocity]);
      createArchetype(f, [f.ids.Transform, f.ids.Sprite]);
      createArchetype(f, [f.ids.Transform, f.ids.Velocity, f.ids.Sprite]);
      createArchetype(f, [f.ids.Velocity, f.ids.Sleeping]);

      const query = qid(f.queryEngine, f.ids, {
        all: ["Transform"],
        any: ["Velocity", "Sprite"],
        none: ["Sleeping"],
      });

      const matches = f.queryEngine.getArchetypes(query);
      assert.strictEqual(matches.length, 3);
    });

    it("matches archetype with the maximum component count", () => {
      const f = createFixture();
      createArchetype(f, [
        f.ids.Transform, f.ids.Velocity, f.ids.Health,
        f.ids.Sprite, f.ids.Mesh,
      ]);

      const query = qid(f.queryEngine, f.ids, {
        all: ["Transform", "Velocity", "Health", "Sprite", "Mesh"],
      });
      assert.strictEqual(f.queryEngine.getArchetypes(query).length, 1);
    });

    it("matches archetype with single tag component", () => {
      const f = createFixture();
      createArchetype(f, [f.ids.Enemy]);

      const query = qid(f.queryEngine, f.ids, { all: ["Enemy"] });
      assert.strictEqual(f.queryEngine.getArchetypes(query).length, 1);
    });

    it("matches multiple tag-only queries correctly", () => {
      const f = createFixture();
      createArchetype(f, [f.ids.Enemy]);
      createArchetype(f, [f.ids.Player]);
      createArchetype(f, [f.ids.Enemy, f.ids.Player]);

      const enemyQuery = qid(f.queryEngine, f.ids, { all: ["Enemy"] });
      const playerQuery = qid(f.queryEngine, f.ids, { all: ["Player"] });

      assert.strictEqual(f.queryEngine.getArchetypes(enemyQuery).length, 2);
      assert.strictEqual(f.queryEngine.getArchetypes(playerQuery).length, 2);
    });

    it("any matches archetype with the least expected component", () => {
      const f = createFixture();
      createArchetype(f, [f.ids.Transform, f.ids.Sprite]);
      createArchetype(f, [f.ids.Transform, f.ids.Mesh]);

      const query = qid(f.queryEngine, f.ids, {
        all: ["Transform"],
        any: ["Sprite", "Mesh"],
      });
      assert.strictEqual(f.queryEngine.getArchetypes(query).length, 2);
    });

    it("none excludes multiple archetypes correctly", () => {
      const f = createFixture();
      createArchetype(f, [f.ids.Transform, f.ids.Velocity]);
      createArchetype(f, [f.ids.Transform, f.ids.Sleeping]);
      createArchetype(f, [f.ids.Transform, f.ids.Velocity, f.ids.Sleeping]);

      const query = qid(f.queryEngine, f.ids, {
        all: ["Transform"],
        none: ["Sleeping"],
      });
      assert.strictEqual(f.queryEngine.getArchetypes(query).length, 1);
    });
  });

  // ─── Edge Cases ──────────────────────────────────────────

  describe("edge cases", () => {
    it("query with all empty components is wildcard matching all", () => {
      const f = createFixture();
      createArchetype(f, [f.ids.Transform]);
      createArchetype(f, [f.ids.Sprite]);
      createArchetype(f, [f.ids.Enemy]);

      const wildcard = f.queryEngine.createQuery();
      const emptyArchetypeCount = 1;
      assert.strictEqual(
        f.queryEngine.getArchetypes(wildcard).length,
        3 + emptyArchetypeCount
      );
    });

    it("query that matches zero archetypes returns empty arrays", () => {
      const f = createFixture();
      createArchetype(f, [f.ids.Transform]);

      const query = qid(f.queryEngine, f.ids, { all: ["Player"] });
      assert.strictEqual(f.queryEngine.getArchetypes(query).length, 0);
      assert.strictEqual(f.queryEngine.getTables(query).length, 0);
    });

    it("archetype with zero components matches none-only query", () => {
      const f = createFixture();
      const emptySig = new ComponentSignature([]);
      const query = qid(f.queryEngine, f.ids, { none: ["Sleeping"] });
      assert.ok(f.queryEngine.matches(emptySig, query));
    });

    it("new query after archetypes catches all existing", () => {
      const f = createFixture();
      createArchetype(f, [f.ids.Transform, f.ids.Velocity]);
      createArchetype(f, [f.ids.Transform, f.ids.Sleeping]);

      const query = qid(f.queryEngine, f.ids, { all: ["Transform"] });
      assert.strictEqual(f.queryEngine.getArchetypes(query).length, 2);
    });
  });

  // ─── Key Format ──────────────────────────────────────────

  describe("cache key format", () => {
    it("key includes 'A:' prefix for all components", () => {
      const { queryEngine, ids } = createFixture();
      const query = qid(queryEngine, ids, { all: ["Transform"] });
      assert.ok(query.key.includes("A:"));
    });

    it("key includes 'O:' prefix for any components", () => {
      const { queryEngine, ids } = createFixture();
      const query = qid(queryEngine, ids, { any: ["Sprite"] });
      assert.ok(query.key.includes("O:"));
    });

    it("key includes 'N:' prefix for none components", () => {
      const { queryEngine, ids } = createFixture();
      const query = qid(queryEngine, ids, { none: ["Sleeping"] });
      assert.ok(query.key.includes("N:"));
    });

    it("key omits empty sections", () => {
      const { queryEngine, ids } = createFixture();
      const query = qid(queryEngine, ids, { all: ["Transform"] });
      assert.ok(!query.key.includes("O:"));
      assert.ok(!query.key.includes("N:"));
    });

    it("key is deterministic for all permutations", () => {
      const { queryEngine, ids } = createFixture();
      const q1 = qid(queryEngine, ids, {
        all: ["Transform", "Velocity"],
        any: ["Sprite"],
        none: ["Sleeping"],
      });
      const q2 = qid(queryEngine, ids, {
        none: ["Sleeping"],
        any: ["Sprite"],
        all: ["Velocity", "Transform"],
      });
      assert.strictEqual(q1.key, q2.key);
    });

    it("wildcard query has empty key", () => {
      const { queryEngine } = createFixture();
      const query = queryEngine.createQuery();
      assert.strictEqual(query.key, "");
    });
  });
});
