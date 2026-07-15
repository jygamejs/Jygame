import { describe, it, before, after } from "node:test";
import * as assert from "node:assert";

if (typeof globalThis.document === "undefined") {
  globalThis.document = {
    createElement: () => ({
      style: {},
      appendChild: () => {},
      remove: () => {},
      querySelector: () => null,
    }),
    addEventListener: () => {},
    removeEventListener: () => {},
  };
}

import { Scene } from "../../../core/Scene.js";
import { Sprite } from "../../../display/Sprite.js";
import { World } from "../../../ecs/core/World.js";
import { Transform } from "../../../ecs/components/Transform.js";
import { Velocity } from "../../../ecs/components/Velocity.js";
import { Collider } from "../../../ecs/components/Collider.js";
import { Renderable } from "../../../ecs/components/Renderable.js";
import { RenderBounds } from "../../../ecs/components/RenderBounds.js";
import { Animation } from "../../../ecs/components/Animation.js";
import { Visible } from "../../../ecs/components/Visible.js";
import { Trail } from "../../../ecs/components/Trail.js";
import { RenderQueue } from "../../../ecs/render/RenderQueue.js";
import { CanvasContext } from "../../../ecs/render/CanvasContext.js";
import { AnimationClipRegistry } from "../../../ecs/animation/AnimationClipRegistry.js";
import { TrailManager } from "../../../ecs/trails/TrailManager.js";
import { SpatialHash } from "../../../collision/SpatialHash.js";
import { Camera } from "../../../camera/Camera.js";
import { MovementSystem } from "../../../ecs/systems/MovementSystem.js";
import { AnimationSystem } from "../../../ecs/systems/AnimationSystem.js";
import { CollisionSystem } from "../../../ecs/systems/CollisionSystem.js";
import { RenderSystem } from "../../../ecs/systems/RenderSystem.js";
import { TrailSystem } from "../../../ecs/systems/TrailSystem.js";
import { EnemyTag } from "../../../ecs/components/tags/EnemyTag.js";
import { PlayerTag } from "../../../ecs/components/tags/PlayerTag.js";

function mockGame(scene) {
  scene._game = scene.game = {
    ctx: { save() {}, restore() {}, translate() {}, rotate() {}, scale() {}, fillRect() {}, beginPath() {}, arc() {}, fill() {}, drawImage() {}, stroke() {}, moveTo() {}, lineTo() {}, strokeStyle: "", fillStyle: "", lineWidth: 0, getTransform() { return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }; }, setTransform() {} },
    width: 800,
    height: 600,
  };
}

// ─── World Creation ──────────────────────────────────────

describe("Scene — world creation", () => {
  it("creates world lazily on .world access", () => {
    const scene = new Scene();
    assert.strictEqual(scene._world, null);
    const w = scene.world;
    assert.ok(w instanceof World);
  });

  it("returns same world instance on repeated access", () => {
    const scene = new Scene();
    const a = scene.world;
    const b = scene.world;
    assert.strictEqual(a, b);
  });

  it("different scenes have different worlds", () => {
    const a = new Scene();
    const b = new Scene();
    assert.notStrictEqual(a.world, b.world);
  });

  it("world exists after enter()", () => {
    const scene = new Scene();
    scene.enter();
    assert.ok(scene._world instanceof World);
  });

  it("world is null after exit()", () => {
    const scene = new Scene();
    scene.enter();
    scene.exit();
    assert.strictEqual(scene._world, null);
  });
});

// ─── Resources ────────────────────────────────────────────

