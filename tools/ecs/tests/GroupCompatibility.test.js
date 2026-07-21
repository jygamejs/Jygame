import { describe, it } from "node:test";
import * as assert from "node:assert";
import { Group } from "../../../display/Group.js";
import { Sprite } from "../../../display/Sprite.js";
import { World } from "../../../ecs/core/World.js";
import { Transform } from "../../../ecs/components/Transform.js";
import { Collider } from "../../../ecs/components/Collider.js";
import { Renderable } from "../../../ecs/components/Renderable.js";
import { Visible } from "../../../ecs/components/Visible.js";
import { Velocity } from "../../../ecs/components/Velocity.js";
import { RenderBounds } from "../../../ecs/components/RenderBounds.js";
import { EnemyTag } from "../../../ecs/components/tags/EnemyTag.js";
import { PlayerTag } from "../../../ecs/components/tags/PlayerTag.js";
import { SpatialHash } from "../../../collision/SpatialHash.js";

function makeWorld() {
  const w = new World();
  [Transform, Collider, Renderable, RenderBounds, Visible, Velocity, EnemyTag, PlayerTag].forEach(c => w.register(c));
  return w;
}

function makeSprite(x, y, w, h, world) {
  return new Sprite(x, y, w, h, world);
}

// ─── Construction ───────────────────────────────────────

describe("Group — construction", () => {
  it("creates empty manual group", () => {
    const g = new Group();
    assert.strictEqual(g.size, 0);
  });

  it("accepts explicit world", () => {
    const w = makeWorld();
    const g = new Group(w);
    assert.strictEqual(g._world, w);
  });

  it("creates query-backed group via static query()", () => {
    const w = makeWorld();
    const g = Group.query(w, { all: [EnemyTag] });
    assert.ok(g);
    assert.strictEqual(g._isQuery, true);
  });

  it("query group starts empty", () => {
    const w = makeWorld();
    const g = Group.query(w, { all: [EnemyTag] });
    assert.strictEqual(g.size, 0);
  });

  it("query group with any filter", () => {
    const w = makeWorld();
    const g = Group.query(w, { any: [EnemyTag, PlayerTag] });
    assert.ok(g);
  });

  it("query group with none filter", () => {
    const w = makeWorld();
    const g = Group.query(w, { none: [EnemyTag] });
    assert.ok(g);
  });

  it("uses default world when none provided", () => {
    const g = new Group();
    assert.ok(g._world);
  });
});

// ─── Membership ─────────────────────────────────────────

