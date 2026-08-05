import { describe, it, beforeEach, afterEach } from "node:test";
import * as assert from "node:assert";

// Regression tests for six frame-loop bugs:
//   1. Game._getDiag cached the first scene's Diagnostics forever.
//   2. Game._frame dereferenced this.renderer, which _fallbackRenderer nulls.
//   3. _execPopScene had no depth guard, so two deferred pops emptied the stack.
//   4. Scene.enter() dropped async onEnter() rejections on the floor.
//   5. Interpolation used (0, 0) as a "not yet seeded" sentinel.
//   6. Clock.tick zeroed the accumulator on tick-cap, forcing alpha to 0.

<<<<<<< HEAD
// ─── Browser environment mock (Game constructor needs a DOM) ───────────────

function makeElement() {
  return {
    style: {},
    className: "",
    width: 0,
    height: 0,
    innerHTML: "",
    _listeners: {},
    addEventListener(type, fn) {
      (this._listeners[type] = this._listeners[type] || []).push(fn);
    },
    removeEventListener(type, fn) {
      const list = this._listeners[type] || [];
      const i = list.indexOf(fn);
      if (i !== -1) list.splice(i, 1);
    },
    appendChild() {},
    append() {},
    remove() {},
    querySelector() { return null; },
  };
}

function makeContext() {
  return {
    imageSmoothingEnabled: true,
    clearRect() {}, save() {}, restore() {}, translate() {}, rotate() {}, scale() {},
    fillRect() {}, drawImage() {}, beginPath() {}, arc() {}, fill() {}, stroke() {},
    moveTo() {}, lineTo() {},
    getTransform() { return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }; },
    setTransform() {},
  };
}

function setupDom() {
  const body = makeElement();
  const canvas = makeElement();
  canvas.width = 800;
  canvas.height = 600;
  const ctx = makeContext();
  canvas.getContext = (kind) => (kind === "2d" ? ctx : null);

  globalThis.document = {
    body,
    documentElement: makeElement(),
    createElement: (tag) => (tag === "canvas" ? canvas : makeElement()),
    querySelector: () => null,
    addEventListener() {},
    removeEventListener() {},
    hidden: false,
  };
  globalThis.window = {
    addEventListener() {},
    removeEventListener() {},
    innerWidth: 1920,
    innerHeight: 1080,
    devicePixelRatio: 1,
    open() {},
  };
  globalThis.getComputedStyle = () => ({
    position: "relative",
    getPropertyValue: () => "",
    removeProperty() {},
  });
  globalThis.ResizeObserver = class { observe() {} disconnect() {} };
  globalThis.requestAnimationFrame = () => 0;
  globalThis.cancelAnimationFrame = () => {};
  globalThis.localStorage = {
    getItem: () => null, setItem() {}, removeItem() {}, clear() {},
  };
}

setupDom();

=======
>>>>>>> 07d6ec7 (refactor: add host abstraction, scene stack/context and renderer host; make debug streaming opt-in)
const {
  Game, Scene, Clock, Diagnostics, DefaultWorldBuilder,
  Transform, Renderable, RenderBounds, Visible, RenderSystem, Sprite,
} = await import("../../../jygame.js");
<<<<<<< HEAD
=======

// The engine runs on a Host, so these drive it with HeadlessHost — no DOM
// globals, no hand-rolled element mocks.

const { HeadlessHost } = await import("../../../core/Host.js");

// Each game gets a fresh host so listener/frame state never leaks between tests.
function newGame(opts = {}) {
  return new Game({ host: new HeadlessHost({ width: 320, height: 240 }), ...opts });
}
>>>>>>> 07d6ec7 (refactor: add host abstraction, scene stack/context and renderer host; make debug streaming opt-in)
const { SavePrevPositionSystem } =
  await import("../../../ecs/systems/SavePrevPositionSystem.js");
const { RenderQueue } = await import("../../../ecs/render/RenderQueue.js");

// Capture console noise so expected-error paths do not pollute test output,
// while still letting assertions verify that a report was actually made.
let captured;
function silenceConsole() {
  captured = { error: [], warn: [] };
  const origError = console.error;
  const origWarn = console.warn;
  console.error = (...a) => captured.error.push(a);
  console.warn = (...a) => captured.warn.push(a);
  return () => { console.error = origError; console.warn = origWarn; };
}

