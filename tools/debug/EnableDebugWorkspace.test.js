import { describe, it } from "node:test";
import * as assert from "node:assert";
import { enableDebugWorkspace, takeDebugSnapshot } from "../../debug/EnableDebugWorkspace.js";
import { TestDebugBackend } from "../../debug/workspace/backend/TestDebugBackend.js";
import { SnapshotBuilder } from "../../debug/snapshots/SnapshotBuilder.js";
import { World } from "../../ecs/core/World.js";
import { Transform } from "../../ecs/components/Transform.js";

describe("enableDebugWorkspace", () => {
  it("sets _debugBackend on the game object", () => {
    const game = {};
    const backend = new TestDebugBackend();
    enableDebugWorkspace(game, backend);
    assert.strictEqual(game._debugBackend, backend);
    assert.ok(game._snapshotBuilder);
  });

  it("does not open the backend", () => {
    const game = {};
    const backend = new TestDebugBackend();
    enableDebugWorkspace(game, backend);
    assert.strictEqual(backend.connected, false);
  });

  it("accepts no backend argument (uses default BrowserDebugBackend)", () => {
    const game = {};
    enableDebugWorkspace(game);
    assert.ok(game._debugBackend);
    assert.ok(game._snapshotBuilder);
  });
});

describe("takeDebugSnapshot", () => {
  it("is a no-op when backend and builder are not set", () => {
    const game = { scene: null, _frameCount: 0 };
    takeDebugSnapshot(game);
  });

  it("is a no-op when builder is null", () => {
    const game = { _snapshotBuilder: null, _debugBackend: null, scene: null, _frameCount: 0 };
    takeDebugSnapshot(game);
  });

  it("sends snapshot when backend and builder are set", () => {
    const game = { scene: null, _frameCount: 5 };
    const backend = new TestDebugBackend();
    enableDebugWorkspace(game, backend);
    backend.open();
    takeDebugSnapshot(game);
    assert.strictEqual(backend.sentCount, 1);
    assert.strictEqual(backend.lastSnapshot().frameNumber, 5);
  });

  it("handles scene with no world", () => {
    const game = { scene: { world: null }, _frameCount: 3 };
    const backend = new TestDebugBackend();
    enableDebugWorkspace(game, backend);
    backend.open();
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

    const game = { scene: { world }, _frameCount: 10 };
    const backend = new TestDebugBackend();
    enableDebugWorkspace(game, backend);
    backend.open();

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
    const game = { scene: { world }, _frameCount: 0 };
    const backend = new TestDebugBackend();
    enableDebugWorkspace(game, backend);
    backend.open();

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
    const game = {
      scene: { world },
      _frameCount: 0,
      _getDiag: () => ({ lastSnapshot: diagSnap }),
    };
    const backend = new TestDebugBackend();
    enableDebugWorkspace(game, backend);
    backend.open();

    takeDebugSnapshot(game);

    const snap = backend.lastSnapshot();
    assert.strictEqual(snap.diagnostics, diagSnap);
    assert.strictEqual(snap.diagnostics.frame, 42);
  });

  it("handles missing _getDiag gracefully", () => {
    const world = new World();
    const game = { scene: { world }, _frameCount: 0 };
    const backend = new TestDebugBackend();
    enableDebugWorkspace(game, backend);
    backend.open();

    takeDebugSnapshot(game);

    const snap = backend.lastSnapshot();
    assert.strictEqual(snap.diagnostics, null);
  });
});