describe("Group — membership", () => {
  it("add adds a sprite", () => {
    const w = makeWorld();
    const g = new Group(w);
    const s = makeSprite(0, 0, 32, 32, w);
    g.add(s);
    assert.strictEqual(g.size, 1);
  });

  it("add pushes group to sprite.groups", () => {
    const w = makeWorld();
    const g = new Group(w);
    const s = makeSprite(0, 0, 32, 32, w);
    g.add(s);
    assert.ok(s.groups.includes(g));
  });

  it("add ignores duplicate", () => {
    const w = makeWorld();
    const g = new Group(w);
    const s = makeSprite(0, 0, 32, 32, w);
    g.add(s);
    g.add(s);
    assert.strictEqual(g.size, 1);
  });

  it("remove removes sprite", () => {
    const w = makeWorld();
    const g = new Group(w);
    const s = makeSprite(0, 0, 32, 32, w);
    g.add(s);
    g.remove(s);
    assert.strictEqual(g.size, 0);
  });

  it("remove removes group from sprite.groups", () => {
    const w = makeWorld();
    const g = new Group(w);
    const s = makeSprite(0, 0, 32, 32, w);
    g.add(s);
    g.remove(s);
    assert.ok(!s.groups.includes(g));
  });

  it("remove missing sprite is no-op", () => {
    const w = makeWorld();
    const g = new Group(w);
    const s = makeSprite(0, 0, 32, 32, w);
    g.remove(s);
    assert.strictEqual(g.size, 0);
  });

  it("has returns true for added sprite", () => {
    const w = makeWorld();
    const g = new Group(w);
    const s = makeSprite(0, 0, 32, 32, w);
    g.add(s);
    assert.strictEqual(g.has(s), true);
  });

  it("has returns false for non-member", () => {
    const w = makeWorld();
    const g = new Group(w);
    const s = makeSprite(0, 0, 32, 32, w);
    assert.strictEqual(g.has(s), false);
  });

  it("clear removes all sprites", () => {
    const w = makeWorld();
    const g = new Group(w);
    const a = makeSprite(0, 0, 32, 32, w);
    const b = makeSprite(10, 10, 16, 16, w);
    g.add(a);
    g.add(b);
    g.clear();
    assert.strictEqual(g.size, 0);
  });

  it("clear removes group from each sprite.groups", () => {
    const w = makeWorld();
    const g = new Group(w);
    const s = makeSprite(0, 0, 32, 32, w);
    g.add(s);
    g.clear();
    assert.ok(!s.groups.includes(g));
  });

  it("clear is idempotent", () => {
    const w = makeWorld();
    const g = new Group(w);
    g.clear();
    assert.strictEqual(g.size, 0);
  });

  it("can add multiple sprites", () => {
    const w = makeWorld();
    const g = new Group(w);
    for (let i = 0; i < 10; i++) g.add(makeSprite(i * 10, 0, 32, 32, w));
    assert.strictEqual(g.size, 10);
  });

  it("remove only removes the specified sprite", () => {
    const w = makeWorld();
    const g = new Group(w);
    const a = makeSprite(0, 0, 32, 32, w);
    const b = makeSprite(10, 10, 16, 16, w);
    g.add(a);
    g.add(b);
    g.remove(a);
    assert.strictEqual(g.size, 1);
    assert.strictEqual(g.has(b), true);
  });
});

// ─── Properties ─────────────────────────────────────────

describe("Group — properties", () => {
  it("size returns member count", () => {
    const w = makeWorld();
    const g = new Group(w);
    g.add(makeSprite(0, 0, 32, 32, w));
    g.add(makeSprite(10, 10, 16, 16, w));
    assert.strictEqual(g.size, 2);
  });

  it("length aliases size", () => {
    const w = makeWorld();
    const g = new Group(w);
    g.add(makeSprite(0, 0, 32, 32, w));
    assert.strictEqual(g.length, g.size);
  });

  it("children returns copy of sprites", () => {
    const w = makeWorld();
    const g = new Group(w);
    const s = makeSprite(0, 0, 32, 32, w);
    g.add(s);
    const c = g.children;
    assert.strictEqual(c.length, 1);
    assert.strictEqual(c[0], s);
  });

  it("children returns new array each call", () => {
    const w = makeWorld();
    const g = new Group(w);
    g.add(makeSprite(0, 0, 32, 32, w));
    assert.notStrictEqual(g.children, g.children);
  });

  it("first returns first sprite", () => {
    const w = makeWorld();
    const g = new Group(w);
    const a = makeSprite(0, 0, 32, 32, w);
    const b = makeSprite(10, 10, 16, 16, w);
    g.add(a);
    g.add(b);
    assert.strictEqual(g.first, a);
  });

  it("first returns null for empty group", () => {
    const g = new Group();
    assert.strictEqual(g.first, null);
  });

  it("last returns last sprite", () => {
    const w = makeWorld();
    const g = new Group(w);
    const a = makeSprite(0, 0, 32, 32, w);
    const b = makeSprite(10, 10, 16, 16, w);
    g.add(a);
    g.add(b);
    assert.strictEqual(g.last, b);
  });

  it("last returns null for empty group", () => {
    const g = new Group();
    assert.strictEqual(g.last, null);
  });
});

// ─── Iteration ──────────────────────────────────────────