describe("Clock: tick-cap preserves the sub-step remainder (bug 6)", () => {
  it("keeps a fractional accumulator so alpha survives a frame spike", () => {
    const clock = new Clock(10, 1); // fixedDt 0.1s, cap 1 tick
    const ticks = clock.tick(0.15);

    assert.strictEqual(ticks, 1, "tick count should be capped at maxTicks");
    // Old behaviour zeroed the accumulator here, forcing alpha to 0 and adding
    // an interpolation snap on top of the spike that caused the overrun.
    assert.ok(
      Math.abs(clock.alpha - 0.5) < 1e-6,
      `expected alpha ~0.5 after a capped tick, got ${clock.alpha}`,
    );
  });

  it("still drops the unsimulated backlog", () => {
    const clock = new Clock(10, 1);
    clock.tick(0.2);
    // The remainder must stay below one fixed step: keeping a multi-step
    // backlog is what the cap exists to prevent.
    assert.ok(
      clock._accumulator < clock.fixedDt,
      `backlog should be dropped, got ${clock._accumulator}`,
    );
  });

  it("does not disturb the uncapped path", () => {
    const clock = new Clock(10, 5);
    const ticks = clock.tick(0.15);
    assert.strictEqual(ticks, 1);
    assert.ok(Math.abs(clock.alpha - 0.5) < 1e-6);
  });
});

describe("Interpolation: _interpValid replaces the origin sentinel (bug 5)", () => {
  let scene;
  let world;

  beforeEach(() => {
    scene = new Scene();
    scene._world = DefaultWorldBuilder.createDefault();
    world = scene._world;
  });

  // Interpolation now happens in the RenderQueue, so these drive
  // RenderSystem + applyAlpha and read the resulting draw command rather
  // than inspecting mutated Transform columns.
  function spawn(x, y) {
    const e = world.createEntity();
    world.addMany(e, Transform, Renderable, RenderBounds, Visible);
    world.set(e, Transform, { x, y, scaleX: 1, scaleY: 1 });
    world.set(e, RenderBounds, { width: 8, height: 8 });
    world.set(e, Visible, { value: 1 });
    return e;
  }

  function command(alpha) {
    world.runSystem(RenderSystem);
    const queue = world.getResource(RenderQueue);
    queue.applyAlpha(alpha);
    return queue._commands[0];
  }

  it("interpolates an entity sitting exactly at the origin", () => {
    const e = spawn(0, 0);

    world.runSystem(SavePrevPositionSystem); // seeds prev = (0, 0), valid = 1
    world.set(e, Transform, { x: 10, y: 20 }); // simulate a movement tick

    const cmd = command(0.5);
    // Previously the (0,0) sentinel skipped this row, so anything spawned at
    // the origin hard-snapped every tick, forever.
    assert.ok(Math.abs(cmd.x - 5) < 1e-4, `expected x ~5, got ${cmd.x}`);
    assert.ok(Math.abs(cmd.y - 10) < 1e-4, `expected y ~10, got ${cmd.y}`);
  });

  it("skips an entity whose prev position was never seeded", () => {
    spawn(100, 100); // no SavePrevPositionSystem run yet

    const cmd = command(0.5);
    // A fresh entity must not be dragged in from prev = (0, 0).
    assert.strictEqual(cmd.x, 100);
    assert.strictEqual(cmd.y, 100);
  });

  it("never mutates the authoritative transform", () => {
    const e = spawn(0, 0);
    world.runSystem(SavePrevPositionSystem);
    world.set(e, Transform, { x: 10, y: 20 });

    command(0.5);

    // The whole point of moving interpolation into the queue: the world is
    // never temporarily wrong, so nothing has to be restored afterwards.
    const t = world.get(e, Transform);
    assert.strictEqual(t.x, 10);
    assert.strictEqual(t.y, 20);
  });

  it("applyAlpha is idempotent and re-runnable with a fresh alpha", () => {
    const e = spawn(0, 0);
    world.runSystem(SavePrevPositionSystem);
    world.set(e, Transform, { x: 100, y: 0 });

    world.runSystem(RenderSystem);
    const queue = world.getResource(RenderQueue);

    queue.applyAlpha(0.25);
    assert.ok(Math.abs(queue._commands[0].x - 25) < 1e-4);

    // Re-applying must blend from the stored endpoints, not compound onto
    // the previous result. This is what makes zero-tick frames free.
    queue.applyAlpha(0.75);
    assert.ok(Math.abs(queue._commands[0].x - 75) < 1e-4);

    queue.applyAlpha(0.25);
    assert.ok(Math.abs(queue._commands[0].x - 25) < 1e-4, "alpha must not compound");
  });
});

