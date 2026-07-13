import { describe, it } from "node:test";
import * as assert from "node:assert";
import { WorkspaceSnapshotStore } from "../../debug/workspace/WorkspaceSnapshotStore.js";

function makeDescriptors() {
  return [
    { id: 0, name: "frame.fps", type: 2, category: 0, unit: 0, budget: 0 },
    { id: 1, name: "frame.total", type: 0, category: 0, unit: 0, budget: 0 },
    { id: 2, name: "entity.count", type: 1, category: 0, unit: 0, budget: 0 },
  ];
}

function makeDiagnostics(fps, timerTotal, entityCount) {
  return {
    frame: 1,
    timestamp: 1000,
    delta: 16.67,
    fps,
    timerTotals: [fps * 10, timerTotal, 0],
    timerCounts: [1, 1, 0],
    counters: [0, 0, entityCount],
    gauges: [fps, timerTotal, entityCount],
  };
}

function makeSnapshot(frameNumber, descriptors, diag) {
  const snap = { frameNumber, timestamp: frameNumber * 16, worlds: [] };
  if (descriptors) snap.metricDescriptors = descriptors;
  if (diag) snap.diagnostics = diag;
  return snap;
}

describe("WorkspaceSnapshotStore", () => {
  it("returns 0 for unknown metric", () => {
    const store = new WorkspaceSnapshotStore();
    assert.strictEqual(store.analysis.latest("nonexistent"), 0);
  });

  it("registry.forEach does nothing when empty", () => {
    const store = new WorkspaceSnapshotStore();
    const items = [];
    store.registry.forEach((d) => items.push(d));
    assert.strictEqual(items.length, 0);
  });

  it("registry.find returns null for unknown", () => {
    const store = new WorkspaceSnapshotStore();
    assert.strictEqual(store.registry.find("foo"), null);
  });

  it("ingest with descriptors populates registry", () => {
    const store = new WorkspaceSnapshotStore();
    store.ingest(makeSnapshot(1, makeDescriptors()));
    const items = [];
    store.registry.forEach((d) => items.push(d));
    assert.strictEqual(items.length, 3);
    assert.strictEqual(items[0].name, "frame.fps");
    assert.strictEqual(items[1].name, "frame.total");
    assert.strictEqual(items[2].name, "entity.count");
  });

  it("ingest with diagnostics updates latest values", () => {
    const store = new WorkspaceSnapshotStore();
    store.ingest(makeSnapshot(1, makeDescriptors(), makeDiagnostics(60, 12.5, 150)));
    assert.strictEqual(store.analysis.latest("frame.fps"), 60);
    assert.strictEqual(store.analysis.latest("frame.total"), 12.5);
    assert.strictEqual(store.analysis.latest("entity.count"), 150);
  });

  it("latest returns most recent value", () => {
    const store = new WorkspaceSnapshotStore();
    store.ingest(makeSnapshot(1, makeDescriptors(), makeDiagnostics(30, 20, 100)));
    store.ingest(makeSnapshot(2, null, makeDiagnostics(60, 10, 200)));
    assert.strictEqual(store.analysis.latest("frame.fps"), 60);
    assert.strictEqual(store.analysis.latest("entity.count"), 200);
  });

  it("history.window returns values in order", () => {
    const store = new WorkspaceSnapshotStore();
    store.ingest(makeSnapshot(1, makeDescriptors(), makeDiagnostics(10, 50, 100)));
    store.ingest(makeSnapshot(2, null, makeDiagnostics(20, 40, 200)));
    store.ingest(makeSnapshot(3, null, makeDiagnostics(30, 30, 300)));
    const fps = store.history.window("frame.fps", 5);
    assert.deepStrictEqual(fps, [10, 20, 30]);
  });

  it("history.window respects length limit", () => {
    const store = new WorkspaceSnapshotStore();
    for (let i = 1; i <= 10; i++) {
      store.ingest(makeSnapshot(i, i === 1 ? makeDescriptors() : null, makeDiagnostics(i, i * 2, i * 10)));
    }
    const fps = store.history.window("frame.fps", 3);
    assert.strictEqual(fps.length, 3);
    assert.deepStrictEqual(fps, [8, 9, 10]);
  });

  it("history.window returns empty for unknown metric", () => {
    const store = new WorkspaceSnapshotStore();
    assert.deepStrictEqual(store.history.window("nope", 10), []);
  });

  it("enforces max size", () => {
    const store = new WorkspaceSnapshotStore(5);
    for (let i = 1; i <= 10; i++) {
      store.ingest(makeSnapshot(i, i === 1 ? makeDescriptors() : null, makeDiagnostics(i, 0, 0)));
    }
    assert.strictEqual(store.history.window("frame.fps", 100).length, 5);
    assert.strictEqual(store.history.window("frame.fps", 5)[0], 6);
    assert.strictEqual(store.history.window("frame.fps", 5)[4], 10);
  });

  it("handles snapshot without diagnostics", () => {
    const store = new WorkspaceSnapshotStore();
    store.ingest(makeSnapshot(1, makeDescriptors()));
    assert.strictEqual(store.analysis.latest("frame.fps"), 0);
    const items = [];
    store.registry.forEach((d) => items.push(d));
    assert.strictEqual(items.length, 3);
  });

  it("handles snapshot with null diagnostics field", () => {
    const store = new WorkspaceSnapshotStore();
    store.ingest({ frameNumber: 1, metricDescriptors: makeDescriptors(), diagnostics: null });
    assert.strictEqual(store.analysis.latest("frame.fps"), 0);
  });

  it("multiple metric types work for history.window", () => {
    const store = new WorkspaceSnapshotStore();
    for (let i = 1; i <= 3; i++) {
      store.ingest(makeSnapshot(i, i === 1 ? makeDescriptors() : null, makeDiagnostics(i * 10, i * 5, i * 100)));
    }
    assert.deepStrictEqual(store.history.window("frame.fps", 3), [10, 20, 30]);
    assert.deepStrictEqual(store.history.window("frame.total", 3), [5, 10, 15]);
    assert.deepStrictEqual(store.history.window("entity.count", 3), [100, 200, 300]);
  });

  it("registry.find returns descriptor by name", () => {
    const store = new WorkspaceSnapshotStore();
    store.ingest(makeSnapshot(1, makeDescriptors()));
    const desc = store.registry.find("frame.fps");
    assert.ok(desc);
    assert.strictEqual(desc.id, 0);
    assert.strictEqual(desc.type, 2);
  });

  it("returns 0 after ingest of snapshot with no diagnostics", () => {
    const store = new WorkspaceSnapshotStore();
    store.ingest(makeSnapshot(1, makeDescriptors(), makeDiagnostics(60, 10, 100)));
    assert.strictEqual(store.analysis.latest("frame.fps"), 60);
    store.ingest(makeSnapshot(2));
    assert.strictEqual(store.analysis.latest("frame.fps"), 60);
  });

  it("history.count tracks snapshot count", () => {
    const store = new WorkspaceSnapshotStore();
    assert.strictEqual(store.history.count, 0);
    store.ingest(makeSnapshot(1, makeDescriptors(), makeDiagnostics(60, 10, 100)));
    assert.strictEqual(store.history.count, 1);
    store.ingest(makeSnapshot(2));
    assert.strictEqual(store.history.count, 2);
  });

  it("history.latest returns most recent wrapped diagnostics", () => {
    const store = new WorkspaceSnapshotStore();
    store.ingest(makeSnapshot(1, makeDescriptors(), makeDiagnostics(30, 20, 100)));
    store.ingest(makeSnapshot(2, null, makeDiagnostics(60, 10, 200)));
    const snap = store.history.latest();
    assert.ok(snap);
    assert.strictEqual(snap.fps, 60);
    assert.strictEqual(snap.timerTotal(1), 10);
    assert.strictEqual(snap.gauge(0), 60);
    assert.strictEqual(snap.counter(2), 200);
  });

  it("history.latest returns null when no snapshots", () => {
    const store = new WorkspaceSnapshotStore();
    assert.strictEqual(store.history.latest(), null);
  });

  it("history.at returns snapshot by index (0 = newest)", () => {
    const store = new WorkspaceSnapshotStore();
    store.ingest(makeSnapshot(1, makeDescriptors(), makeDiagnostics(10, 5, 50)));
    store.ingest(makeSnapshot(2, null, makeDiagnostics(20, 10, 100)));
    const snap0 = store.history.at(0);
    assert.strictEqual(snap0.fps, 20);
    const snap1 = store.history.at(1);
    assert.strictEqual(snap1.fps, 10);
  });

  it("history.at returns null for out-of-range index", () => {
    const store = new WorkspaceSnapshotStore();
    assert.strictEqual(store.history.at(0), null);
    assert.strictEqual(store.history.at(-1), null);
  });

  it("history.frames iterates newest-first with FrameSnapshot methods", () => {
    const store = new WorkspaceSnapshotStore();
    store.ingest(makeSnapshot(1, makeDescriptors(), makeDiagnostics(10, 5, 50)));
    store.ingest(makeSnapshot(2, null, makeDiagnostics(20, 10, 100)));
    const fps = [];
    for (const snap of store.history.frames()) {
      fps.push({ fps: snap.fps, total: snap.timerTotal(1), count: snap.counter(2) });
    }
    assert.strictEqual(fps.length, 2);
    assert.strictEqual(fps[0].fps, 20);
    assert.strictEqual(fps[1].fps, 10);
  });

  it("history.frames yields nothing when empty", () => {
    const store = new WorkspaceSnapshotStore();
    let count = 0;
    for (const _ of store.history.frames()) count++;
    assert.strictEqual(count, 0);
  });

  it("analysis.average computes rolling average", () => {
    const store = new WorkspaceSnapshotStore();
    for (let i = 1; i <= 10; i++) {
      store.ingest(makeSnapshot(i, i === 1 ? makeDescriptors() : null, makeDiagnostics(i, i * 2, i * 10)));
    }
    const avg = store.analysis.average("frame.fps", 10);
    assert.strictEqual(avg, 5.5);
  });

  it("analysis.average returns 0 for unknown metric", () => {
    const store = new WorkspaceSnapshotStore();
    assert.strictEqual(store.analysis.average("nope", 10), 0);
  });

  it("analysis.max computes max over window", () => {
    const store = new WorkspaceSnapshotStore();
    for (let i = 1; i <= 10; i++) {
      store.ingest(makeSnapshot(i, i === 1 ? makeDescriptors() : null, makeDiagnostics(i, i * 2, i * 10)));
    }
    assert.strictEqual(store.analysis.max("frame.fps", 10), 10);
    assert.strictEqual(store.analysis.max("frame.total", 5), 20);
  });

  it("analysis.max returns 0 for unknown metric", () => {
    const store = new WorkspaceSnapshotStore();
    assert.strictEqual(store.analysis.max("nope", 10), 0);
  });
});