describe("Group — iteration", () => {
  it("forEach iterates all members", () => {
    const w = makeWorld();
    const g = new Group(w);
    const sprites = [makeSprite(0, 0, 32, 32, w), makeSprite(10, 10, 16, 16, w)];
    sprites.forEach(s => g.add(s));
    const seen = [];
    g.forEach(s => seen.push(s));
    assert.strictEqual(seen.length, 2);
    assert.deepStrictEqual(seen, sprites);
  });

  it("forEach passes index", () => {
    const w = makeWorld();
    const g = new Group(w);
    g.add(makeSprite(0, 0, 32, 32, w));
    g.add(makeSprite(10, 10, 16, 16, w));
    const indices = [];
    g.forEach((_, i) => indices.push(i));
    assert.deepStrictEqual(indices, [0, 1]);
  });

  it("map transforms members", () => {
      const w = makeWorld();
      const g = new Group(w);
      g.add(makeSprite(10, 20, 32, 32, w));
      const result = g.map(s => s.x);
      assert.deepStrictEqual(result, [10]);
    });

  it("filter selects members", () => {
    const w = makeWorld();
    const g = new Group(w);
    const a = makeSprite(0, 0, 32, 32, w);
    const b = makeSprite(100, 100, 16, 16, w);
    g.add(a);
    g.add(b);
    const result = g.filter(s => s.x > 50);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0], b);
  });

  it("find returns matching member", () => {
    const w = makeWorld();
    const g = new Group(w);
    const a = makeSprite(0, 0, 32, 32, w);
    const b = makeSprite(100, 100, 16, 16, w);
    g.add(a);
    g.add(b);
    const found = g.find(s => s.x > 50);
    assert.strictEqual(found, b);
  });

  it("find returns undefined when no match", () => {
    const w = makeWorld();
    const g = new Group(w);
    g.add(makeSprite(0, 0, 32, 32, w));
    assert.strictEqual(g.find(() => false), undefined);
  });

  it("some returns true when condition met", () => {
    const w = makeWorld();
    const g = new Group(w);
    g.add(makeSprite(100, 0, 32, 32, w));
    assert.strictEqual(g.some(s => s.x > 50), true);
  });

  it("some returns false otherwise", () => {
    const w = makeWorld();
    const g = new Group(w);
    g.add(makeSprite(0, 0, 32, 32, w));
    assert.strictEqual(g.some(s => s.x > 50), false);
  });

  it("every returns true for all matching", () => {
    const w = makeWorld();
    const g = new Group(w);
    g.add(makeSprite(0, 0, 32, 32, w));
    g.add(makeSprite(10, 0, 32, 32, w));
    assert.strictEqual(g.every(s => s.x >= -6), true);
  });

  it("every returns false for any mismatch", () => {
    const w = makeWorld();
    const g = new Group(w);
    g.add(makeSprite(0, 0, 32, 32, w));
    g.add(makeSprite(100, 0, 32, 32, w));
    assert.strictEqual(g.every(s => s.x < 50), false);
  });

  it("Symbol.iterator yields sprites", () => {
    const w = makeWorld();
    const g = new Group(w);
    const a = makeSprite(0, 0, 32, 32, w);
    const b = makeSprite(10, 10, 16, 16, w);
    g.add(a);
    g.add(b);
    const result = [...g];
    assert.strictEqual(result.length, 2);
    assert.strictEqual(result[0], a);
    assert.strictEqual(result[1], b);
  });
});

// ─── Dynamic Query Groups ───────────────────────────────

