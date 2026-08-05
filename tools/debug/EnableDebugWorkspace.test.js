import { describe, it } from "node:test";
import * as assert from "node:assert";
import {
  enableDebugWorkspace, takeDebugSnapshot, isDebugStreaming,
  DEBUG_SUBSCRIBE, DEBUG_UNSUBSCRIBE, DEBUG_SUBSCRIPTION_TIMEOUT_MS,
} from "../../debug/EnableDebugWorkspace.js";
import { TestDebugBackend } from "../../debug/workspace/backend/TestDebugBackend.js";
import { SnapshotBuilder } from "../../debug/snapshots/SnapshotBuilder.js";
import { World } from "../../ecs/core/World.js";

// A stand-in for the small surface enableDebugWorkspace/takeDebugSnapshot use.
// Game exposes the real one as `game.debugControls`.
function makeGame({ scene = null, frameNumber = 0, diagnostics = null } = {}) {
  const game = {
    debugSession: null,
    debugControls: {
      scene, frameNumber, diagnostics,
      inputSystem: null, isPaused: false,
      pause() {}, resume() {}, stepFrame() {}, togglePause() {},
    },
  };
  return game;
}
import { Transform } from "../../ecs/components/Transform.js";

describe("enableDebugWorkspace", () => {
  it("attaches a DebugSession carrying the backend and builder", () => {
    const game = makeGame();
    const backend = new TestDebugBackend();
    enableDebugWorkspace(game, backend);
    assert.ok(game.debugSession);
    assert.strictEqual(game.debugSession.backend, backend);
    assert.ok(game.debugSession.builder);
  });

  it("opens the backend and sets up message handler", () => {
    const game = makeGame();
    const backend = new TestDebugBackend();
    enableDebugWorkspace(game, backend);
    assert.strictEqual(backend.connected, true);
    assert.ok(typeof backend._handler === "function");
  });

  it("is idempotent", () => {
    const game = makeGame();
    const backend = new TestDebugBackend();
    enableDebugWorkspace(game, backend);
    const session1 = game.debugSession;
    const builder1 = session1.builder;
    enableDebugWorkspace(game, backend);
    assert.strictEqual(game.debugSession, session1);
    assert.strictEqual(game.debugSession.builder, builder1);
  });

  it("accepts no backend argument (uses default BrowserDebugBackend)", () => {
    const game = makeGame();
    enableDebugWorkspace(game);
    assert.ok(game.debugSession);
    assert.ok(game.debugSession.backend);
    assert.ok(game.debugSession.builder);
    game.debugSession.close();
  });
});

// Snapshot streaming is opt-in: the game only pays for a world snapshot
// while a workspace has announced itself. These tests drive that handshake
// through the backend the same way the real workspace does.
function subscribe(backend) {
  backend.receive({ type: "command", payload: DEBUG_SUBSCRIBE });
}

describe("debug snapshot streaming gate", () => {
  it("does not stream until a workspace subscribes", () => {
    const game = makeGame({ scene: null, frameNumber: 1 });
    const backend = new TestDebugBackend();
    enableDebugWorkspace(game, backend);
    backend.open();

    assert.strictEqual(isDebugStreaming(game), false);
    takeDebugSnapshot(game);
    assert.strictEqual(
      backend.sentCount, 0,
      "an unwatched game must not build or send snapshots",
    );
  });

  it("streams once a workspace subscribes", () => {
    const game = makeGame({ scene: null, frameNumber: 1 });
    const backend = new TestDebugBackend();
    enableDebugWorkspace(game, backend);
    backend.open();

    subscribe(backend);
    assert.strictEqual(isDebugStreaming(game), true);
    takeDebugSnapshot(game);
    assert.strictEqual(backend.sentCount, 1);
  });

  it("stops streaming on unsubscribe", () => {
    const game = makeGame({ scene: null, frameNumber: 1 });
    const backend = new TestDebugBackend();
    enableDebugWorkspace(game, backend);
    backend.open();

    subscribe(backend);
    takeDebugSnapshot(game);
    assert.strictEqual(backend.sentCount, 1);

    backend.receive({ type: "command", payload: DEBUG_UNSUBSCRIBE });
    assert.strictEqual(isDebugStreaming(game), false);
    takeDebugSnapshot(game);
    assert.strictEqual(backend.sentCount, 1, "no further snapshots after unsubscribe");
  });

  it("expires a subscription that stops heartbeating", () => {
    const game = makeGame({ scene: null, frameNumber: 1 });
    const backend = new TestDebugBackend();
    enableDebugWorkspace(game, backend);
    backend.open();

    subscribe(backend);
    assert.strictEqual(isDebugStreaming(game), true);

    // Simulate a workspace window that was closed or crashed without ever
    // sending an unsubscribe: its heartbeat simply stops.
    game.debugSession.subscribedAt -= DEBUG_SUBSCRIPTION_TIMEOUT_MS + 1;
    assert.strictEqual(
      isDebugStreaming(game), false,
      "a stale subscription must expire on its own",
    );

    takeDebugSnapshot(game);
    assert.strictEqual(backend.sentCount, 0);
  });

  it("a heartbeat refreshes an active subscription", () => {
    const game = makeGame({ scene: null, frameNumber: 1 });
    const backend = new TestDebugBackend();
    enableDebugWorkspace(game, backend);
    backend.open();

    subscribe(backend);
    game.debugSession.subscribedAt -= DEBUG_SUBSCRIPTION_TIMEOUT_MS - 50; // nearly stale
    subscribe(backend);
    assert.strictEqual(isDebugStreaming(game), true);
  });

  it("accepts both the string and { name } command shapes", () => {
    const game = makeGame({ scene: null, frameNumber: 1 });
    const backend = new TestDebugBackend();
    enableDebugWorkspace(game, backend);
    backend.open();

    backend.receive({ type: "command", payload: { name: DEBUG_SUBSCRIBE } });
    assert.strictEqual(isDebugStreaming(game), true);
  });

  it("ignores non-command traffic on the channel", () => {
    const game = makeGame({ scene: null, frameNumber: 1 });
    const backend = new TestDebugBackend();
    enableDebugWorkspace(game, backend);
    backend.open();

    // Another workspace's snapshot echo must not be read as a subscription.
    backend.receive({ type: "snapshot", payload: {} });
    backend.receive(null);
    backend.receive({ type: "command" });
    assert.strictEqual(isDebugStreaming(game), false);
  });
});