describe("Scene: async init failures are surfaced (bug 4)", () => {
  let restore;
  let game;

  beforeEach(() => { restore = silenceConsole(); });
  afterEach(() => {
    if (game) { try { game.destroy(); } catch {} game = null; }
    restore();
  });

  it("captures a throwing onEnter instead of leaving an unhandled rejection", async () => {
    let hookErr = null;
    class BadScene extends Scene {
      async onEnter() { throw new Error("boom"); }
      onError(err) { hookErr = err; }
    }

<<<<<<< HEAD
    game = new Game({ width: 320, height: 240 });
=======
    game = newGame();
>>>>>>> 07d6ec7 (refactor: add host abstraction, scene stack/context and renderer host; make debug streaming opt-in)
    const scene = new BadScene();
    game.run(scene);

    await scene.whenReady();

    assert.strictEqual(scene.failed, true, "scene should report failure");
    assert.strictEqual(scene.ready, false, "a failed scene must not become ready");
    assert.strictEqual(scene.initError.message, "boom");
    assert.strictEqual(hookErr && hookErr.message, "boom", "onError hook should receive the error");
    assert.ok(
      captured.error.some((a) => String(a[0]).includes("failed to initialize")),
      "the failure should be reported to the console",
    );
  });

  it("leaves a healthy scene ready with no error", async () => {
    class GoodScene extends Scene {
      async onEnter() {}
    }

<<<<<<< HEAD
    game = new Game({ width: 320, height: 240 });
=======
    game = newGame();
>>>>>>> 07d6ec7 (refactor: add host abstraction, scene stack/context and renderer host; make debug streaming opt-in)
    const scene = new GoodScene();
    game.run(scene);

    await scene.whenReady();

    assert.strictEqual(scene.failed, false);
    assert.strictEqual(scene.initError, null);
    assert.strictEqual(scene.ready, true);
  });
});

describe("Debug is opt-in and streaming is gated", () => {
  let restore;
  let game;

  beforeEach(() => { restore = silenceConsole(); });
  afterEach(() => {
    if (game) { try { game.destroy(); } catch {} game = null; }
    restore();
  });

  it("defaults to debug off", async () => {
    class S extends Scene { async onEnter() {} }
<<<<<<< HEAD
    game = new Game({ width: 320, height: 240 });
=======
    game = newGame();
>>>>>>> 07d6ec7 (refactor: add host abstraction, scene stack/context and renderer host; make debug streaming opt-in)
    const scene = new S();
    game.run(scene);
    await scene.whenReady();

    assert.strictEqual(game._debug, false, "debug must be opt-in");
    assert.ok(!game._debugBackend, "no debug backend should be installed");
    assert.ok(!game._snapshotBuilder, "no snapshot builder should be installed");
    assert.strictEqual(game.debug, null, "the overlay accessor should stay null");
  });

  it("with debug on but no workspace attached, frames do no snapshot work", async () => {
    class S extends Scene { async onEnter() { new Sprite(0, 0, 8, 8); } }
<<<<<<< HEAD
    game = new Game({ width: 320, height: 240, debug: true });
=======
    game = newGame({ debug: true });
>>>>>>> 07d6ec7 (refactor: add host abstraction, scene stack/context and renderer host; make debug streaming opt-in)
    const scene = new S();
    game.run(scene);
    await scene.whenReady();

<<<<<<< HEAD
    assert.ok(game._snapshotBuilder, "debug: true still installs the builder");

    let built = 0;
    const realBuild = game._snapshotBuilder.build.bind(game._snapshotBuilder);
    game._snapshotBuilder.build = (...a) => { built++; return realBuild(...a); };
=======
    assert.ok(game.debugSession, "debug: true still installs a debug session");

    let built = 0;
    const builder = game.debugSession.builder;
    const realBuild = builder.build.bind(builder);
    builder.build = (...a) => { built++; return realBuild(...a); };
>>>>>>> 07d6ec7 (refactor: add host abstraction, scene stack/context and renderer host; make debug streaming opt-in)

    for (let i = 0; i < 10; i++) game._frame(null, 1, 1 / 60);

    // The expensive path — full world snapshot, toJSON, postMessage — used to
    // run unconditionally here, costing ~40x a normal frame.
    assert.strictEqual(built, 0, "no snapshots should be built without a subscriber");
  });

  it("streams once a workspace subscribes", async () => {
    class S extends Scene { async onEnter() { new Sprite(0, 0, 8, 8); } }
<<<<<<< HEAD
    game = new Game({ width: 320, height: 240, debug: true });
=======
    game = newGame({ debug: true });
>>>>>>> 07d6ec7 (refactor: add host abstraction, scene stack/context and renderer host; make debug streaming opt-in)
    const scene = new S();
    game.run(scene);
    await scene.whenReady();

    let built = 0;
<<<<<<< HEAD
    const realBuild = game._snapshotBuilder.build.bind(game._snapshotBuilder);
    game._snapshotBuilder.build = (...a) => { built++; return realBuild(...a); };

    game._debugBackend._handler({ type: "command", payload: "debug:subscribe" });
=======
    const builder = game.debugSession.builder;
    const realBuild = builder.build.bind(builder);
    builder.build = (...a) => { built++; return realBuild(...a); };

    game.debugSession.backend._handler({ type: "command", payload: "debug:subscribe" });
>>>>>>> 07d6ec7 (refactor: add host abstraction, scene stack/context and renderer host; make debug streaming opt-in)
    for (let i = 0; i < 3; i++) game._frame(null, 1, 1 / 60);

    assert.strictEqual(built, 3, "a subscribed workspace should receive every frame");
  });
});