describe("Group — dynamic queries", () => {
  it("query group includes matching entities", () => {
    const w = makeWorld();
    const g = Group.query(w, { all: [EnemyTag, Transform] });

    const e1 = w.createEntity();
    w.addMany(e1, EnemyTag, Transform);
    w.set(e1, Transform, { x: 10, y: 20 });

    assert.strictEqual(g.size, 1);
  });

  it("query group excludes non-matching entities", () => {
    const w = makeWorld();
    const g = Group.query(w, { all: [EnemyTag] });

    const e1 = w.createEntity();
    w.add(e1, PlayerTag);

    assert.strictEqual(g.size, 0);
  });

  it("query group updates automatically when entity gains component", () => {
    const w = makeWorld();
    const g = Group.query(w, { all: [EnemyTag, Transform] });

    const e = w.createEntity();
    w.add(e, EnemyTag);
    assert.strictEqual(g.size, 0);

    w.add(e, Transform);
    assert.strictEqual(g.size, 1);
  });

  it("query group updates automatically when entity loses component", () => {
    const w = makeWorld();
    const g = Group.query(w, { all: [EnemyTag, Transform] });

    const e = w.createEntity();
    w.addMany(e, EnemyTag, Transform);
    assert.strictEqual(g.size, 1);

    w.remove(e, EnemyTag);
    assert.strictEqual(g.size, 0);
  });

  it("query group excludes destroyed entities", () => {
    const w = makeWorld();
    const g = Group.query(w, { all: [EnemyTag] });

    const e = w.createEntity();
    w.add(e, EnemyTag);
    assert.strictEqual(g.size, 1);

    w.destroyEntity(e);
    assert.strictEqual(g.size, 0);
  });

  it("query group forEach iterates wrapped sprites", () => {
    const w = makeWorld();
    const g = Group.query(w, { all: [EnemyTag, Transform, Collider] });

    const e = w.createEntity();
    w.addMany(e, EnemyTag, Transform, Collider);
    w.set(e, Transform, { x: 50, y: 100, scaleX: 1, scaleY: 1 });
    w.set(e, Collider, { width: 32, height: 32 });

    g.forEach(s => {
      assert.strictEqual(s.entity, e);
      assert.strictEqual(s.x, 34);
      assert.strictEqual(s.y, 84);
    });
  });

  it("query group map works", () => {
    const w = makeWorld();
    const g = Group.query(w, { all: [EnemyTag, Transform, Collider] });

    const e = w.createEntity();
    w.addMany(e, EnemyTag, Transform, Collider);
    w.set(e, Transform, { x: 30, y: 40, scaleX: 1, scaleY: 1 });
    w.set(e, Collider, { width: 32, height: 32 });

    const result = g.map(s => s.x);
    assert.deepStrictEqual(result, [14]);
  });

  it("query group filter works", () => {
    const w = makeWorld();
    const g = Group.query(w, { all: [EnemyTag, Transform, Collider] });

    const e1 = w.createEntity();
    w.addMany(e1, EnemyTag, Transform, Collider);
    w.set(e1, Transform, { x: 100, y: 0, scaleX: 1, scaleY: 1 });
    w.set(e1, Collider, { width: 32, height: 32 });

    const e2 = w.createEntity();
    w.addMany(e2, EnemyTag, Transform, Collider);
    w.set(e2, Transform, { x: 200, y: 0, scaleX: 1, scaleY: 1 });
    w.set(e2, Collider, { width: 32, height: 32 });

    const result = g.filter(s => s.x > 150);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].entity, e2);
  });

  it("query group find works", () => {
    const w = makeWorld();
    const g = Group.query(w, { all: [EnemyTag, Transform, Collider] });

    const e = w.createEntity();
    w.addMany(e, EnemyTag, Transform, Collider);
    w.set(e, Transform, { x: 42, y: 0, scaleX: 1, scaleY: 1 });
    w.set(e, Collider, { width: 32, height: 32 });

    const found = g.find(s => s.x === 200);
    assert.strictEqual(found, undefined);
  });

  it("query group some/every work", () => {
    const w = makeWorld();
    const g = Group.query(w, { all: [EnemyTag, Transform, Collider] });

    const e = w.createEntity();
    w.addMany(e, EnemyTag, Transform, Collider);
    w.set(e, Transform, { x: 50, y: 0, scaleX: 1, scaleY: 1 });
    w.set(e, Collider, { width: 32, height: 32 });

    assert.strictEqual(g.some(s => s.x > 30), true);
    assert.strictEqual(g.some(s => s.x > 60), false);
    assert.strictEqual(g.every(s => s.x > 30), true);
    assert.strictEqual(g.every(s => s.x > 60), false);
  });

  it("query group properties (size, first, last, children)", () => {
    const w = makeWorld();
    const g = Group.query(w, { all: [EnemyTag, Transform, Collider] });

    const e1 = w.createEntity();
    w.addMany(e1, EnemyTag, Transform, Collider);
    w.set(e1, Transform, { x: 10, y: 20, scaleX: 1, scaleY: 1 });
    w.set(e1, Collider, { width: 32, height: 32 });

    const e2 = w.createEntity();
    w.addMany(e2, EnemyTag, Transform, Collider);
    w.set(e2, Transform, { x: 100, y: 200, scaleX: 1, scaleY: 1 });
    w.set(e2, Collider, { width: 16, height: 16 });

    assert.strictEqual(g.size, 2);
    assert.strictEqual(g.first.entity, e1);
    assert.strictEqual(g.last.entity, e2);
    assert.strictEqual(g.children.length, 2);
  });

  it("Symbol.iterator works on query group", () => {
    const w = makeWorld();
    const g = Group.query(w, { all: [EnemyTag] });

    const e = w.createEntity();
    w.add(e, EnemyTag);

    const result = [...g];
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].entity, e);
  });

  it("query group with any filter matches entities with any of the tags", () => {
    const w = makeWorld();
    const g = Group.query(w, { any: [EnemyTag, PlayerTag] });

    const e1 = w.createEntity();
    w.add(e1, EnemyTag);
    const e2 = w.createEntity();
    w.add(e2, PlayerTag);
    const e3 = w.createEntity();

    assert.strictEqual(g.size, 2);
  });

  it("query group with none filter excludes entities", () => {
    const w = makeWorld();
    const g = Group.query(w, { none: [PlayerTag] });

    const e1 = w.createEntity();
    w.add(e1, EnemyTag);
    const e2 = w.createEntity();
    w.add(e2, PlayerTag);

    assert.strictEqual(g.size, 1);
  });
});

