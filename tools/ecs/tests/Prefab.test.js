import { describe, it } from "node:test";
import * as assert from "node:assert";
import { World, Prefab, Transform, Velocity, Collider, Visible, Renderable,
  EnemyTag, PlayerTag, ProjectileTag, StaticTag, System } from "../../../ecs/index.js";

function createWorld() {
  const world = new World();
  world.register(Transform);
  world.register(Velocity);
  world.register(Collider);
  world.register(Visible);
  world.register(Renderable);
  world.register(EnemyTag);
  world.register(PlayerTag);
  world.register(ProjectileTag);
  world.register(StaticTag);
  return world;
}

describe("Prefab builder", () => {
  it("creates prefab with chained add/tag", () => {
    const world = createWorld();
    const prefab = world.createPrefab("Test")
      .add(Transform, { x: 10, y: 20 })
      .add(Velocity, { x: 1, y: 2 })
      .tag(EnemyTag);
    assert.ok(prefab instanceof Prefab);
    assert.strictEqual(prefab.name, "Test");
  });

  it("throws on duplicate prefab name", () => {
    const world = createWorld();
    world.createPrefab("Enemy");
    assert.throws(() => world.createPrefab("Enemy"));
  });

  it("preserves component ordering", () => {
    const world = createWorld();
    const prefab = world.createPrefab("OrderTest")
      .add(Velocity, { x: 1, y: 2 })
      .add(Transform, { x: 0, y: 0 })
      .add(Collider, { width: 10, height: 10 });
    assert.strictEqual(prefab._entries.length, 3);
    assert.strictEqual(prefab._entries[0].cls, Velocity);
    assert.strictEqual(prefab._entries[1].cls, Transform);
    assert.strictEqual(prefab._entries[2].cls, Collider);
  });

  it("preserves tag ordering interleaved with components", () => {
    const world = createWorld();
    const prefab = world.createPrefab("TagOrder")
      .add(Transform, null)
      .tag(EnemyTag)
      .add(Velocity, null)
      .tag(PlayerTag);
    assert.strictEqual(prefab._entries.length, 4);
    assert.strictEqual(prefab._entries[0].cls, Transform);
    assert.strictEqual(prefab._entries[1].cls, EnemyTag);
    assert.strictEqual(prefab._entries[2].cls, Velocity);
    assert.strictEqual(prefab._entries[3].cls, PlayerTag);
  });

  it("chaining returns same prefab instance", () => {
    const world = createWorld();
    const prefab = world.createPrefab("Chain");
    const ret = prefab.add(Transform).tag(EnemyTag);
    assert.strictEqual(ret, prefab);
  });
});

