import { describe, it } from "node:test";
import * as assert from "node:assert";
import {
  World,
  Transform,
  Velocity,
  Collider,
  Renderable,
  Visible,
  RenderBounds,
  Animation,
  AnimationCallbacks,
  AnimationClip,
  AnimationClipRegistry,
  AnimationPlayback,
  AssetRegistry,
  AnimationSystem,
} from "../../../ecs/index.js";
import { Sprite } from "../../../display/Sprite.js";

function createWorld() {
  const world = new World();
  world.register(Transform);
  world.register(Velocity);
  world.register(Collider);
  world.register(Renderable);
  world.register(Visible);
  world.register(RenderBounds);
  world.register(Animation);
  world.setResource(AnimationClipRegistry, new AnimationClipRegistry());
  world.setResource(AnimationCallbacks, new AnimationCallbacks());
  world.setResource(AnimationPlayback, new AnimationPlayback());
  world.setResource(AssetRegistry, new AssetRegistry());
  world.addSystem(new AnimationSystem());
  return world;
}

function makeSprite(world) {
  Sprite.setDefaultWorld(world);
  const s = new Sprite();
  s.animation.addAll({
    idle:    new AnimationClip({ frames: [0, 1], fps: 10, loop: true }),
    walk:    new AnimationClip({ frames: [2, 3], fps: 10, loop: true }),
    run:     new AnimationClip({ frames: [4, 5], fps: 10, loop: true }),
    jump:    new AnimationClip({ frames: [6, 7, 8, 9], fps: 10, loop: true }),
    attack:  new AnimationClip({ frames: [10, 11, 12], fps: 10, loop: true }),
    attack1: new AnimationClip({ frames: [13, 14], fps: 10, loop: true }),
    attack2: new AnimationClip({ frames: [15, 16], fps: 10, loop: true }),
    attack3: new AnimationClip({ frames: [17, 18], fps: 10, loop: true }),
    stun:    new AnimationClip({ frames: [19, 20], fps: 10, loop: true }),
    death:   new AnimationClip({ frames: [21, 22, 23], fps: 10, loop: false }),
  });
  return s;
}

function readState(sprite) {
  const c = sprite.world.get(sprite.entity, Animation);
  return { current: sprite.animation.current, frame: c.frameIndex, playing: sprite.animation.playing, mode: c.mode };
}

// ─── play() ─────────────────────────────────────────────
describe("animation.play()", () => {
  it("repeated play() of the same name does not restart the animation", () => {
    const world = createWorld();
    const s = makeSprite(world);
    s.animation.play("walk");
    const c = s.world.get(s.entity, Animation);
    world.update(0.05);
    const elapsedBefore = c.elapsed;
    s.animation.play("walk");
    assert.strictEqual(c.elapsed, elapsedBefore);
  });

  it("persistent requests can change every frame", () => {
    const world = createWorld();
    const s = makeSprite(world);
    s.animation.play("idle");
    s.animation.play("walk");
    assert.strictEqual(s.animation.current, "walk");
    s.animation.play("run");
    assert.strictEqual(s.animation.current, "run");
  });

  it("play() is a persistent request that keeps playing", () => {
    const world = createWorld();
    const s = makeSprite(world);
    s.animation.play("walk");
    for (let i = 0; i < 20; i++) world.update(1 / 60);
    assert.strictEqual(s.animation.playing, true);
    assert.strictEqual(s.animation.current, "walk");
  });
});

// ─── playOnce() ──────────────────────────────────────────
describe("animation.playOnce()", () => {
  it("starts immediately", () => {
    const world = createWorld();
    const s = makeSprite(world);
    s.animation.play("walk");
    s.animation.playOnce("jump");
    assert.strictEqual(s.animation.current, "jump");
    assert.strictEqual(s.animation.playing, true);
  });

  it("plays a looping clip exactly once, then resumes the persistent request", () => {
    const world = createWorld();
    const s = makeSprite(world);
    s.animation.play("walk");
    s.animation.playOnce("jump");

    const seen = [];
    for (let i = 0; i < 60; i++) {
      s.animation.play("walk");
      world.update(1 / 60);
      seen.push(s.animation.current);
    }

    assert.strictEqual(seen[0], "jump");
    const lastJump = seen.lastIndexOf("jump");
    assert.ok(lastJump < 30, `jump must not loop (last jump tick = ${lastJump})`);
    assert.strictEqual(seen[seen.length - 1], "walk");
    assert.strictEqual(s.animation.playing, true);
  });

  it("is not interrupted by subsequent play() calls", () => {
    const world = createWorld();
    const s = makeSprite(world);
    s.animation.play("idle");
    s.animation.playOnce("jump");
    s.animation.play("walk");
    assert.strictEqual(s.animation.current, "jump");
    for (let i = 0; i < 60; i++) {
      s.animation.play("walk");
      world.update(1 / 60);
    }
    assert.strictEqual(s.animation.current, "walk");
  });

  it("works when called while idle", () => {
    const world = createWorld();
    const s = makeSprite(world);
    s.animation.play("idle");
    s.animation.playOnce("jump");
    assert.strictEqual(s.animation.current, "jump");
  });

  it("works when called while walking", () => {
    const world = createWorld();
    const s = makeSprite(world);
    s.animation.play("walk");
    s.animation.playOnce("jump");
    assert.strictEqual(s.animation.current, "jump");
  });

  it("repeated playOnce() replaces the active one-shot", () => {
    const world = createWorld();
    const s = makeSprite(world);
    s.animation.playOnce("attack1");
    assert.strictEqual(s.animation.current, "attack1");
    s.animation.playOnce("attack2");
    assert.strictEqual(s.animation.current, "attack2");
  });
});