// ─── Query Group Read-Only ──────────────────────────────

describe("Group — query-backed read-only", () => {
  it("add throws", () => {
    const w = makeWorld();
    const g = Group.query(w, { all: [EnemyTag] });
    assert.throws(() => g.add(makeSprite(0, 0, 32, 32, w)), /read-only/);
  });

  it("remove throws", () => {
    const w = makeWorld();
    const g = Group.query(w, { all: [EnemyTag] });
    assert.throws(() => g.remove(makeSprite(0, 0, 32, 32, w)), /read-only/);
  });

  it("clear throws", () => {
    const w = makeWorld();
    const g = Group.query(w, { all: [EnemyTag] });
    assert.throws(() => g.clear(), /read-only/);
  });

  it("has works on query groups", () => {
    const w = makeWorld();
    const g = Group.query(w, { all: [EnemyTag] });

    const e = w.createEntity();
    w.add(e, EnemyTag);
    const sprite = Sprite._wrap(w, e);

    assert.strictEqual(g.has(sprite), true);

    const unrelated = makeSprite(0, 0, 32, 32, w);
    assert.strictEqual(g.has(unrelated), false);
  });
});

// ─── Sprite Integration ─────────────────────────────────

describe("Group — sprite integration", () => {
  it("forEach on query group returns Sprite wrappers", () => {
    const w = makeWorld();
    const g = Group.query(w, { all: [Transform, Collider] });

    const s = makeSprite(10, 20, 32, 32, w);
    g.forEach(sprite => {
      assert.ok(sprite instanceof Sprite);
      assert.strictEqual(sprite.x, 10);
      assert.strictEqual(sprite.y, 20);
    });
  });

  it("forEach on query group wrappers are mutable", () => {
    const w = makeWorld();
    const g = Group.query(w, { all: [Transform, Collider] });

    const s = makeSprite(10, 20, 32, 32, w);
    g.forEach(sprite => {
      sprite.x = 100;
    });
    assert.strictEqual(s.x, 100);
  });

  it("Sprite._wrap returns valid sprite wrapper", () => {
    const w = makeWorld();
    const e = w.createEntity();
    w.addMany(e, Transform, Collider);
    w.set(e, Transform, { x: 50, y: 60, scaleX: 1, scaleY: 1 });
    w.set(e, Collider, { width: 32, height: 32 });

    const s = Sprite._wrap(w, e);
    assert.ok(s instanceof Sprite);
    assert.strictEqual(s.entity, e);
    assert.strictEqual(s.x, 34);
    assert.strictEqual(s.y, 44);
  });

  it("Sprite._wrap wrapper properties are live", () => {
    const w = makeWorld();
    const e = w.createEntity();
    w.addMany(e, Transform, Collider);
    w.set(e, Transform, { x: 50, y: 60, scaleX: 1, scaleY: 1 });
    w.set(e, Collider, { width: 32, height: 32 });

    const s = Sprite._wrap(w, e);
    w.get(e, Transform).x = 100;
    assert.strictEqual(s.x, 84);
  });

  it("groups array updated on manual group membership", () => {
    const w = makeWorld();
    const g = new Group(w);
    const s = makeSprite(0, 0, 32, 32, w);
    g.add(s);
    assert.ok(s.groups.includes(g));
    g.remove(s);
    assert.ok(!s.groups.includes(g));
  });

  it("sprite.kill removes from manual groups", () => {
    const w = makeWorld();
    const g = new Group(w);
    const s = makeSprite(0, 0, 32, 32, w);
    g.add(s);
    s.kill();
    assert.strictEqual(g.size, 0);
    assert.strictEqual(s.groups.length, 0);
  });
});