describe("Prefab instantiation", () => {
  it("instantiates a single entity", () => {
    const world = createWorld();
    world.createPrefab("Test")
      .add(Transform, { x: 100, y: 200 })
      .add(Velocity, { x: 5, y: 10 });
    const e = world.instantiate("Test");
    assert.ok(world.isAlive(e));
    const t = world.get(e, Transform);
    assert.strictEqual(t.x, 100);
    assert.strictEqual(t.y, 200);
    const v = world.get(e, Velocity);
    assert.strictEqual(v.x, 5);
    assert.strictEqual(v.y, 10);
  });

  it("instantiates via prefab object directly", () => {
    const world = createWorld();
    const prefab = world.createPrefab("Direct")
      .add(Transform, { x: 1, y: 2 });
    const e = prefab.instantiate(world);
    const t = world.get(e, Transform);
    assert.strictEqual(t.x, 1);
  });

  it("multiple instantiations produce unique instances", () => {
    const world = createWorld();
    world.createPrefab("Unique")
      .add(Transform, { x: 0, y: 0 });
    const a = world.instantiate("Unique");
    const b = world.instantiate("Unique");
    assert.notStrictEqual(a, b);
    const ta = world.get(a, Transform);
    ta.x = 999;
    const tb = world.get(b, Transform);
    assert.strictEqual(tb.x, 0);
  });

  it("instantiates multiple entities", () => {
    const world = createWorld();
    world.createPrefab("Multi")
      .add(Transform, { x: 0, y: 0 });
    const entities = [];
    for (let i = 0; i < 100; i++) {
      entities.push(world.instantiate("Multi"));
    }
    assert.strictEqual(entities.length, 100);
    for (const e of entities) {
      assert.ok(world.isAlive(e));
    }
  });

  it("preserves tags on instantiated entity", () => {
    const world = createWorld();
    world.createPrefab("TaggedEnemy")
      .add(Transform, { x: 0, y: 0 })
      .add(Velocity, { x: 1, y: 1 })
      .tag(EnemyTag);
    const e = world.instantiate("TaggedEnemy");
    assert.ok(world.has(e, EnemyTag));
    assert.ok(world.has(e, Transform));
    assert.ok(world.has(e, Velocity));
  });

  it("deterministic ordering across instantiations", () => {
    const world = createWorld();
    world.createPrefab("Det")
      .add(Velocity, { x: 1, y: 1 })
      .tag(EnemyTag)
      .add(Transform, { x: 0, y: 0 });
    const e1 = world.instantiate("Det");
    const e2 = world.instantiate("Det");
    assert.ok(world.has(e1, Velocity));
    assert.ok(world.has(e1, EnemyTag));
    assert.ok(world.has(e1, Transform));
    assert.ok(world.has(e2, Velocity));
    assert.ok(world.has(e2, EnemyTag));
    assert.ok(world.has(e2, Transform));
  });
});

describe("Prefab overrides", () => {
  it("overrides specified fields", () => {
    const world = createWorld();
    world.createPrefab("Overridable")
      .add(Transform, { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 })
      .add(Velocity, { x: 0, y: 0 });
    const e = world.instantiate("Overridable", {
      Transform: { x: 500, y: 300 },
    });
    const t = world.get(e, Transform);
    assert.strictEqual(t.x, 500);
    assert.strictEqual(t.y, 300);
    assert.strictEqual(t.rotation, 0);
    assert.strictEqual(t.scaleX, 1);
    assert.strictEqual(t.scaleY, 1);
  });

  it("multiple overrides across components", () => {
    const world = createWorld();
    world.createPrefab("MultiOverride")
      .add(Transform, { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 })
      .add(Velocity, { x: 0, y: 0 })
      .add(Collider, { width: 10, height: 10 });
    const e = world.instantiate("MultiOverride", {
      Transform: { x: 100 },
      Velocity: { y: -5 },
      Collider: { width: 20, height: 20 },
    });
    const t = world.get(e, Transform);
    assert.strictEqual(t.x, 100);
    assert.strictEqual(t.y, 0);
    const v = world.get(e, Velocity);
    assert.strictEqual(v.x, 0);
    assert.strictEqual(v.y, -5);
    const c = world.get(e, Collider);
    assert.strictEqual(c.width, 20);
    assert.strictEqual(c.height, 20);
  });

  it("override on component without prefab defaults", () => {
    const world = createWorld();
    world.createPrefab("NoDefaults")
      .tag(EnemyTag)
      .add(Transform, { x: 0, y: 0 });
    const e = world.instantiate("NoDefaults", {
      Transform: { x: 42 },
    });
    const t = world.get(e, Transform);
    assert.strictEqual(t.x, 42);
    assert.ok(world.has(e, EnemyTag));
  });

  it("override preserves tags", () => {
    const world = createWorld();
    world.createPrefab("OverrideWithTag")
      .add(Transform, { x: 0, y: 0 })
      .tag(PlayerTag);
    const e = world.instantiate("OverrideWithTag", {
      Transform: { x: 77 },
    });
    assert.strictEqual(world.get(e, Transform).x, 77);
    assert.ok(world.has(e, PlayerTag));
  });

  it("throws on missing prefab", () => {
    const world = createWorld();
    assert.throws(() => world.instantiate("NonExistent"));
  });
});