// ─── forced playback ─────────────────────────────────────
describe("animation.play(name, { force: true })", () => {
  it("overrides normal playback", () => {
    const world = createWorld();
    const s = makeSprite(world);
    s.animation.play("walk");
    s.animation.play("death", { force: true });
    assert.strictEqual(s.animation.current, "death");
  });

  it("is not interrupted by ordinary play() calls", () => {
    const world = createWorld();
    const s = makeSprite(world);
    s.animation.play("walk");
    s.animation.play("death", { force: true });
    s.animation.play("idle");
    s.animation.play("run");
    assert.strictEqual(s.animation.current, "death");
  });

  it("completes and resumes the latest persistent request", () => {
    const world = createWorld();
    const s = makeSprite(world);
    s.animation.play("walk");
    s.animation.play("death", { force: true });
    for (let i = 0; i < 40; i++) {
      s.animation.play("walk");
      world.update(1 / 60);
    }
    assert.strictEqual(s.animation.current, "walk");
    assert.strictEqual(s.animation.playing, true);
  });

  it("remains stopped after completion with resume:false", () => {
    const world = createWorld();
    const s = makeSprite(world);
    s.animation.play("walk");
    s.animation.play("death", { force: true, resume: false });
    for (let i = 0; i < 40; i++) {
      s.animation.play("walk");
      world.update(1 / 60);
    }
    assert.strictEqual(s.animation.current, "death");
    assert.strictEqual(s.animation.playing, false);
    assert.strictEqual(readState(s).frame, 2); // holds on last death frame
  });

  it("respects a looping clip unless loop:false is passed", () => {
    const world = createWorld();
    const s = makeSprite(world);
    s.animation.play("walk");
    s.animation.play("stun", { force: true }); // stun.loop = true → keeps looping
    for (let i = 0; i < 40; i++) {
      s.animation.play("walk");
      world.update(1 / 60);
    }
    assert.strictEqual(s.animation.current, "stun");

    const s2 = makeSprite(world);
    s2.animation.play("walk");
    s2.animation.play("stun", { force: true, loop: false }); // force finite
    for (let i = 0; i < 40; i++) {
      s2.animation.play("walk");
      world.update(1 / 60);
    }
    assert.strictEqual(s2.animation.current, "walk");
  });
});

// ─── queue() ─────────────────────────────────────────────
describe("animation.queue()", () => {
  it("starts immediately when there is no active temporary playback", () => {
    const world = createWorld();
    const s = makeSprite(world);
    s.animation.play("idle");
    s.animation.queue("attack");
    assert.strictEqual(s.animation.current, "attack");
  });

  it("plays after the current one-shot", () => {
    const world = createWorld();
    const s = makeSprite(world);
    s.animation.play("idle");
    s.animation.playOnce("attack1");
    s.animation.queue("attack2");

    const seen = [];
    for (let i = 0; i < 60; i++) {
      s.animation.play("idle");
      world.update(1 / 60);
      seen.push(s.animation.current);
    }

    const i1 = seen.lastIndexOf("attack1");
    const i2 = seen.lastIndexOf("attack2");
    assert.ok(i1 >= 0 && i2 >= 0, "attack1 and attack2 both played");
    assert.ok(i1 < i2, "attack1 completes before attack2");
    assert.ok(seen.slice(i2 + 1).every((n) => n === "idle"));
  });

  it("executes multiple queued animations in order", () => {
    const world = createWorld();
    const s = makeSprite(world);
    s.animation.playOnce("attack1");
    s.animation.queue("attack2");
    s.animation.queue("attack3");

    const seen = [];
    for (let i = 0; i < 90; i++) {
      s.animation.play("idle");
      world.update(1 / 60);
      seen.push(s.animation.current);
    }

    const i1 = seen.lastIndexOf("attack1");
    const i2 = seen.lastIndexOf("attack2");
    const i3 = seen.lastIndexOf("attack3");
    assert.ok(i1 < i2 && i2 < i3, "attack1 → attack2 → attack3");
    assert.ok(seen.slice(i3 + 1).every((n) => n === "idle"));
  });

  it("is not destroyed by ordinary play() calls", () => {
    const world = createWorld();
    const s = makeSprite(world);
    s.animation.play("idle");
    s.animation.playOnce("attack1");
    s.animation.queue("attack2");
    s.animation.play("walk");

    const seen = [];
    for (let i = 0; i < 60; i++) {
      s.animation.play("walk");
      world.update(1 / 60);
      seen.push(s.animation.current);
    }

    const i2 = seen.lastIndexOf("attack2");
    assert.ok(i2 >= 0, "queue survived the play('walk') call");
    assert.ok(seen.slice(i2 + 1).every((n) => n === "walk"));
  });

  it("clearQueue() removes queued animations but lets the current one finish", () => {
    const world = createWorld();
    const s = makeSprite(world);
    s.animation.play("idle");
    s.animation.playOnce("attack1");
    s.animation.queue("attack2");
    s.animation.queue("attack3");
    s.animation.clearQueue();

    const seen = [];
    for (let i = 0; i < 60; i++) {
      s.animation.play("idle");
      world.update(1 / 60);
      seen.push(s.animation.current);
    }

    assert.ok(seen.includes("attack1"));
    assert.ok(!seen.includes("attack2"));
    assert.ok(!seen.includes("attack3"));
    assert.ok(seen.slice(seen.lastIndexOf("attack1") + 1).every((n) => n === "idle"));
  });
});

