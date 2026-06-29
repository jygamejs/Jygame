import { describe, it } from "node:test";
import * as assert from "node:assert";
import { World } from "../../../ecs/core/World.js";
import { System } from "../../../ecs/core/System.js";

class Position { static schema = { x: "f32", y: "f32" }; }
class Velocity { static schema = { vx: "f32", vy: "f32" }; }
class Health { static schema = { hp: "u32" }; }
class Sprite { static schema = { texture: "u32" }; }
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

function getFilter(world, filter) {
  const resolved = {};
  for (const key of ["all", "any", "none"]) {
    if (filter[key]) {
      resolved[key] = filter[key].map(c => world.registry.getId(c));
    }
  }
  return world.queryEngine.createQuery(resolved);
}

describe("QueryView", () => {
  // ─── Construction ──────────────────────────────────────
  describe("construction", () => {
    it("creates a QueryView from a Query", () => {
      const world = createWorld();
      const query = getFilter(world, { all: [Position] });
      const view = world.query(query);
      assert.ok(view);
    });

    it("QueryView exposes the query", () => {
      const world = createWorld();
      const query = getFilter(world, { all: [Position] });
      const view = world.query(query);
      assert.strictEqual(view.query, query);
    });

    it("creates a QueryView for wildcard query", () => {
      const world = createWorld();
      const query = world.queryEngine.createQuery();
      const view = world.query(query);
      assert.ok(view);
    });
  });

  // ─── Cache ─────────────────────────────────────────────
  describe("cache", () => {
    it("same Query returns the same QueryView", () => {
      const world = createWorld();
      const query = getFilter(world, { all: [Position] });
      const a = world.query(query);
      const b = world.query(query);
      assert.strictEqual(a, b);
    });

    it("different Queries produce different QueryViews", () => {
      const world = createWorld();
      const q1 = getFilter(world, { all: [Position] });
      const q2 = getFilter(world, { all: [Velocity] });
      const a = world.query(q1);
      const b = world.query(q2);
      assert.notStrictEqual(a, b);
    });

    it("cached QueryView persists across frames", () => {
      const world = createWorld();
      const query = getFilter(world, { all: [Position] });
      const a = world.query(query);
      world.update(16);
      const b = world.query(query);
      assert.strictEqual(a, b);
    });
  });

  // ─── Table Iteration ───────────────────────────────────
  describe("table iteration", () => {
    it("yields one table for a single archetype", () => {
      const world = createWorld();
      const e = world.createEntity();
      world.addComponent(e, Position);

      const query = getFilter(world, { all: [Position] });
      const view = world.query(query);
      const tables = [...view.tables()];
      assert.strictEqual(tables.length, 1);
    });

    it("yields multiple tables for multiple matching archetypes", () => {
      const world = createWorld();
      const e1 = world.createEntity();
      world.addComponent(e1, Position);
      const e2 = world.createEntity();
      world.addComponent(e2, Position);
      world.addComponent(e2, Velocity);

      const query = getFilter(world, { all: [Position] });
      const view = world.query(query);
      const tables = [...view.tables()];
      assert.strictEqual(tables.length, 2);
    });

    it("yields zero tables for no matches", () => {
      const world = createWorld();
      const query = getFilter(world, { all: [Sprite] });
      const view = world.query(query);
      const tables = [...view.tables()];
      assert.strictEqual(tables.length, 0);
    });

    it("tables are returned in deterministic archetype ID order", () => {
      const world = createWorld();
      const e1 = world.createEntity();
      world.addComponent(e1, Position);
      world.addComponent(e1, Velocity);
      const e2 = world.createEntity();
      world.addComponent(e2, Position);

      const query = getFilter(world, { all: [Position] });
      const view = world.query(query);
      const tables1 = [...view.tables()];
      const tables2 = [...view.tables()];
      assert.strictEqual(tables1.length, tables2.length);
      for (let i = 0; i < tables1.length; i++) {
        assert.strictEqual(tables1[i], tables2[i]);
      }
    });

    it("no duplicate tables", () => {
      const world = createWorld();
      const e1 = world.createEntity();
      world.addComponent(e1, Position);
      const e2 = world.createEntity();
      world.addComponent(e2, Position);

      const query = getFilter(world, { all: [Position] });
      const view = world.query(query);
      const tables = [...view.tables()];
      const unique = new Set(tables);
      assert.strictEqual(unique.size, tables.length);
    });

    it("yields no tables for empty matches from any-only query", () => {
      const world = createWorld();
      const query = getFilter(world, { any: [Sprite] });
      const view = world.query(query);
      const tables = [...view.tables()];
      assert.strictEqual(tables.length, 0);
    });

    it("yields empty archetype table for wildcard query", () => {
      const world = createWorld();
      world.createEntity();
      const query = world.queryEngine.createQuery();
      const view = world.query(query);
      const tables = [...view.tables()];
      assert.ok(tables.length > 0);
    });
  });

  // ─── Entity Iteration ──────────────────────────────────
  describe("entity iteration", () => {
    it("yields one entity from a single archetype", () => {
      const world = createWorld();
      const e = world.createEntity();
      world.addComponent(e, Position);

      const query = getFilter(world, { all: [Position] });
      const view = world.query(query);
      const entities = [...view.entities()];
      assert.strictEqual(entities.length, 1);
      assert.strictEqual(entities[0], e);
    });

    it("yields multiple entities from a single archetype", () => {
      const world = createWorld();
      const e1 = world.createEntity();
      world.addComponent(e1, Position);
      const e2 = world.createEntity();
      world.addComponent(e2, Position);

      const query = getFilter(world, { all: [Position] });
      const view = world.query(query);
      const entities = [...view.entities()];
      assert.strictEqual(entities.length, 2);
      assert.ok(entities.includes(e1));
      assert.ok(entities.includes(e2));
    });

    it("yields entities from multiple archetypes", () => {
      const world = createWorld();
      const e1 = world.createEntity();
      world.addComponent(e1, Position);
      const e2 = world.createEntity();
      world.addComponent(e2, Position);
      world.addComponent(e2, Velocity);
      const e3 = world.createEntity();
      world.addComponent(e3, Position);
      world.addComponent(e3, Health);

      const query = getFilter(world, { all: [Position] });
      const view = world.query(query);
      const entities = [...view.entities()];
      assert.strictEqual(entities.length, 3);
    });

    it("yields zero entities for no matches", () => {
      const world = createWorld();
      world.createEntity();
      const query = getFilter(world, { all: [Sprite] });
      const view = world.query(query);
      const entities = [...view.entities()];
      assert.strictEqual(entities.length, 0);
    });

    it("yields zero entities in an empty world", () => {
      const world = createWorld();
      const query = getFilter(world, { all: [Position] });
      const view = world.query(query);
      const entities = [...view.entities()];
      assert.strictEqual(entities.length, 0);
    });

    it("entity IDs are numbers (not objects)", () => {
      const world = createWorld();
      const e = world.createEntity();
      world.addComponent(e, Position);

      const query = getFilter(world, { all: [Position] });
      const view = world.query(query);
      for (const entity of view.entities()) {
        assert.strictEqual(typeof entity, "number");
      }
    });

    it("every entity is visited exactly once", () => {
      const world = createWorld();
      const count = 50;
      const entities = [];
      for (let i = 0; i < count; i++) {
        const e = world.createEntity();
        world.addComponent(e, Position);
        entities.push(e);
      }

      const query = getFilter(world, { all: [Position] });
      const view = world.query(query);
      const visited = new Set([...view.entities()]);
      assert.strictEqual(visited.size, count);
      for (const e of entities) {
        assert.ok(visited.has(e));
      }
    });

    it("entity order is stable across iterations", () => {
      const world = createWorld();
      const e1 = world.createEntity();
      world.addComponent(e1, Position);
      const e2 = world.createEntity();
      world.addComponent(e2, Position);

      const query = getFilter(world, { all: [Position] });
      const view = world.query(query);
      const order1 = [...view.entities()];
      const order2 = [...view.entities()];
      assert.deepStrictEqual(order1, order2);
    });

    it("yields entity from wildcard query", () => {
      const world = createWorld();
      const e = world.createEntity();
      const query = world.queryEngine.createQuery();
      const view = world.query(query);
      const entities = [...view.entities()];
      assert.ok(entities.includes(e));
    });
  });

  // ─── Row Iteration ─────────────────────────────────────
  describe("row iteration", () => {
    it("yields rows with table and row index", () => {
      const world = createWorld();
      const e = world.createEntity();
      world.addComponent(e, Position);

      const query = getFilter(world, { all: [Position] });
      const view = world.query(query);
      const rows = [...view.rows()];
      assert.strictEqual(rows.length, 1);
      assert.ok(rows[0].table);
      assert.strictEqual(typeof rows[0].row, "number");
    });

    it("row index matches entity position", () => {
      const world = createWorld();
      const e = world.createEntity();
      world.addComponent(e, Position);

      const query = getFilter(world, { all: [Position] });
      const view = world.query(query);
      for (const { table, row } of view.rows()) {
        assert.strictEqual(table.getEntity(row), e);
      }
    });

    it("yields correct rows for multiple entities", () => {
      const world = createWorld();
      const entities = [];
      for (let i = 0; i < 10; i++) {
        const e = world.createEntity();
        world.addComponent(e, Position);
        entities.push(e);
      }

      const query = getFilter(world, { all: [Position] });
      const view = world.query(query);
      const visited = new Set();
      for (const { table, row } of view.rows()) {
        visited.add(table.getEntity(row));
      }
      assert.strictEqual(visited.size, 10);
      for (const e of entities) {
        assert.ok(visited.has(e));
      }
    });

    it("yields rows across multiple tables", () => {
      const world = createWorld();
      const e1 = world.createEntity();
      world.addComponent(e1, Position);
      const e2 = world.createEntity();
      world.addComponent(e2, Position);
      world.addComponent(e2, Velocity);

      const query = getFilter(world, { all: [Position] });
      const view = world.query(query);
      const rows = [...view.rows()];
      assert.strictEqual(rows.length, 2);
    });

    it("yields zero rows for no matches", () => {
      const world = createWorld();
      world.createEntity();
      const query = getFilter(world, { all: [Sprite] });
      const view = world.query(query);
      const rows = [...view.rows()];
      assert.strictEqual(rows.length, 0);
    });

    it("each row references the correct table", () => {
      const world = createWorld();
      const e1 = world.createEntity();
      world.addComponent(e1, Position);
      const e2 = world.createEntity();
      world.addComponent(e2, Position);
      world.addComponent(e2, Velocity);

      const query = getFilter(world, { all: [Position] });
      const view = world.query(query);
      const tables = [...view.tables()];
      for (const { table, row } of view.rows()) {
        assert.ok(tables.includes(table));
        assert.ok(row >= 0);
        assert.ok(row < table.count);
      }
    });

    it("tables().entities() and rows() produce consistent entity count", () => {
      const world = createWorld();
      for (let i = 0; i < 20; i++) {
        const e = world.createEntity();
        world.addComponent(e, Position);
      }

      const query = getFilter(world, { all: [Position] });
      const view = world.query(query);
      const entityCount = [...view.entities()].length;
      const rowCount = [...view.rows()].length;
      assert.strictEqual(entityCount, rowCount);
    });
  });

  // ─── Archetype Invalidation ────────────────────────────
  describe("archetype invalidation", () => {
    it("QueryView discovers newly created archetypes", () => {
      const world = createWorld();
      const query = getFilter(world, { all: [Position] });
      const view = world.query(query);

      const before = [...view.tables()].length;
      assert.strictEqual(before, 0);

      const e = world.createEntity();
      world.addComponent(e, Position);
      const after = [...view.tables()].length;
      assert.strictEqual(after, 1);
    });

    it("QueryView discovers entities in new archetypes", () => {
      const world = createWorld();
      const query = getFilter(world, { all: [Position, Velocity] });
      const view = world.query(query);

      const e = world.createEntity();
      world.addComponent(e, Position);
      let entities = [...view.entities()];
      assert.strictEqual(entities.length, 0);

      world.addComponent(e, Velocity);
      entities = [...view.entities()];
      assert.strictEqual(entities.length, 1);
      assert.strictEqual(entities[0], e);
    });

    it("multiple invalidation cycles work", () => {
      const world = createWorld();
      const query = getFilter(world, { all: [Position] });
      const view = world.query(query);

      const e1 = world.createEntity();
      world.addComponent(e1, Position);
      assert.strictEqual([...view.entities()].length, 1);

      const e2 = world.createEntity();
      world.addComponent(e2, Position);
      world.addComponent(e2, Velocity);
      assert.strictEqual([...view.entities()].length, 2);

      const e3 = world.createEntity();
      world.addComponent(e3, Position);
      assert.strictEqual([...view.entities()].length, 3);
    });

    it("cached QueryView returns updated results after archetype creation", () => {
      const world = createWorld();
      const query = getFilter(world, { all: [Position] });
      const view1 = world.query(query);
      const view2 = world.query(query);
      assert.strictEqual(view1, view2);

      const e = world.createEntity();
      world.addComponent(e, Position);
      assert.strictEqual([...view1.entities()].length, 1);
      assert.strictEqual([...view2.entities()].length, 1);
    });
  });

  // ─── Reusability ───────────────────────────────────────
  describe("reusability", () => {
    it("same QueryView can be iterated multiple times", () => {
      const world = createWorld();
      for (let i = 0; i < 10; i++) {
        const e = world.createEntity();
        world.addComponent(e, Position);
      }

      const query = getFilter(world, { all: [Position] });
      const view = world.query(query);

      for (let iter = 0; iter < 5; iter++) {
        const entities = [...view.entities()];
        assert.strictEqual(entities.length, 10);
      }
    });

    it("same QueryView can interleave tables(), entities(), rows()", () => {
      const world = createWorld();
      const e1 = world.createEntity();
      world.addComponent(e1, Position);
      const e2 = world.createEntity();
      world.addComponent(e2, Position);

      const query = getFilter(world, { all: [Position] });
      const view = world.query(query);

      const tables = [...view.tables()];
      const entities = [...view.entities()];
      const rows = [...view.rows()];

      assert.strictEqual(tables.length, 1);
      assert.strictEqual(entities.length, 2);
      assert.strictEqual(rows.length, 2);
    });

    it("iteration after entity destroy does not include destroyed entity", () => {
      const world = createWorld();
      const e1 = world.createEntity();
      world.addComponent(e1, Position);
      const e2 = world.createEntity();
      world.addComponent(e2, Position);

      const query = getFilter(world, { all: [Position] });
      const view = world.query(query);

      assert.strictEqual([...view.entities()].length, 2);

      world.destroyEntity(e1);
      assert.strictEqual([...view.entities()].length, 1);
    });

    it("iteration after entity add includes new entity", () => {
      const world = createWorld();
      const query = getFilter(world, { all: [Position] });
      const view = world.query(query);

      const e1 = world.createEntity();
      world.addComponent(e1, Position);
      assert.strictEqual([...view.entities()].length, 1);

      const e2 = world.createEntity();
      world.addComponent(e2, Position);
      assert.strictEqual([...view.entities()].length, 2);
    });
  });

  // ─── Concurrent Views ──────────────────────────────────
  describe("concurrent views", () => {
    it("multiple QueryViews for different queries work independently", () => {
      const world = createWorld();
      const e1 = world.createEntity();
      world.addComponent(e1, Position);
      const e2 = world.createEntity();
      world.addComponent(e2, Velocity);

      const posQuery = getFilter(world, { all: [Position] });
      const velQuery = getFilter(world, { all: [Velocity] });
      const posView = world.query(posQuery);
      const velView = world.query(velQuery);

      assert.strictEqual([...posView.entities()].length, 1);
      assert.strictEqual([...velView.entities()].length, 1);
    });

    it("multiple QueryViews for same query share cache and results", () => {
      const world = createWorld();
      const e = world.createEntity();
      world.addComponent(e, Position);

      const query = getFilter(world, { all: [Position] });
      const a = world.query(query);
      const b = world.query(query);

      assert.strictEqual(a, b);
      assert.strictEqual([...a.entities()].length, [...b.entities()].length);
    });
  });

  // ─── Integration with Systems ──────────────────────────
  describe("integration with systems", () => {
    it("system can iterate entities via QueryView", () => {
      const world = createWorld();
      const visited = [];

      class TestSystem extends System {
        static query = { all: [Position] };
        update(ctx, dt) {
          for (const entity of ctx.world.query(this.query).entities()) {
            visited.push(entity);
          }
        }
      }

      const e = world.createEntity();
      world.addComponent(e, Position);
      world.addSystem(new TestSystem());
      world.update(16);

      assert.strictEqual(visited.length, 1);
      assert.strictEqual(visited[0], e);
    });

    it("system can iterate tables via QueryView", () => {
      const world = createWorld();
      let tableCount = 0;

      class TestSystem extends System {
        static query = { all: [Position] };
        update(ctx, dt) {
          for (const _ of ctx.world.query(this.query).tables()) {
            tableCount++;
          }
        }
      }

      const e = world.createEntity();
      world.addComponent(e, Position);
      world.addSystem(new TestSystem());
      world.update(16);

      assert.strictEqual(tableCount, 1);
    });

    it("system can read component data via table iteration", () => {
      const world = createWorld();
      let sumX = 0;

      class TestSystem extends System {
        static query = { all: [Position] };
        update(ctx, dt) {
          const posId = ctx.world.registry.getId(Position);
          for (const table of ctx.world.query(this.query).tables()) {
            const colX = table.getColumn(posId, "x");
            for (let r = 0; r < table.count; r++) {
              sumX += colX[r];
            }
          }
        }
      }

      const e1 = world.createEntity();
      world.addComponent(e1, Position);
      world.setComponent(e1, Position, { x: 10, y: 20 });
      const e2 = world.createEntity();
      world.addComponent(e2, Position);
      world.setComponent(e2, Position, { x: 30, y: 40 });

      world.addSystem(new TestSystem());
      world.update(16);

      assert.strictEqual(sumX, 40);
    });

    it("system can iterate rows and modify component data", () => {
      const world = createWorld();
      let touched = 0;

      class TestSystem extends System {
        static query = { all: [Position] };
        update(ctx, dt) {
          const posId = ctx.world.registry.getId(Position);
          for (const { table, row } of ctx.world.query(this.query).rows()) {
            const colX = table.getColumn(posId, "x");
            colX[row] += 5;
            touched++;
          }
        }
      }

      const e1 = world.createEntity();
      world.addComponent(e1, Position);
      world.setComponent(e1, Position, { x: 10 });
      const e2 = world.createEntity();
      world.addComponent(e2, Position);
      world.setComponent(e2, Position, { x: 20 });

      world.addSystem(new TestSystem());
      world.update(16);

      assert.strictEqual(touched, 2);
      assert.strictEqual(world.getComponent(e1, Position).x, 15);
      assert.strictEqual(world.getComponent(e2, Position).x, 25);
    });

    it("two systems with different queries iterate independently", () => {
      const world = createWorld();
      let posVisited = 0;
      let velVisited = 0;

      class PosSystem extends System {
        static query = { all: [Position] };
        update(ctx, dt) {
          for (const _ of ctx.world.query(this.query).entities()) {
            posVisited++;
          }
        }
      }
      class VelSystem extends System {
        static query = { all: [Velocity] };
        update(ctx, dt) {
          for (const _ of ctx.world.query(this.query).entities()) {
            velVisited++;
          }
        }
      }

      const e = world.createEntity();
      world.addComponent(e, Position);
      world.addComponent(e, Velocity);

      world.addSystem(new PosSystem());
      world.addSystem(new VelSystem());
      world.update(16);

      assert.strictEqual(posVisited, 1);
      assert.strictEqual(velVisited, 1);
    });

    it("system sees newly created archetypes after entity migration", () => {
      const world = createWorld();
      let firstCount = 0;
      let secondCount = 0;

      class TestSystem extends System {
        static query = { all: [Position] };
        update(ctx, dt) {
          if (firstCount === 0) {
            firstCount = [...ctx.world.query(this.query).entities()].length;
          } else {
            secondCount = [...ctx.world.query(this.query).entities()].length;
          }
        }
      }

      world.addSystem(new TestSystem());

      const e = world.createEntity();
      world.addComponent(e, Position);

      world.update(16);
      assert.strictEqual(firstCount, 1);

      const e2 = world.createEntity();
      world.addComponent(e2, Position);
      world.addComponent(e2, Velocity);

      world.update(16);
      assert.strictEqual(secondCount, 2);
    });
  });

  // ─── Edge Cases ────────────────────────────────────────
  describe("edge cases", () => {
    it("handles World with no entities", () => {
      const world = createWorld();
      const query = getFilter(world, { all: [Position] });
      const view = world.query(query);
      assert.strictEqual([...view.tables()].length, 0);
      assert.strictEqual([...view.entities()].length, 0);
      assert.strictEqual([...view.rows()].length, 0);
    });

    it("handles World with entities but no matching components", () => {
      const world = createWorld();
      world.createEntity();
      world.createEntity();
      const query = getFilter(world, { all: [Position] });
      const view = world.query(query);
      assert.strictEqual([...view.tables()].length, 0);
      assert.strictEqual([...view.entities()].length, 0);
    });

    it("handles entity with tag components", () => {
      const world = createWorld();
      const e = world.createEntity();
      world.addComponent(e, Enemy);
      const query = getFilter(world, { all: [Enemy] });
      const view = world.query(query);
      const entities = [...view.entities()];
      assert.strictEqual(entities.length, 1);
      assert.strictEqual(entities[0], e);
    });

    it("handles wildcard query iteration", () => {
      const world = createWorld();
      const e1 = world.createEntity();
      world.addComponent(e1, Position);
      const e2 = world.createEntity();
      world.addComponent(e2, Velocity);

      const query = world.queryEngine.createQuery();
      const view = world.query(query);
      const entities = [...view.entities()];
      assert.strictEqual(entities.length, 2);
    });

    it("iteration after destroying all entities yields none", () => {
      const world = createWorld();
      const e = world.createEntity();
      world.addComponent(e, Position);
      const query = getFilter(world, { all: [Position] });
      const view = world.query(query);

      assert.strictEqual([...view.entities()].length, 1);
      world.destroyEntity(e);
      assert.strictEqual([...view.entities()].length, 0);
    });

    it("none filter excludes matching entities", () => {
      const world = createWorld();
      const e1 = world.createEntity();
      world.addComponent(e1, Position);
      const e2 = world.createEntity();
      world.addComponent(e2, Position);
      world.addComponent(e2, Enemy);

      const query = getFilter(world, { all: [Position], none: [Enemy] });
      const view = world.query(query);
      const entities = [...view.entities()];
      assert.strictEqual(entities.length, 1);
    });

    it("any filter includes entities with at least one", () => {
      const world = createWorld();
      const e1 = world.createEntity();
      world.addComponent(e1, Position);
      const e2 = world.createEntity();
      world.addComponent(e2, Velocity);
      const e3 = world.createEntity();

      const query = getFilter(world, { any: [Position, Velocity] });
      const view = world.query(query);
      const entities = [...view.entities()];
      assert.strictEqual(entities.length, 2);
      assert.ok(entities.includes(e1));
      assert.ok(entities.includes(e2));
    });

    it("iteration works with reserved ID components", () => {
      const world = new World();
      const query = world.queryEngine.createQuery();
      assert.ok(world.query(query));
    });

    it("does not throw when archetypes have no matching entities", () => {
      const world = createWorld();
      world.createEntity();
      const query = getFilter(world, { all: [Position] });
      const view = world.query(query);
      assert.doesNotThrow(() => [...view.tables()]);
      assert.doesNotThrow(() => [...view.entities()]);
      assert.doesNotThrow(() => [...view.rows()]);
    });
  });

  // ─── Determinism ───────────────────────────────────────
  describe("determinism", () => {
    it("multiple iterations return same entity order", () => {
      const world = createWorld();
      for (let i = 0; i < 20; i++) {
        const e = world.createEntity();
        world.addComponent(e, Position);
      }

      const query = getFilter(world, { all: [Position] });
      const view = world.query(query);

      const order1 = [...view.entities()];
      const order2 = [...view.entities()];
      const order3 = [...view.entities()];
      assert.deepStrictEqual(order1, order2);
      assert.deepStrictEqual(order2, order3);
    });

    it("archetypes are always visited in ID order", () => {
      const world = createWorld();
      const e1 = world.createEntity();
      world.addComponent(e1, Position);
      world.addComponent(e1, Velocity);

      const e2 = world.createEntity();
      world.addComponent(e2, Position);

      const query = getFilter(world, { all: [Position] });
      const view = world.query(query);

      const archetypeIds = [...view.tables()].map(t => {
        const as = world.archetypeSystem;
        for (let id = 1; id <= as.archetypeCount; id++) {
          const arch = as.getArchetypeById(id);
          if (arch && arch.table === t) return id;
        }
        return -1;
      });

      for (let i = 1; i < archetypeIds.length; i++) {
        assert.ok(archetypeIds[i - 1] < archetypeIds[i]);
      }
    });
  });

  // ─── Combined Filters ──────────────────────────────────
  describe("combined filters", () => {
    it("all + any + none together", () => {
      const world = createWorld();
      const e1 = world.createEntity();
      world.addComponent(e1, Position);
      world.addComponent(e1, Velocity);

      const e2 = world.createEntity();
      world.addComponent(e2, Position);
      world.addComponent(e2, Health);

      const e3 = world.createEntity();
      world.addComponent(e3, Position);
      world.addComponent(e3, Enemy);

      const query = getFilter(world, {
        all: [Position],
        any: [Velocity, Health],
        none: [Enemy],
      });
      const view = world.query(query);
      const entities = [...view.entities()];
      assert.strictEqual(entities.length, 2);
      assert.ok(entities.includes(e1));
      assert.ok(entities.includes(e2));
    });
  });

  // ─── Stress Tests ──────────────────────────────────────
  describe("stress tests", () => {
    it("iterates 1000 entities in one archetype", () => {
      const world = createWorld();
      for (let i = 0; i < 1000; i++) {
        const e = world.createEntity();
        world.addComponent(e, Position);
      }

      const query = getFilter(world, { all: [Position] });
      const view = world.query(query);
      const entities = [...view.entities()];
      assert.strictEqual(entities.length, 1000);
    });

    it("iterates entities across 50 archetypes", () => {
      const world = createWorld();
      const archetypes = 50;
      const perArch = 4;
      for (let a = 0; a < archetypes; a++) {
        const e = world.createEntity();
        world.addComponent(e, Position);
        world.addComponent(e, Health);
        for (let s = 0; s < a % 3; s++) {
          world.addComponent(e, a % 2 === 0 ? Velocity : Sprite);
        }
      }

      const query = getFilter(world, { all: [Position] });
      const view = world.query(query);
      const count = [...view.entities()].length;
      assert.ok(count > 0);
    });

    it("repeated iteration over 500 entities is stable", () => {
      const world = createWorld();
      for (let i = 0; i < 500; i++) {
        const e = world.createEntity();
        world.addComponent(e, Position);
      }

      const query = getFilter(world, { all: [Position] });
      const view = world.query(query);

      const expected = 500;
      for (let iter = 0; iter < 10; iter++) {
        assert.strictEqual([...view.entities()].length, expected);
      }
    });
  });

  // ─── Swap-Remove Ordering ──────────────────────────────
  describe("swap-remove ordering", () => {
    it("last added entity is visited when entity destroyed from middle", () => {
      const world = createWorld();
      const e1 = world.createEntity();
      world.addComponent(e1, Position);
      const e2 = world.createEntity();
      world.addComponent(e2, Position);
      const e3 = world.createEntity();
      world.addComponent(e3, Position);

      world.destroyEntity(e2);

      const query = getFilter(world, { all: [Position] });
      const view = world.query(query);
      const entities = [...view.entities()];
      assert.strictEqual(entities.length, 2);
    });

    it("destroying first entity shifts order due to swap-remove", () => {
      const world = createWorld();
      const e1 = world.createEntity();
      world.addComponent(e1, Position);
      const e2 = world.createEntity();
      world.addComponent(e2, Position);

      world.destroyEntity(e1);

      const query = getFilter(world, { all: [Position] });
      const view = world.query(query);
      const entities = [...view.entities()];
      assert.strictEqual(entities.length, 1);
      assert.strictEqual(entities[0], e2);
    });
  });

  // ─── Invalidation Across Multiple Views ────────────────
  describe("multi-view invalidation", () => {
    it("three QueryViews all see new archetype after one creation", () => {
      const world = createWorld();
      const q1 = getFilter(world, { all: [Position] });
      const q2 = getFilter(world, { all: [Position, Velocity] });
      const q3 = getFilter(world, { all: [Position, Health] });

      const v1 = world.query(q1);
      const v2 = world.query(q2);
      const v3 = world.query(q3);

      const e = world.createEntity();
      world.addComponent(e, Position);

      assert.strictEqual([...v1.entities()].length, 1);
      assert.strictEqual([...v2.entities()].length, 0);
      assert.strictEqual([...v3.entities()].length, 0);

      world.addComponent(e, Velocity);
      assert.strictEqual([...v1.entities()].length, 1);
      assert.strictEqual([...v2.entities()].length, 1);
      assert.strictEqual([...v3.entities()].length, 0);
    });
  });

  // ─── For-of Compatibility ──────────────────────────────
  describe("for-of compatibility", () => {
    it("tables() works with for-of", () => {
      const world = createWorld();
      const e = world.createEntity();
      world.addComponent(e, Position);

      const query = getFilter(world, { all: [Position] });
      const view = world.query(query);
      let count = 0;
      for (const _ of view.tables()) {
        count++;
      }
      assert.strictEqual(count, 1);
    });

    it("entities() works with for-of", () => {
      const world = createWorld();
      const e = world.createEntity();
      world.addComponent(e, Position);

      const query = getFilter(world, { all: [Position] });
      const view = world.query(query);
      let found = false;
      for (const entity of view.entities()) {
        if (entity === e) found = true;
      }
      assert.ok(found);
    });

    it("rows() works with for-of destructuring", () => {
      const world = createWorld();
      const e = world.createEntity();
      world.addComponent(e, Position);

      const query = getFilter(world, { all: [Position] });
      const view = world.query(query);
      let rowCount = 0;
      for (const { table, row } of view.rows()) {
        assert.ok(table);
        assert.strictEqual(typeof row, "number");
        rowCount++;
      }
      assert.strictEqual(rowCount, 1);
    });
  });

  // ─── Empty Table Handling ──────────────────────────────
  describe("empty table handling", () => {
    it("empty archetype table is yielded by wildcard query but has no entities", () => {
      const world = createWorld();
      world.createEntity();

      const query = world.queryEngine.createQuery();
      const view = world.query(query);
      const tables = [...view.tables()];
      assert.ok(tables.length > 0);

      const entities = [...view.entities()];
      assert.strictEqual(entities.length, 1);
    });

    it("empty matching table (no entities) yields zero rows", () => {
      const world = createWorld();
      const query = getFilter(world, { all: [Position] });
      const view = world.query(query);
      assert.strictEqual([...view.rows()].length, 0);
    });
  });

  // ─── Entity Component Data Access via Table ────────────
  describe("data access via iteration", () => {
    it("read component fields through table iteration", () => {
      const world = createWorld();
      const e1 = world.createEntity();
      world.addComponent(e1, Position);
      world.setComponent(e1, Position, { x: 1, y: 2 });
      const e2 = world.createEntity();
      world.addComponent(e2, Position);
      world.setComponent(e2, Position, { x: 3, y: 4 });

      const posId = world.registry.getId(Position);
      const query = getFilter(world, { all: [Position] });
      const view = world.query(query);

      const results = [];
      for (const table of view.tables()) {
        const colX = table.getColumn(posId, "x");
        const colY = table.getColumn(posId, "y");
        for (let r = 0; r < table.count; r++) {
          results.push({ x: colX[r], y: colY[r], entity: table.getEntity(r) });
        }
      }

      assert.strictEqual(results.length, 2);
      assert.strictEqual(results[0].x, 1);
      assert.strictEqual(results[1].x, 3);
    });

    it("write component fields through table iteration", () => {
      const world = createWorld();
      const e = world.createEntity();
      world.addComponent(e, Position);
      world.setComponent(e, Position, { x: 10, y: 20 });

      const posId = world.registry.getId(Position);
      const query = getFilter(world, { all: [Position] });
      const view = world.query(query);

      for (const table of view.tables()) {
        const colX = table.getColumn(posId, "x");
        for (let r = 0; r < table.count; r++) {
          colX[r] += 5;
        }
      }

      assert.strictEqual(world.getComponent(e, Position).x, 15);
    });
  });

  // ─── Regression ────────────────────────────────────────
  describe("regression", () => {
    it("World.query still works after clearSystems", () => {
      const world = createWorld();
      const query = getFilter(world, { all: [Position] });
      world.query(query);
      world.clearSystems();
      const view = world.query(query);
      assert.ok(view);
    });

    it("QueryView works after scheduler update", () => {
      const world = createWorld();
      const e = world.createEntity();
      world.addComponent(e, Position);

      class DummySystem extends System { update(ctx, dt) {} }
      world.addSystem(new DummySystem());
      world.update(16);

      const query = getFilter(world, { all: [Position] });
      const view = world.query(query);
      assert.strictEqual([...view.entities()].length, 1);
    });

    it("multiple worlds have independent caches", () => {
      const w1 = createWorld();
      const w2 = createWorld();

      const e1 = w1.createEntity();
      w1.addComponent(e1, Position);
      const e2 = w2.createEntity();
      w2.addComponent(e2, Position);

      const q1 = getFilter(w1, { all: [Position] });
      const q2 = getFilter(w2, { all: [Position] });
      const v1 = w1.query(q1);
      const v2 = w2.query(q2);

      assert.notStrictEqual(v1, v2);
      assert.strictEqual([...v1.entities()].length, 1);
      assert.strictEqual([...v2.entities()].length, 1);
    });

    it("zero-entity tables produce correct iteration counts", () => {
      const world = createWorld();
      const query = getFilter(world, { all: [Position, Velocity] });
      const view = world.query(query);

      assert.strictEqual([...view.tables()].length, 0);
      assert.strictEqual([...view.entities()].length, 0);
      assert.strictEqual([...view.rows()].length, 0);
    });
  });
});