// ─── Entity Lifecycle ───────────────────────────────────

describe("Group — entity lifecycle", () => {
  it("destroyed sprite removed from query group", () => {
    const w = makeWorld();
    const g = Group.query(w, { all: [Transform, Collider] });
    const s = makeSprite(0, 0, 32, 32, w);
    assert.strictEqual(g.size, 1);

    s.destroy();
    assert.strictEqual(g.size, 0);
  });

  it("destroy removes sprite from manual group via kill()", () => {
    const w = makeWorld();
    const g = new Group(w);
    const s = makeSprite(0, 0, 32, 32, w);
    g.add(s);

    assert.strictEqual(g.size, 1);
    s.destroy();
    assert.strictEqual(g.size, 0);
  });
});

// ─── Error Handling ─────────────────────────────────────

describe("Group — error handling", () => {
  it("query group add throws descriptive error", () => {
    const w = makeWorld();
    const g = Group.query(w, { all: [EnemyTag] });
    try {
      g.add(makeSprite(0, 0, 32, 32, w));
      assert.fail("should have thrown");
    } catch (e) {
      assert.ok(e.message.includes("add"));
      assert.ok(e.message.includes("read-only"));
    }
  });

  it("query group remove throws descriptive error", () => {
    const w = makeWorld();
    const g = Group.query(w, { all: [EnemyTag] });
    try {
      g.remove(makeSprite(0, 0, 32, 32, w));
      assert.fail("should have thrown");
    } catch (e) {
      assert.ok(e.message.includes("remove"));
      assert.ok(e.message.includes("read-only"));
    }
  });

  it("query group clear throws descriptive error", () => {
    const w = makeWorld();
    const g = Group.query(w, { all: [EnemyTag] });
    try {
      g.clear();
      assert.fail("should have thrown");
    } catch (e) {
      assert.ok(e.message.includes("clear"));
      assert.ok(e.message.includes("read-only"));
    }
  });
});

// ─── Collision ──────────────────────────────────────────