describe("Scene — resources", () => {
  it("registers SpatialHash resource", () => {
    const scene = new Scene();
    assert.ok(scene.world.getResource(SpatialHash) instanceof SpatialHash);
  });

  it("registers TrailManager resource", () => {
    const scene = new Scene();
    assert.ok(scene.world.getResource(TrailManager) instanceof TrailManager);
  });

  it("registers RenderQueue resource", () => {
    const scene = new Scene();
    assert.ok(scene.world.getResource(RenderQueue) instanceof RenderQueue);
  });

  it("registers AnimationClipRegistry resource", () => {
    const scene = new Scene();
    assert.ok(scene.world.getResource(AnimationClipRegistry) instanceof AnimationClipRegistry);
  });

  it("does not register CanvasContext without game", () => {
    const scene = new Scene();
    scene.enter();
    assert.strictEqual(scene.world.getResource(CanvasContext), undefined);
  });

  it("does not register Camera without game", () => {
    const scene = new Scene();
    scene.enter();
    assert.strictEqual(scene.world.getResource(Camera), undefined);
  });

  it("registers CanvasContext and Camera when game is available", () => {
    const scene = new Scene();
    const mockCtx = { save() {}, restore() {}, getTransform() { return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }; }, setTransform() {} };
    scene._game = { ctx: mockCtx, width: 800, height: 600 };
    scene.enter();
    assert.strictEqual(scene.world.getResource(CanvasContext), mockCtx);
    const cam = scene.world.getResource(Camera);
    assert.ok(cam instanceof Camera);
    assert.strictEqual(cam.width, 800);
    assert.strictEqual(cam.height, 600);
  });
});

// ─── Systems ──────────────────────────────────────────────

describe("Scene — systems", () => {
  it("installs systems into scheduler", () => {
    const scene = new Scene();
    scene.enter();
    assert.ok(scene.world.scheduler);
  });

  it("systems have correct priorities", () => {
    assert.strictEqual(MovementSystem.priority, 0);
    assert.strictEqual(AnimationSystem.priority, 1);
    assert.strictEqual(CollisionSystem.priority, 2);
    assert.strictEqual(RenderSystem.priority, 3);
    assert.strictEqual(TrailSystem.priority, 4);
  });
});

// ─── Sprite Default World ─────────────────────────────

describe("Scene — sprite default world", () => {
  before(() => {
    Sprite._defaultWorld = null;
  });

  after(() => {
    Sprite._defaultWorld = null;
  });

  it("enter() sets Sprite default world", () => {
    const scene = new Scene();
    const saved = Sprite._defaultWorld;
    scene.enter();
    assert.strictEqual(Sprite._defaultWorld, scene._world);
    Sprite._defaultWorld = saved;
  });

  it("exit() restores previous default world", () => {
    const dummy = new World();
    Sprite._defaultWorld = dummy;

    const scene = new Scene();
    scene.enter();
    assert.strictEqual(Sprite._defaultWorld, scene._world);

    scene.exit();
    assert.strictEqual(Sprite._defaultWorld, dummy);

    Sprite._defaultWorld = null;
  });

  it("sprites created after enter use scene world", () => {
    const scene = new Scene();
    scene.enter();

    const s = new Sprite(10, 20, 32, 32);
    assert.strictEqual(s.world, scene._world);

    spriteCleanup(s);
  });

  it("sprites created before enter use original default world", () => {
    const origWorld = new World();
    origWorld.register(Transform);
    origWorld.register(Collider);
    origWorld.register(Renderable);
    origWorld.register(Visible);

    Sprite._defaultWorld = origWorld;

    const s = new Sprite(10, 20, 32, 32);
    assert.strictEqual(s.world, origWorld);

    spriteCleanup(s);
    Sprite._defaultWorld = null;
  });
});

function spriteCleanup(...sprites) {
  for (const s of sprites) {
    if (s && !s._dead) s.destroy();
  }
}

// ─── Scene Lifecycle ──────────────────────────────────