describe("Edge cases", () => {
  it("empty prefab instantiation", () => {
    const world = createWorld();
    world.createPrefab("Empty");
    const e = world.instantiate("Empty");
    assert.ok(world.isAlive(e));
  });

  it("prefab with only tags", () => {
    const world = createWorld();
    world.createPrefab("TagsOnly")
      .tag(EnemyTag)
      .tag(ProjectileTag);
    const e = world.instantiate("TagsOnly");
    assert.ok(world.has(e, EnemyTag));
    assert.ok(world.has(e, ProjectileTag));
  });

  it("duplicate component registration via prefab", () => {
    const world = createWorld();
    world.createPrefab("DupComp")
      .add(Transform, { x: 1, y: 2 })
      .add(Transform, { x: 3, y: 4 });
    const e = world.instantiate("DupComp");
    const t = world.get(e, Transform);
    assert.strictEqual(t.x, 3);
    assert.strictEqual(t.y, 4);
  });

  it("throws on invalid component at instantiation time", () => {
    const world = createWorld();
    class FakeComp {}
    world.createPrefab("Bad").add(FakeComp);
    assert.throws(() => world.instantiate("Bad"), /not registered/);
  });

  it("component with all defaults (zero values)", () => {
    const world = createWorld();
    world.createPrefab("Defaults")
      .add(Transform);
    const e = world.instantiate("Defaults");
    const t = world.get(e, Transform);
    assert.strictEqual(t.x, 0);
    assert.strictEqual(t.y, 0);
    assert.strictEqual(t.rotation, 0);
    assert.strictEqual(t.scaleX, 0);
    assert.strictEqual(t.scaleY, 0);
  });
});

describe("Integration", () => {
  it("prefab entities match system queries", () => {
    const world = createWorld();
    world.createPrefab("Movable")
      .add(Transform, { x: 10, y: 20 })
      .add(Velocity, { x: 1, y: 0 });

    const entities = [];
    for (let i = 0; i < 5; i++) entities.push(world.instantiate("Movable"));
    for (const e of entities) {
      const t = world.get(e, Transform);
      t.x += world.get(e, Velocity).x;
    }
    for (const e of entities) {
      assert.strictEqual(world.get(e, Transform).x, 11);
    }
  });

  it("prefab entities interact with systems", () => {
    class TestEvent { static fields = ["x", "y"]; }
    const seen = [];

    const world = createWorld();
    world.registerEvent(TestEvent);

    world.createPrefab("Emitter")
      .tag(EnemyTag);

    class EmitterSystem extends System {
      static priority = 0;
      static query = { all: [EnemyTag] };
      update(ctx) {
        for (const table of ctx) {
          for (let r = 0; r < table.count; r++) {
            ctx.events.emit(TestEvent, { x: 1, y: 2 });
          }
        }
      }
    }

    class ReaderSystem extends System {
      static priority = 1;
      update(ctx) {
        for (const ev of ctx.events.read(TestEvent)) {
          seen.push(ev);
        }
      }
    }

    world.addSystem(new EmitterSystem());
    world.addSystem(new ReaderSystem());
    world.instantiate("Emitter");
    world.update(0.016);
    assert.strictEqual(seen.length, 1);
  });

  it("prefab entity indistinguishable from manual entity", () => {
    const world = createWorld();
    world.createPrefab("Gold")
      .add(Transform, { x: 100, y: 200 })
      .tag(EnemyTag);

    const prefabE = world.instantiate("Gold");
    const manualE = world.entity()
      .with(Transform, { x: 100, y: 200 })
      .with(EnemyTag)
      .create();

    assert.ok(world.isAlive(prefabE));
    assert.ok(world.isAlive(manualE));
    assert.ok(world.has(prefabE, Transform));
    assert.ok(world.has(manualE, Transform));
    assert.ok(world.has(prefabE, EnemyTag));
    assert.ok(world.has(manualE, EnemyTag));
    assert.strictEqual(world.get(prefabE, Transform).x, world.get(manualE, Transform).x);
    assert.strictEqual(world.get(prefabE, Transform).y, world.get(manualE, Transform).y);
    assert.ok(world.archetypeSystem.entitySignature(prefabE).equals(
      world.archetypeSystem.entitySignature(manualE)));
  });
});