describe("Group — collision", () => {
  describe("collideRect", () => {
    it("finds overlapping sprites brute force", () => {
      const w = makeWorld();
      const g = new Group(w);
      g.add(makeSprite(50, 50, 64, 64, w));
      g.add(makeSprite(200, 200, 32, 32, w));

      const hits = g.collideRect({ left: 40, right: 100, top: 40, bottom: 100 });
      assert.strictEqual(hits.length, 1);
    });

    it("returns empty for no overlap", () => {
      const w = makeWorld();
      const g = new Group(w);
      g.add(makeSprite(500, 500, 32, 32, w));

      const hits = g.collideRect({ left: 0, right: 100, top: 0, bottom: 100 });
      assert.strictEqual(hits.length, 0);
    });

    it("accepts out array", () => {
      const w = makeWorld();
      const g = new Group(w);
      g.add(makeSprite(50, 50, 64, 64, w));

      const out = [];
      const hits = g.collideRect({ left: 40, right: 100, top: 40, bottom: 100 }, out);
      assert.strictEqual(hits, out);
      assert.strictEqual(out.length, 1);
    });

    it("skips invisible sprites", () => {
      const w = makeWorld();
      const g = new Group(w);
      const s = makeSprite(50, 50, 64, 64, w);
      s.visible = false;
      g.add(s);

      const hits = g.collideRect({ left: 0, right: 200, top: 0, bottom: 200 });
      assert.strictEqual(hits.length, 0);
    });

    it("works with spatial hash", () => {
      const w = makeWorld();
      const g = new Group(w);
      g.useSpatialHash(64);
      g.add(makeSprite(50, 50, 64, 64, w));
      g.add(makeSprite(500, 500, 32, 32, w));

      const hits = g.collideRect({ left: 40, right: 100, top: 40, bottom: 100 });
      assert.strictEqual(hits.length, 1);
    });
  });

  describe("collidePoint", () => {
    it("finds sprite containing point", () => {
      const w = makeWorld();
      const g = new Group(w);
      g.add(makeSprite(50, 50, 64, 64, w));

      const hits = g.collidePoint({ x: 50, y: 50 });
      assert.strictEqual(hits.length, 1);
    });

    it("returns empty for point outside", () => {
      const w = makeWorld();
      const g = new Group(w);
      g.add(makeSprite(50, 50, 64, 64, w));

      const hits = g.collidePoint({ x: 0, y: 0 });
      assert.strictEqual(hits.length, 0);
    });

    it("skips invisible sprites", () => {
      const w = makeWorld();
      const g = new Group(w);
      const s = makeSprite(50, 50, 64, 64, w);
      s.visible = false;
      g.add(s);

      const hits = g.collidePoint({ x: 50, y: 50 });
      assert.strictEqual(hits.length, 0);
    });
  });

  describe("collideCircle", () => {
    it("finds sprites within radius", () => {
      const w = makeWorld();
      const g = new Group(w);
      g.add(makeSprite(50, 50, 64, 64, w));

      const hits = g.collideCircle(50, 50, 10);
      assert.strictEqual(hits.length, 1);
    });

    it("returns empty for far point", () => {
      const w = makeWorld();
      const g = new Group(w);
      g.add(makeSprite(500, 500, 32, 32, w));

      const hits = g.collideCircle(0, 0, 10);
      assert.strictEqual(hits.length, 0);
    });
  });

  describe("collideGroup", () => {
    it("finds overlapping pairs", () => {
      const w = makeWorld();
      const gA = new Group(w);
      const gB = new Group(w);

      gA.add(makeSprite(50, 50, 64, 64, w));
      gB.add(makeSprite(60, 60, 64, 64, w));

      const pairs = gA.collideGroup(gB);
      assert.strictEqual(pairs.length, 1);
      assert.strictEqual(pairs[0].length, 2);
    });

    it("returns empty for non-overlapping groups", () => {
      const w = makeWorld();
      const gA = new Group(w);
      const gB = new Group(w);

      gA.add(makeSprite(0, 0, 32, 32, w));
      gB.add(makeSprite(500, 500, 32, 32, w));

      const pairs = gA.collideGroup(gB);
      assert.strictEqual(pairs.length, 0);
    });

    it("accepts callback", () => {
      const w = makeWorld();
      const gA = new Group(w);
      const gB = new Group(w);

      gA.add(makeSprite(50, 50, 64, 64, w));
      gB.add(makeSprite(60, 60, 64, 64, w));

      const called = [];
      gA.collideGroup(gB, (a, b) => called.push([a, b]));
      assert.strictEqual(called.length, 1);
    });
  });

  describe("collideSprite", () => {
    it("finds overlapping sprites", () => {
      const w = makeWorld();
      const g = new Group(w);
      g.add(makeSprite(50, 50, 64, 64, w));
      const target = makeSprite(60, 60, 64, 64, w);

      const hits = g.collideSprite(target);
      assert.strictEqual(hits.length, 1);
    });

    it("returns empty for non-overlapping", () => {
      const w = makeWorld();
      const g = new Group(w);
      g.add(makeSprite(0, 0, 32, 32, w));
      const target = makeSprite(500, 500, 32, 32, w);

      const hits = g.collideSprite(target);
      assert.strictEqual(hits.length, 0);
    });

    it("returns empty for invisible target", () => {
      const w = makeWorld();
      const g = new Group(w);
      g.add(makeSprite(50, 50, 64, 64, w));
      const target = makeSprite(60, 60, 64, 64, w);
      target.visible = false;

      const hits = g.collideSprite(target);
      assert.strictEqual(hits.length, 0);
    });
  });

  describe("raycast", () => {
    it("returns empty without spatial hash", () => {
      const w = makeWorld();
      const g = new Group(w);
      g.add(makeSprite(50, 50, 64, 64, w));

      const hits = g.raycast(0, 0, 1, 0, 200);
      assert.strictEqual(hits.length, 0);
    });

    it("finds entities with spatial hash", () => {
      const w = makeWorld();
      const g = new Group(w);
      g.useSpatialHash(64);
      g.add(makeSprite(100, 100, 64, 64, w));

      const hits = g.raycast(0, 132, 1, 0, 250);
      assert.strictEqual(hits.length, 1);
    });
  });

  describe("useSpatialHash", () => {
    it("returns the group for chaining", () => {
      const g = new Group();
      const result = g.useSpatialHash(32);
      assert.strictEqual(result, g);
    });
  });
});