describe("Scene — lifecycle", () => {
  it("enter() sets _entered flag", () => {
    const scene = new Scene();
    scene.enter();
    assert.strictEqual(scene._entered, true);
  });

  it("enter() throws if called twice", () => {
    const scene = new Scene();
    scene.enter();
    assert.throws(() => scene.enter(), /more than once/);
  });

  it("exit() sets _exited flag", () => {
    const scene = new Scene();
    scene.enter();
    scene.exit();
    assert.strictEqual(scene._exited, true);
  });

  it("exit() throws if called twice", () => {
    const scene = new Scene();
    scene.enter();
    scene.exit();
    assert.throws(() => scene.exit(), /more than once/);
  });

  it("exit() clears cleanups", () => {
    const scene = new Scene();
    let called = 0;
    scene.cleanup(() => called++);
    scene.enter();
    scene.exit();
    assert.strictEqual(called, 1);
  });

  it("enter/exit cycle is clean", () => {
    const scene = new Scene();
    scene.enter();
    const w = scene._world;
    scene.exit();

    assert.strictEqual(scene._world, null);
    assert.strictEqual(scene._entered, true);
    assert.strictEqual(scene._exited, true);
  });
});

// ─── Scheduler Integration ────────────────────────────

describe("Scene — scheduler", () => {
  it("world has scheduler", () => {
    const scene = new Scene();
    assert.ok(scene.world.scheduler);
  });

  it("scheduler is bound to the world", () => {
    const scene = new Scene();
    assert.strictEqual(scene.world.scheduler.world, scene.world);
  });

  it("scheduler.update runs without error when mock game provided", () => {
    const scene = new Scene();
    mockGame(scene);
    scene.enter();
    scene.world.update(1 / 60);
  });

  it("systems execute in correct priority order", () => {
    const scene = new Scene();
    mockGame(scene);
    scene.enter();
    const w = scene.world;

    const order = [];
    const origUpdate = w.scheduler.update.bind(w.scheduler);
    w.scheduler.update = function(dt) {
      const systems = w.scheduler._systems;
      if (systems) {
        for (const sys of systems) {
          if (sys.enabled) order.push(sys.constructor.name);
        }
      }
      return origUpdate(dt);
    };

    w.update(1 / 60);

    w.scheduler.update = origUpdate;

    assert.strictEqual(order.length, 6);
    assert.strictEqual(order[0], "SavePrevPositionSystem");
    assert.strictEqual(order[1], "MovementSystem");
    assert.strictEqual(order[2], "AnimationSystem");
    assert.strictEqual(order[3], "CollisionSystem");
    assert.strictEqual(order[4], "RenderSystem");
    assert.strictEqual(order[5], "TrailSystem");
  });

  it("systems execute without crashing on empty world", () => {
    const scene = new Scene();
    mockGame(scene);
    scene.enter();
    scene.world.update(1 / 60);
  });
});

// ─── World update in game loop ────────────────────────

describe("Game loop integration", () => {
  it("Scene world has all components registered", () => {
    const scene = new Scene();
    const w = scene.world;

    const expected = {
      Transform, Velocity, Collider,
      Renderable, RenderBounds,
      Animation, Visible, Trail,
      EnemyTag, PlayerTag,
    };

    for (const [name, cls] of Object.entries(expected)) {
      assert.notStrictEqual(w.registry.getId(cls), null, `Component ${name} not registered`);
    }
  });
});

// ─── Scene Switching ─────────────────────────────────

describe("Scene switching", () => {
  it("new scene after switching has fresh world", () => {
    const a = new Scene();
    const b = new Scene();
    a.enter();
    const wA = a._world;
    a.exit();

    b.enter();
    const wB = b._world;
    assert.notStrictEqual(wA, wB);
  });

  it("exited scene world is null", () => {
    const scene = new Scene();
    scene.enter();
    scene.exit();
    assert.strictEqual(scene._world, null);
  });

  it("switching sprites to new scene works", () => {
    const a = new Scene();
    a.enter();
    Sprite._defaultWorld = a._world;

    const s = new Sprite(0, 0, 32, 32);
    assert.strictEqual(s.world, a._world);

    spriteCleanup(s);
    a.exit();

    const b = new Scene();
    b.enter();
    assert.strictEqual(Sprite._defaultWorld, b._world);
    assert.notStrictEqual(b._world, a._world);

    spriteCleanup();
    b.exit();
  });
});