// ─── completion events ───────────────────────────────────
describe("animation.onComplete()", () => {
  it("fires exactly once with the completed clip name", () => {
    const world = createWorld();
    const s = makeSprite(world);
    const names = [];
    s.animation.onComplete((name) => names.push(name));
    s.animation.play("walk");
    s.animation.playOnce("jump");
    for (let i = 0; i < 60; i++) {
      s.animation.play("walk");
      world.update(1 / 60);
    }
    assert.deepStrictEqual(names, ["jump"]);
  });

  it("fires once per queued clip, in order", () => {
    const world = createWorld();
    const s = makeSprite(world);
    const names = [];
    s.animation.onComplete((name) => names.push(name));
    s.animation.playOnce("attack1");
    s.animation.queue("attack2");
    s.animation.queue("attack3");
    for (let i = 0; i < 90; i++) {
      s.animation.play("idle");
      world.update(1 / 60);
    }
    assert.deepStrictEqual(names, ["attack1", "attack2", "attack3"]);
  });

  it("does not fire for looping playback", () => {
    const world = createWorld();
    const s = makeSprite(world);
    let fired = 0;
    s.animation.onComplete(() => fired++);
    s.animation.play("walk");
    for (let i = 0; i < 40; i++) world.update(1 / 60);
    assert.strictEqual(fired, 0);
  });

  it("callback can safely trigger new playback without corrupting state", () => {
    const world = createWorld();
    const s = makeSprite(world);
    s.animation.onComplete((name) => {
      if (name === "jump") s.animation.playOnce("attack");
    });
    s.animation.play("idle");
    s.animation.playOnce("jump");

    const seen = [];
    for (let i = 0; i < 90; i++) {
      s.animation.play("idle");
      world.update(1 / 60);
      seen.push(s.animation.current);
    }

    const lastAttack = seen.lastIndexOf("attack");
    assert.ok(lastAttack > seen.lastIndexOf("jump"), "callback-launched attack played");
    assert.ok(seen.slice(lastAttack + 1).every((n) => n === "idle"));
  });
});

// ─── integration / regression ────────────────────────────
describe("integration regression", () => {
  it("one-frame jump press + persistent walk/idle requests", () => {
    const world = createWorld();
    const s = makeSprite(world);
    s.animation.play("walk");

    let pressed = true; // Input.pressed("jump") — a single frame edge
    const seen = [];
    for (let i = 0; i < 60; i++) {
      if (pressed) {
        s.animation.playOnce("jump");
        pressed = false;
      }
      s.animation.play("idle");
      world.update(1 / 60);
      seen.push(s.animation.current);
    }

    assert.strictEqual(seen[0], "jump");
    assert.ok(seen.slice(1, 8).every((n) => n === "jump"), "jump not cancelled by play('idle')");
    assert.strictEqual(seen[seen.length - 1], "idle");
  });

  it("walk/run persists, jump plays through, and the latest request wins on resume", () => {
    const world = createWorld();
    const s = makeSprite(world);
    s.animation.play("walk");
    s.animation.playOnce("jump");

    const seen = [];
    let moving = false;
    for (let i = 0; i < 60; i++) {
      // simulate a move input turning on halfway through the jump
      if (i === 15) moving = true;
      s.animation.play(moving ? "run" : "walk");
      world.update(1 / 60);
      seen.push(s.animation.current);
    }
    assert.ok(seen.includes("jump"));
    assert.strictEqual(seen[seen.length - 1], "run", "resumes the latest persistent request");
  });
});