describe("Game: scene stack and renderer guards (bugs 1-3)", () => {
  let restore;
  let game;

  beforeEach(() => { restore = silenceConsole(); });
  afterEach(() => {
    if (game) { try { game.destroy(); } catch {} game = null; }
    restore();
  });

  it("re-resolves Diagnostics after a scene switch (bug 1)", async () => {
    class A extends Scene { async onEnter() {} }
    class B extends Scene { async onEnter() {} }

<<<<<<< HEAD
    game = new Game({ width: 320, height: 240, debug: true });
=======
    game = newGame({ debug: true });
>>>>>>> 07d6ec7 (refactor: add host abstraction, scene stack/context and renderer host; make debug streaming opt-in)

    const first = new A();
    game.run(first);
    await first.whenReady();

    const diagA = game._getDiag();
    assert.ok(diagA instanceof Diagnostics, "expected the first scene's Diagnostics");

    const second = new B();
    game.switchScene(second);
    await second.whenReady();

    const diagB = game._getDiag();
    assert.ok(diagB instanceof Diagnostics, "expected the second scene's Diagnostics");
    // The old world's resources are cleared by Scene.exit(); holding the stale
    // instance meant every metric after the first transition went nowhere.
    assert.notStrictEqual(diagB, diagA, "Diagnostics must be re-resolved for the new world");
    assert.strictEqual(diagB, second._world.getResource(Diagnostics));
    assert.ok(game._diagIds, "metric ids should be re-resolved alongside");
  });

  it("survives a frame with no renderer (bug 2)", async () => {
    class S extends Scene { async onEnter() {} }

<<<<<<< HEAD
    game = new Game({ width: 320, height: 240 });
=======
    game = newGame();
>>>>>>> 07d6ec7 (refactor: add host abstraction, scene stack/context and renderer host; make debug streaming opt-in)
    const scene = new S();
    game.run(scene);
    await scene.whenReady();

<<<<<<< HEAD
    // What _fallbackRenderer does when the whole chain is exhausted.
    game.renderer = null;
=======
    // What RendererHost does when the whole fallback chain is exhausted.
    game.rendererHost.renderer = null;
>>>>>>> 07d6ec7 (refactor: add host abstraction, scene stack/context and renderer host; make debug streaming opt-in)

    assert.doesNotThrow(
      () => game._frame(null, 1, 1 / 60),
      "a null renderer must not crash the frame loop",
    );
    assert.ok(
      captured.warn.some((a) => String(a[0]).includes("No renderer available")),
      "the outage should be reported once",
    );

    // Latched: still silent on subsequent frames.
    const warnCount = captured.warn.length;
    game._frame(null, 1, 1 / 60);
    assert.strictEqual(captured.warn.length, warnCount, "the warning should not repeat every frame");
  });

  it("does not empty the scene stack on two deferred pops (bug 3)", async () => {
    class S extends Scene { async onEnter() {} }

<<<<<<< HEAD
    game = new Game({ width: 320, height: 240 });
=======
    game = newGame();
>>>>>>> 07d6ec7 (refactor: add host abstraction, scene stack/context and renderer host; make debug streaming opt-in)

    const a = new S();
    game.run(a);
    await a.whenReady();

    const b = new S();
    game.pushScene(b);
    await b.whenReady();
    assert.strictEqual(game.sceneCount, 2);

    // Both pops are issued mid-update, so both pass the call-time depth check
    // and get queued; the second is only invalid once the first has run.
<<<<<<< HEAD
    game._updating = true;
    game.popScene();
    game.popScene();
    game._updating = false;

    assert.doesNotThrow(() => game._flushSceneOps(), "flush must not escape into the frame loop");
    assert.strictEqual(game.sceneCount, 1, "the last scene must survive");
    assert.ok(game.scene, "a top scene must still be present");
    assert.strictEqual(game._sceneOps.length, 0, "the queue must be fully drained");
=======
    game.scenes.updating = true;
    game.popScene();
    game.popScene();
    game.scenes.updating = false;

    assert.doesNotThrow(() => game.scenes.flush(), "flush must not escape into the frame loop");
    assert.strictEqual(game.sceneCount, 1, "the last scene must survive");
    assert.ok(game.scene, "a top scene must still be present");
    assert.strictEqual(game.scenes.pendingOpCount, 0, "the queue must be fully drained");
>>>>>>> 07d6ec7 (refactor: add host abstraction, scene stack/context and renderer host; make debug streaming opt-in)
    assert.ok(
      captured.error.some((a) => String(a[0]).includes('Deferred scene op "pop" failed')),
      "the rejected op should be reported",
    );
  });
});
