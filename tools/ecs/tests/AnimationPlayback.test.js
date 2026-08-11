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

function makeMarkerSprite(world) {
  Sprite.setDefaultWorld(world);
  const s = new Sprite();
  s.animation.addAll({
    idle: new AnimationClip({ frames: [0, 1], fps: 10, loop: true }),
    walk: new AnimationClip({ frames: [2, 3], fps: 10, loop: true }),
    jump: new AnimationClip({
      frames: [6, 7, 8, 9, 10],
      fps: 10,
      loop: true,
      timing: [0.08, 0.08, 0.5, 0.1, 0.12],
      markers: { airborne: 2, landing: 4 },
    }),
    attack: new AnimationClip({
      frames: [11, 12, 13],
      fps: 10,
      loop: true,
      markers: { windup: 1, impact: 2 },
    }),
    death: new AnimationClip({
      frames: [30, 31, 32],
      fps: 10,
      loop: false,
      markers: { corpse: 2 },
    }),
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

// ─── marker stop state ─────────────────────────────────
describe("marker stop state", () => {
  it("startPlayback resets the stopAt target", () => {
    const world = createWorld();
    const s = makeSprite(world);
    s.animation.play("walk");
    const c = s.world.get(s.entity, Animation);
    c.stopAt = 5;
    s.animation.playOnce("jump");
    assert.strictEqual(c.stopAt, 0);
  });

  it("stop() resets the stopAt target", () => {
    const world = createWorld();
    const s = makeSprite(world);
    s.animation.play("walk");
    const c = s.world.get(s.entity, Animation);
    c.stopAt = 5;
    s.animation.stop();
    assert.strictEqual(c.stopAt, 0);
  });
});

// ─── playUntil / pauseAt ────────────────────────────────
describe("animation.playUntil() / pauseAt()", () => {
  it("playUntil starts the clip and stops exactly at the marker", () => {
    const world = createWorld();
    const s = makeMarkerSprite(world);
    s.animation.playUntil("jump", "airborne");
    assert.strictEqual(s.animation.current, "jump");
    assert.strictEqual(s.animation.playing, true);

    const seen = [];
    for (let i = 0; i < 40; i++) {
      world.update(1 / 60);
      seen.push(readState(s).frame);
    }
    assert.deepStrictEqual([...new Set(seen)], [0, 1, 2]);
    assert.strictEqual(readState(s).frame, 2);
    assert.strictEqual(s.animation.playing, false);
  });

  it("playUntil does not fire onComplete at the marker", () => {
    const world = createWorld();
    const s = makeMarkerSprite(world);
    const completed = [];
    s.animation.onComplete((name) => completed.push(name));
    s.animation.playUntil("jump", "airborne");
    for (let i = 0; i < 40; i++) world.update(1 / 60);
    assert.deepStrictEqual(completed, []);
  });

  it("playUntil preserves the frame and resume() continues to completion", () => {
    const world = createWorld();
    const s = makeMarkerSprite(world);
    const completed = [];
    s.animation.onComplete((name) => completed.push(name));
    s.animation.playUntil("jump", "airborne");
    for (let i = 0; i < 40; i++) world.update(1 / 60);
    assert.strictEqual(readState(s).frame, 2);

    s.animation.resume();
    const seen = [];
    for (let i = 0; i < 120; i++) {
      world.update(1 / 60);
      seen.push(readState(s).frame);
    }
    assert.ok(seen.includes(3), "advanced past the marker");
    assert.strictEqual(seen[seen.length - 1], 4, "ran to the final frame");
    assert.strictEqual(s.animation.playing, false);
    assert.deepStrictEqual(completed, ["jump"]);
  });

  it("playUntil does not advance the queue while paused at a marker", () => {
    const world = createWorld();
    const s = makeMarkerSprite(world);
    s.animation.play("idle");
    s.animation.playUntil("jump", "airborne");
    s.animation.queue("attack");
    for (let i = 0; i < 40; i++) world.update(1 / 60);
    assert.strictEqual(readState(s).frame, 2);
    assert.strictEqual(s.animation.playing, false);
    assert.strictEqual(s.animation.current, "jump", "queue must not advance");

    s.animation.resume();
    const seen = [];
    for (let i = 0; i < 120; i++) {
      world.update(1 / 60);
      seen.push(s.animation.current);
    }
    assert.ok(seen.includes("attack"), "queued attack plays after completion");
    assert.strictEqual(seen[seen.length - 1], "idle", "returns to the persistent request");
  });

  it("resume() after playUntil returns to the persistent request", () => {
    const world = createWorld();
    const s = makeMarkerSprite(world);
    s.animation.play("walk");
    s.animation.playUntil("jump", "airborne");
    for (let i = 0; i < 40; i++) world.update(1 / 60);
    assert.strictEqual(readState(s).frame, 2);

    s.animation.resume();
    const seen = [];
    for (let i = 0; i < 120; i++) {
      s.animation.play("walk");
      world.update(1 / 60);
      seen.push(s.animation.current);
    }
    assert.strictEqual(seen[seen.length - 1], "walk");
  });

  it("playUntil arms a marker on the already-playing persistent clip", () => {
    const world = createWorld();
    const s = makeMarkerSprite(world);
    s.animation.play("jump"); // looping persistent clip
    s.animation.playUntil("jump", "airborne");
    for (let i = 0; i < 40; i++) world.update(1 / 60);
    assert.strictEqual(readState(s).frame, 2);
    assert.strictEqual(s.animation.playing, false);

    s.animation.resume();
    const seen = [];
    for (let i = 0; i < 120; i++) {
      world.update(1 / 60);
      seen.push(readState(s).frame);
    }
    assert.strictEqual(seen[seen.length - 1], 4, "plays finitely to the end");
    assert.strictEqual(s.animation.playing, false);
  });

  it("playUntil with a marker at the final position stops there without completing", () => {
    const world = createWorld();
    const s = makeMarkerSprite(world);
    const completed = [];
    s.animation.onComplete((name) => completed.push(name));
    s.animation.playUntil("jump", "landing");
    for (let i = 0; i < 120; i++) world.update(1 / 60);
    assert.strictEqual(readState(s).frame, 4);
    assert.strictEqual(s.animation.playing, false);
    assert.deepStrictEqual(completed, []);
  });

  it("explicit addressing selects the animation and its marker", () => {
    const world = createWorld();
    const s = makeMarkerSprite(world);
    s.animation.playUntil("attack", "impact");
    assert.strictEqual(s.animation.current, "attack");
    const seen = [];
    for (let i = 0; i < 40; i++) {
      world.update(1 / 60);
      seen.push(readState(s).frame);
    }
    assert.strictEqual(readState(s).frame, 2);
    assert.strictEqual(s.animation.playing, false);
  });

  it("the same marker name in different clips is not ambiguous", () => {
    const world = createWorld();
    const s = makeMarkerSprite(world);
    s.animation.add("hurt", new AnimationClip({ frames: [40, 41], fps: 10, loop: true, markers: { impact: 1 } }));
    s.animation.playUntil("attack", "impact");
    assert.strictEqual(s.animation.current, "attack");
    s.animation.playUntil("hurt", "impact");
    assert.strictEqual(s.animation.current, "hurt");
    // hurt's impact is at position 1 (not attack's 2)
    for (let i = 0; i < 20; i++) world.update(1 / 60);
    assert.strictEqual(readState(s).frame, 1);
    assert.strictEqual(s.animation.playing, false);
  });

  it("playUntil rejects an unknown animation", () => {
    const world = createWorld();
    const s = makeMarkerSprite(world);
    assert.throws(() => s.animation.playUntil("nope", "airborne"), /Unknown animation "nope"/);
  });

  it("playUntil rejects a marker the animation does not define", () => {
    const world = createWorld();
    const s = makeMarkerSprite(world);
    assert.throws(() => s.animation.playUntil("jump", "nope"), /Animation "jump" has no marker "nope"/);
  });

  it("pauseAt arms the current playback without replacing it", () => {
    const world = createWorld();
    const s = makeMarkerSprite(world);
    s.animation.play("jump");
    s.animation.pauseAt("jump", "airborne");
    assert.strictEqual(s.animation.current, "jump");

    const seen = [];
    for (let i = 0; i < 40; i++) {
      world.update(1 / 60);
      seen.push(readState(s).frame);
    }
    assert.deepStrictEqual([...new Set(seen)], [0, 1, 2]);
    assert.strictEqual(readState(s).frame, 2);
    assert.strictEqual(s.animation.playing, false);

    s.animation.resume();
    const c = s.world.get(s.entity, Animation);
    assert.strictEqual(c.stopAt, 0);
    for (let i = 0; i < 120; i++) world.update(1 / 60);
    assert.strictEqual(readState(s).frame, 4);
    assert.strictEqual(s.animation.playing, false);
  });

  it("pauseAt requires the named animation to be the current one", () => {
    const world = createWorld();
    const s = makeMarkerSprite(world);
    assert.throws(() => s.animation.pauseAt("jump", "airborne"), /not.*currently playing/);
  });

  it("pauseAt rejects an unknown animation", () => {
    const world = createWorld();
    const s = makeMarkerSprite(world);
    s.animation.play("idle");
    assert.throws(() => s.animation.pauseAt("nope", "airborne"), /Unknown animation "nope"/);
  });

  it("pauseAt rejects a marker the named animation does not define", () => {
    const world = createWorld();
    const s = makeMarkerSprite(world);
    s.animation.play("idle");
    assert.throws(() => s.animation.pauseAt("idle", "airborne"), /Animation "idle" has no marker "airborne"/);
  });

  it("pause() clears the armed stop target", () => {
    const world = createWorld();
    const s = makeMarkerSprite(world);
    s.animation.play("jump");
    s.animation.pauseAt("jump", "airborne");
    const c = s.world.get(s.entity, Animation);
    assert.strictEqual(c.stopAt, 3);
    s.animation.pause();
    assert.strictEqual(c.stopAt, 0);
    assert.strictEqual(s.animation.playing, false);
  });

  it("playUntil does not interrupt a forced animation", () => {
    const world = createWorld();
    const s = makeMarkerSprite(world);
    s.animation.play("walk");
    s.animation.play("death", { force: true });
    s.animation.playUntil("jump", "airborne");
    assert.strictEqual(s.animation.current, "death");
  });

  it("a forced clip can arm its own marker", () => {
    const world = createWorld();
    const s = makeMarkerSprite(world);
    s.animation.play("walk");
    s.animation.play("death", { force: true });
    s.animation.playUntil("death", "corpse");
    const seen = [];
    for (let i = 0; i < 40; i++) {
      world.update(1 / 60);
      seen.push(readState(s).frame);
    }
    assert.deepStrictEqual([...new Set(seen)], [0, 1, 2]);
    assert.strictEqual(readState(s).frame, 2);
    assert.strictEqual(s.animation.playing, false);
  });

  it("_toAssetClip preserves timing and markers when remapping frames to asset ids", () => {
    const world = createWorld();
    const s = makeMarkerSprite(world);
    const clip = new AnimationClip({
      frames: [
        { sourceImage: {}, sx: 0, sy: 0, sw: 8, sh: 8 },
        { sourceImage: {}, sx: 8, sy: 0, sw: 8, sh: 8 },
      ],
      fps: 10,
      loop: true,
      timing: [0.1, 0.2],
      markers: { start: 0, end: 1 },
    });
    s.animation.add("fancy", clip);
    const stored = s.animation.animations.get("fancy");
    assert.strictEqual(typeof stored.frames[0], "number");
    assert.deepStrictEqual(stored.timing, [0.1, 0.2]);
    assert.strictEqual(stored.markers.start, 0);
    assert.strictEqual(stored.markers.end, 1);
  });
});

// ─── playAfter / resumeAt ──────────────────────────────
describe("animation.playAfter() / resumeAt()", () => {
  it("playAfter starts at the position after the marker", () => {
    const world = createWorld();
    const s = makeMarkerSprite(world);
    s.animation.playAfter("jump", "airborne"); // airborne: 2 → start at 3
    assert.strictEqual(s.animation.current, "jump");
    assert.strictEqual(readState(s).frame, 3);
    assert.strictEqual(s.animation.playing, true);
    world.update(0.01); // position 3's timing is 0.1s — still there
    assert.strictEqual(readState(s).frame, 3);
  });

  it("playAfter works with a repeated sequence position", () => {
    const world = createWorld();
    const s = makeMarkerSprite(world);
    s.animation.add("loopJump", new AnimationClip({
      frames: [50, 51, 52, 53, 54, 55, 56],
      sequence: [0, 1, 2, 2, 2, 3, 4],
      fps: 10,
      loop: true,
      markers: { airborne: 2, landing: 6 },
    }));
    s.animation.playAfter("loopJump", "airborne"); // start at 3
    assert.strictEqual(readState(s).frame, 3);
    // position 3 repeats the marker's source frame but is a distinct position
    const clip = s.animation.animations.get("loopJump");
    assert.strictEqual(clip.frames[3], clip.frames[2]);
  });

  it("playAfter uses the positioned frame's duration", () => {
    const world = createWorld();
    const s = makeMarkerSprite(world);
    s.animation.add("timed", new AnimationClip({
      frames: [60, 61, 62, 63],
      fps: 10,
      loop: true,
      timing: [0.1, 0.2, 0.3, 0.4],
      markers: { mid: 1 },
    }));
    s.animation.playAfter("timed", "mid"); // start at 2
    assert.strictEqual(readState(s).frame, 2);
    const c = s.world.get(s.entity, Animation);
    assert.ok(Math.abs(c.elapsed - 0.3) < 1e-6, "cursor placed at timeAt(2)");
    world.update(0.2); // inside position 2's 0.3s
    assert.strictEqual(readState(s).frame, 2);
    world.update(0.2); // 0.5 cumulative → position 3
    assert.strictEqual(readState(s).frame, 3);
  });

  it("playAfter with a final-frame marker ends without wrapping", () => {
    const world = createWorld();
    const s = makeMarkerSprite(world);
    const completed = [];
    s.animation.onComplete((name) => completed.push(name));
    s.animation.playAfter("jump", "landing"); // landing: 4 = last position
    assert.strictEqual(s.animation.current, "jump");
    assert.strictEqual(readState(s).frame, 4);
    assert.strictEqual(s.animation.playing, false);
    assert.deepStrictEqual(completed, []);
    world.update(0.5); // stays ended, does not wrap to frame 0
    assert.strictEqual(readState(s).frame, 4);
  });

  it("resumeAt positions at the exact marker and resumes", () => {
    const world = createWorld();
    const s = makeMarkerSprite(world);
    s.animation.resumeAt("jump", "airborne");
    assert.strictEqual(s.animation.current, "jump");
    assert.strictEqual(readState(s).frame, 2);
    assert.strictEqual(s.animation.playing, true);
  });

  it("resumeAt is cursor-selecting: repositions a marker-paused clip", () => {
    const world = createWorld();
    const s = makeMarkerSprite(world);
    s.animation.playUntil("jump", "airborne");
    for (let i = 0; i < 40; i++) world.update(1 / 60);
    assert.strictEqual(readState(s).frame, 2);
    assert.strictEqual(s.animation.playing, false);

    s.animation.resumeAt("jump", "airborne"); // back to the marker
    assert.strictEqual(readState(s).frame, 2);
    assert.strictEqual(s.animation.playing, true);

    const seen = [];
    for (let i = 0; i < 120; i++) {
      world.update(1 / 60);
      seen.push(readState(s).frame);
    }
    assert.strictEqual(seen[seen.length - 1], 4, "runs to completion");
    assert.strictEqual(s.animation.playing, false);
  });

  it("resumeAt works with timing and repeated frames", () => {
    const world = createWorld();
    const s = makeMarkerSprite(world);
    s.animation.add("seq", new AnimationClip({
      frames: [60, 61, 62, 63, 64],
      sequence: [0, 1, 2, 2, 3, 4],
      fps: 10,
      loop: true,
      timing: [0.1, 0.1, 0.1, 0.3, 0.1, 0.2],
      markers: { airborne: 2, landing: 5 },
    }));
    s.animation.resumeAt("seq", "airborne"); // position 2
    assert.strictEqual(readState(s).frame, 2);
    const c = s.world.get(s.entity, Animation);
    assert.ok(Math.abs(c.elapsed - 0.2) < 1e-6, "cursor placed at timeAt(2)");
    world.update(0.15); // still inside position 2's 0.1s? no — 0.2+0.15=0.35 → position 3
    assert.strictEqual(readState(s).frame, 3);
  });

  it("playAfter and resumeAt respect forced playback ownership", () => {
    const world = createWorld();
    const s = makeMarkerSprite(world);
    s.animation.play("walk");
    s.animation.play("death", { force: true });
    s.animation.playAfter("jump", "airborne");
    assert.strictEqual(s.animation.current, "death");
    s.animation.resumeAt("jump", "airborne");
    assert.strictEqual(s.animation.current, "death");
  });

  it("playAfter and resumeAt do not fire onComplete merely by positioning", () => {
    const world = createWorld();
    const s = makeMarkerSprite(world);
    const completed = [];
    s.animation.onComplete((name) => completed.push(name));
    s.animation.resumeAt("jump", "airborne");
    world.update(1 / 60);
    s.animation.playAfter("jump", "landing");
    assert.deepStrictEqual(completed, []);
  });

  it("playAfter and resumeAt validate the animation and marker", () => {
    const world = createWorld();
    const s = makeMarkerSprite(world);
    assert.throws(() => s.animation.playAfter("nope", "airborne"), /Unknown animation "nope"/);
    assert.throws(() => s.animation.resumeAt("jump", "nope"), /Animation "jump" has no marker "nope"/);
  });
});

// ─── marker queries ────────────────────────────────────
describe("animation.isAt() / hasReached()", () => {
  it("isAt reports the marker only at its exact position", () => {
    const world = createWorld();
    const s = makeMarkerSprite(world);
    s.animation.playUntil("jump", "airborne"); // stops at 2
    for (let i = 0; i < 40; i++) world.update(1 / 60);
    assert.strictEqual(readState(s).frame, 2);
    assert.strictEqual(s.animation.isAt("jump", "airborne"), true);

    s.animation.resume();
    for (let i = 0; i < 40; i++) {
      world.update(1 / 60);
      if (readState(s).frame > 2) break;
    }
    assert.ok(readState(s).frame > 2, "advanced past the marker");
    assert.strictEqual(s.animation.isAt("jump", "airborne"), false);
  });

  it("isAt is true while paused at the marker", () => {
    const world = createWorld();
    const s = makeMarkerSprite(world);
    s.animation.playUntil("jump", "airborne");
    for (let i = 0; i < 40; i++) world.update(1 / 60);
    assert.strictEqual(s.animation.playing, false);
    assert.strictEqual(s.animation.isAt("jump", "airborne"), true);
  });

  it("isAt distinguishes repeated source frames by playback position", () => {
    const world = createWorld();
    const s = makeMarkerSprite(world);
    s.animation.add("seq", new AnimationClip({
      frames: [50, 51, 52, 53, 54],
      sequence: [0, 1, 2, 2, 2, 3, 4],
      fps: 10,
      loop: false,
      markers: { airborne: 2 },
    }));
    s.animation.play("seq"); // plays the 7-position clip once
    const samples = [];
    for (let i = 0; i < 80; i++) {
      world.update(1 / 60);
      samples.push([readState(s).frame, s.animation.isAt("seq", "airborne")]);
    }
    const atFrame2 = samples.filter(([f, at]) => f === 2 && at).length;
    const atFrame3or4 = samples.filter(([f, at]) => (f === 3 || f === 4) && at).length;
    assert.ok(atFrame2 > 0, "reported at playback position 2");
    assert.strictEqual(atFrame3or4, 0, "repeated source frames are not the marker");
  });

  it("isAt returns false when a different clip is current", () => {
    const world = createWorld();
    const s = makeMarkerSprite(world);
    s.animation.play("walk");
    assert.strictEqual(s.animation.isAt("jump", "airborne"), false);
  });

  it("hasReached is false before, true at and after the marker", () => {
    const world = createWorld();
    const s = makeMarkerSprite(world);
    s.animation.add("seq", new AnimationClip({
      frames: [50, 51, 52, 53, 54],
      sequence: [0, 1, 2, 2, 2, 3, 4],
      fps: 10,
      loop: false,
      markers: { airborne: 2, landing: 6 },
    }));
    s.animation.play("seq");
    const seen = [];
    for (let i = 0; i < 80; i++) {
      world.update(1 / 60);
      const f = readState(s).frame;
      seen.push({ f, at: s.animation.isAt("seq", "airborne"), reached: s.animation.hasReached("seq", "airborne") });
    }
    const before = seen.filter((r) => r.f < 2);
    const at = seen.filter((r) => r.f === 2);
    const after = seen.filter((r) => r.f > 2);
    assert.ok(before.length > 0 && before.every((r) => !r.reached && !r.at), "before the marker");
    assert.ok(at.length > 0 && at.every((r) => r.reached && r.at), "at the marker");
    assert.ok(after.length > 0 && after.every((r) => r.reached && !r.at), "after the marker");
    // completed clip still reports hasReached
    assert.strictEqual(s.animation.playing, false);
    assert.strictEqual(s.animation.hasReached("seq", "airborne"), true);
  });
});

// ─── state getters ─────────────────────────────────────
describe("animation state getters", () => {
  it("frame and position expose the playback cursor", () => {
    const world = createWorld();
    const s = makeMarkerSprite(world);
    s.animation.play("jump");
    world.update(0.09); // timing: position 1 spans [0.08, 0.16)
    assert.strictEqual(s.animation.position, 1);
    assert.strictEqual(s.animation.frame, s.animation.position);
    assert.strictEqual(s.animation.current, "jump");
  });

  it("progress is timeline-based and reports 1 at completion", () => {
    const world = createWorld();
    const s = makeMarkerSprite(world);
    s.animation.add("flat", new AnimationClip({
      frames: [0, 1, 2, 3],
      fps: 10,
      loop: false,
      timing: [0.1, 0.2, 0.3, 0.4],
    }));
    s.animation.play("flat"); // total duration 1.0s
    assert.strictEqual(s.animation.progress, 0);
    world.update(0.05);
    assert.ok(Math.abs(s.animation.progress - 0.05) < 1e-6);
    world.update(0.05);
    assert.ok(Math.abs(s.animation.progress - 0.1) < 1e-6);
    for (let i = 0; i < 100; i++) world.update(0.1);
    assert.strictEqual(s.animation.isPlaying, false);
    assert.strictEqual(s.animation.progress, 1);
  });

  it("progress wraps for looping clips", () => {
    const world = createWorld();
    const s = makeMarkerSprite(world);
    s.animation.play("walk"); // loop: true, duration 0.2s
    world.update(0.5); // wraps → 0.1s into the cycle → 50%
    assert.ok(Math.abs(s.animation.progress - 0.5) < 1e-6);
  });

  it("isPaused / isComplete across marker pause, manual pause, and completion", () => {
    const world = createWorld();
    const s = makeMarkerSprite(world);

    s.animation.playUntil("jump", "airborne");
    for (let i = 0; i < 40; i++) world.update(1 / 60);
    assert.strictEqual(s.animation.isPlaying, false);
    assert.strictEqual(s.animation.isPaused, true);
    assert.strictEqual(s.animation.isComplete, false);

    s.animation.resume();
    s.animation.pause();
    assert.strictEqual(s.animation.isPlaying, false);
    assert.strictEqual(s.animation.isPaused, true);
    assert.strictEqual(s.animation.isComplete, false);

    s.animation.resume();
    for (let i = 0; i < 120; i++) world.update(1 / 60);
    assert.strictEqual(s.animation.isPlaying, false);
    assert.strictEqual(s.animation.isPaused, false);
    assert.strictEqual(s.animation.isComplete, true);
  });

  it("a paused looping clip is never complete, even at the last position", () => {
    const world = createWorld();
    const s = makeMarkerSprite(world);
    s.animation.play("walk"); // loop: true, 2 frames
    for (let i = 0; i < 30; i++) world.update(1 / 60); // elapsed 0.5 → frame 1 (last)
    assert.strictEqual(readState(s).frame, 1);
    s.animation.pause();
    assert.strictEqual(s.animation.isComplete, false);
    assert.strictEqual(s.animation.isPaused, true);
  });

  it("marker returns the name at the current position, else null", () => {
    const world = createWorld();
    const s = makeMarkerSprite(world);
    s.animation.playUntil("jump", "airborne");
    for (let i = 0; i < 40; i++) world.update(1 / 60);
    assert.strictEqual(s.animation.marker, "airborne");
    s.animation.resume();
    for (let i = 0; i < 40; i++) {
      world.update(1 / 60);
      if (readState(s).frame > 2) break;
    }
    assert.strictEqual(s.animation.marker, null);
  });

  it("state getters reflect queued and forced playback", () => {
    const world = createWorld();
    const s = makeMarkerSprite(world);
    s.animation.play("idle");
    s.animation.playOnce("attack");
    s.animation.queue("death");
    const seen = [];
    for (let i = 0; i < 60; i++) {
      world.update(1 / 60);
      seen.push(s.animation.current);
    }
    assert.ok(seen.includes("attack"));
    assert.ok(seen.includes("death"));
    assert.strictEqual(seen[seen.length - 1], "idle");

    s.animation.play("walk", { force: true });
    assert.strictEqual(s.animation.current, "walk");
    assert.strictEqual(s.animation.isPlaying, true);
  });
});