// ─── Query Group Collision ──────────────────────────────

describe("Group — query group collision", () => {
  it("collideRect works on query group", () => {
    const w = makeWorld();
    const g = Group.query(w, { all: [Transform, Collider, Visible] });

    const s = makeSprite(50, 50, 64, 64, w);
    const hits = g.collideRect({ left: 40, right: 100, top: 40, bottom: 100 });
    assert.strictEqual(hits.length, 1);
    assert.ok(hits[0] instanceof Sprite);
  });

  it("collidePoint works on query group", () => {
    const w = makeWorld();
    const g = Group.query(w, { all: [Transform, Collider, Visible] });

    makeSprite(50, 50, 64, 64, w);
    const hits = g.collidePoint({ x: 50, y: 50 });
    assert.strictEqual(hits.length, 1);
  });

  it("collideCircle works on query group", () => {
    const w = makeWorld();
    const g = Group.query(w, { all: [Transform, Collider, Visible] });

    makeSprite(50, 50, 64, 64, w);
    const hits = g.collideCircle(50, 50, 10);
    assert.strictEqual(hits.length, 1);
  });
});

// ─── dispose ────────────────────────────────────────────

describe("Group — dispose", () => {
  it("dispose clears group", () => {
    const w = makeWorld();
    const g = new Group(w);
    g.add(makeSprite(0, 0, 32, 32, w));
    g.dispose();
    assert.strictEqual(g.size, 0);
  });

  it("dispose removes group from sprite.groups", () => {
    const w = makeWorld();
    const g = new Group(w);
    const s = makeSprite(0, 0, 32, 32, w);
    g.add(s);
    g.dispose();
    assert.ok(!s.groups.includes(g));
  });
});

// ─── Performance ────────────────────────────────────────

describe("Group — performance", () => {
  it("sprite wrappers are cached per entity in query group", () => {
    const w = makeWorld();
    const g = Group.query(w, { all: [Transform, Collider] });

    makeSprite(0, 0, 32, 32, w);

    const firstRun = [];
    g.forEach(s => firstRun.push(s));

    const secondRun = [];
    g.forEach(s => secondRun.push(s));

    assert.strictEqual(firstRun.length, 1);
    assert.strictEqual(secondRun.length, 1);
    assert.strictEqual(firstRun[0], secondRun[0]);
  });

  it("can create and iterate many sprites in query group", () => {
    const w = makeWorld();
    const g = Group.query(w, { all: [Transform, Collider] });

    for (let i = 0; i < 100; i++) {
      makeSprite(i * 10, 0, 32, 32, w);
    }

    let count = 0;
    g.forEach(() => count++);
    assert.strictEqual(count, 100);
  });

  it("can create and iterate many sprites in manual group", () => {
    const w = makeWorld();
    const g = new Group(w);

    for (let i = 0; i < 100; i++) {
      g.add(makeSprite(i * 10, 0, 32, 32, w));
    }

    let count = 0;
    g.forEach(() => count++);
    assert.strictEqual(count, 100);
  });
});