// Snapshot streaming is opt-in: the game only pays for a world snapshot
// while a workspace has announced itself. These tests drive that handshake
// through the backend the same way the real workspace does.
function subscribe(backend) {
  backend.receive({ type: "command", payload: DEBUG_SUBSCRIBE });
}

describe("debug snapshot streaming gate", () => {
  it("does not stream until a workspace subscribes", () => {
    const game = { scene: null, _frameCount: 1 };
    const backend = new TestDebugBackend();
    enableDebugWorkspace(game, backend);
    backend.open();

    assert.strictEqual(isDebugStreaming(game), false);
    takeDebugSnapshot(game);
    assert.strictEqual(
      backend.sentCount, 0,
      "an unwatched game must not build or send snapshots",
    );
  });

  it("streams once a workspace subscribes", () => {
    const game = { scene: null, _frameCount: 1 };
    const backend = new TestDebugBackend();
    enableDebugWorkspace(game, backend);
    backend.open();

    subscribe(backend);
    assert.strictEqual(isDebugStreaming(game), true);
    takeDebugSnapshot(game);
    assert.strictEqual(backend.sentCount, 1);
  });

  it("stops streaming on unsubscribe", () => {
    const game = { scene: null, _frameCount: 1 };
    const backend = new TestDebugBackend();
    enableDebugWorkspace(game, backend);
    backend.open();

    subscribe(backend);
    takeDebugSnapshot(game);
    assert.strictEqual(backend.sentCount, 1);

    backend.receive({ type: "command", payload: DEBUG_UNSUBSCRIBE });
    assert.strictEqual(isDebugStreaming(game), false);
    takeDebugSnapshot(game);
    assert.strictEqual(backend.sentCount, 1, "no further snapshots after unsubscribe");
  });

  it("expires a subscription that stops heartbeating", () => {
    const game = { scene: null, _frameCount: 1 };
    const backend = new TestDebugBackend();
    enableDebugWorkspace(game, backend);
    backend.open();

    subscribe(backend);
    assert.strictEqual(isDebugStreaming(game), true);

    // Simulate a workspace window that was closed or crashed without ever
    // sending an unsubscribe: its heartbeat simply stops.
    game._debugSubscribedAt -= DEBUG_SUBSCRIPTION_TIMEOUT_MS + 1;
    assert.strictEqual(
      isDebugStreaming(game), false,
      "a stale subscription must expire on its own",
    );

    takeDebugSnapshot(game);
    assert.strictEqual(backend.sentCount, 0);
  });

  it("a heartbeat refreshes an active subscription", () => {
    const game = { scene: null, _frameCount: 1 };
    const backend = new TestDebugBackend();
    enableDebugWorkspace(game, backend);
    backend.open();

    subscribe(backend);
    game._debugSubscribedAt -= DEBUG_SUBSCRIPTION_TIMEOUT_MS - 50; // nearly stale
    subscribe(backend);
    assert.strictEqual(isDebugStreaming(game), true);
  });

  it("accepts both the string and { name } command shapes", () => {
    const game = { scene: null, _frameCount: 1 };
    const backend = new TestDebugBackend();
    enableDebugWorkspace(game, backend);
    backend.open();

    backend.receive({ type: "command", payload: { name: DEBUG_SUBSCRIBE } });
    assert.strictEqual(isDebugStreaming(game), true);
  });

  it("ignores non-command traffic on the channel", () => {
    const game = { scene: null, _frameCount: 1 };
    const backend = new TestDebugBackend();
    enableDebugWorkspace(game, backend);
    backend.open();

    // Another workspace's snapshot echo must not be read as a subscription.
    backend.receive({ type: "snapshot", payload: {} });
    backend.receive(null);
    backend.receive({ type: "command" });
    assert.strictEqual(isDebugStreaming(game), false);
  });
});

describe("takeDebugSnapshot", () => {
  it("is a no-op when backend and builder are not set", () => {
    const game = makeGame({ scene: null, frameNumber: 0 });
    takeDebugSnapshot(game);
  });

  it("is a no-op when builder is null", () => {
    const game = makeGame({ scene: null, frameNumber: 0 });
    takeDebugSnapshot(game);
  });

  it("sends snapshot when backend and builder are set", () => {
    const game = makeGame({ scene: null, frameNumber: 5 });
    const backend = new TestDebugBackend();
    enableDebugWorkspace(game, backend);
    backend.open();
    subscribe(backend);
    takeDebugSnapshot(game);
    assert.strictEqual(backend.sentCount, 1);
    assert.strictEqual(backend.lastSnapshot().frameNumber, 5);
  });

  it("handles scene with no world", () => {
    const game = makeGame({ scene: { world: null }, frameNumber: 3 });
    const backend = new TestDebugBackend();
    enableDebugWorkspace(game, backend);
    backend.open();
    subscribe(backend);
    takeDebugSnapshot(game);
    assert.strictEqual(backend.sentCount, 1);
    assert.strictEqual(backend.lastSnapshot().frameNumber, 3);
  });

  it("registers the world and captures entities", () => {
    const world = new World();
    world.register(Transform);
    const e = world.createEntity();
    world.add(e, Transform);
    world.set(e, Transform, { x: 42, y: 100, rotation: 0, scaleX: 1, scaleY: 1 });

    const game = makeGame({ scene: { world }, frameNumber: 10 });
    const backend = new TestDebugBackend();
    enableDebugWorkspace(game, backend);
    backend.open();
    subscribe(backend);

    takeDebugSnapshot(game);

    assert.strictEqual(backend.sentCount, 1);
    const snap = backend.lastSnapshot();
    assert.strictEqual(snap.frameNumber, 10);
    assert.strictEqual(snap.worlds.length, 1);
    assert.strictEqual(snap.worlds[0].entityCount, 1);
    assert.strictEqual(snap.worlds[0].worldId, "main");

    const entity = snap.worlds[0].entities[0];
    assert.ok(entity.entityId > 0);
    const transform = entity.components.find(c => c.componentName === "Transform");
    assert.ok(transform);
    assert.strictEqual(transform.fields.x, 42);
    assert.strictEqual(transform.fields.y, 100);
  });

  it("registers the world only once across multiple calls", () => {
    const world = new World();
    const game = makeGame({ scene: { world }, frameNumber: 0 });
    const backend = new TestDebugBackend();
    enableDebugWorkspace(game, backend);
    backend.open();
    subscribe(backend);

    takeDebugSnapshot(game);
    takeDebugSnapshot(game);
    takeDebugSnapshot(game);

    assert.strictEqual(backend.sentCount, 3);
    for (const snap of backend.snapshots()) {
      assert.strictEqual(snap.worlds.length, 1);
      assert.strictEqual(snap.worlds[0].worldId, "main");
    }
  });

  it("captures diagnostics snapshot if available", () => {
    const world = new World();
    const diagSnap = { frame: 42, fps: 60, frameTime: 16.67 };
    const game = makeGame({ scene: { world }, frameNumber: 0, diagnostics: { lastSnapshot: diagSnap } });
    const backend = new TestDebugBackend();
    enableDebugWorkspace(game, backend);
    backend.open();
    subscribe(backend);

    takeDebugSnapshot(game);

    const snap = backend.lastSnapshot();
    assert.strictEqual(snap.diagnostics, diagSnap);
    assert.strictEqual(snap.diagnostics.frame, 42);
  });

  it("handles missing _getDiag gracefully", () => {
    const world = new World();
    const game = makeGame({ scene: { world }, frameNumber: 0 });
    const backend = new TestDebugBackend();
    enableDebugWorkspace(game, backend);
    backend.open();
    subscribe(backend);

    takeDebugSnapshot(game);

    const snap = backend.lastSnapshot();
    assert.strictEqual(snap.diagnostics, null);
  });
});
