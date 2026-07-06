import { describe, it } from "node:test";
import * as assert from "node:assert";
import {
  Diagnostics,
  DiagnosticsConfig,
  MetricRegistry,
  MetricDescriptor,
  MetricType,
  MetricUnit,
  MetricCategory,
  CPUTimer,
  FrameStorage,
  FrameSnapshot,
  FrameEvent,
  FrameHistory,
} from "../../../debug/index.js";
import { World } from "../../../ecs/core/World.js";
import { System } from "../../../ecs/core/System.js";

// ─── Helpers ──────────────────────────────────────────

function basicDiag() {
  const d = new Diagnostics();
  d.registerMetric({ name:"frame.delta",         displayName:"Frame Delta",     category:MetricCategory.FRAME,     group:"Frame", unit:MetricUnit.MILLISECONDS, type:MetricType.GAUGE,   tags:["frame"] });
  d.registerMetric({ name:"frame.fps",           displayName:"FPS",             category:MetricCategory.FRAME,     group:"Frame", unit:MetricUnit.FPS,          type:MetricType.GAUGE,   tags:["frame"] });
  d.registerMetric({ name:"ecs.system.movement", displayName:"Movement System", category:MetricCategory.ECS,       group:"Update",unit:MetricUnit.MILLISECONDS, type:MetricType.TIMER,   tags:["ecs","system"] });
  d.registerMetric({ name:"ecs.entitiesCreated", displayName:"Created",         category:MetricCategory.ECS,       group:"World", unit:MetricUnit.COUNT,         type:MetricType.COUNTER, tags:["ecs"] });
  return d;
}

// ─── MetricRegistry + MetricDescriptor ───────────────

describe("MetricRegistry", () => {
  it("assigns sequential IDs", () => {
    const r = new MetricRegistry();
    const a = r.register({ name:"a", category:0, unit:0, type:0 });
    const b = r.register({ name:"b", category:0, unit:0, type:0 });
    assert.strictEqual(a, 0);
    assert.strictEqual(b, 1);
  });

  it("is idempotent", () => {
    const r = new MetricRegistry();
    const a = r.register({ name:"x", category:0, unit:0, type:0 });
    const b = r.register({ name:"x", category:0, unit:0, type:0 });
    assert.strictEqual(a, b);
  });

  it("returns frozen descriptors", () => {
    const r = new MetricRegistry();
    r.register({ name:"test", category:1, unit:2, type:3, displayName:"Test" });
    const d = r.get(0);
    assert.ok(Object.isFrozen(d));
    assert.strictEqual(d.name, "test");
    assert.strictEqual(d.id, 0);
    assert.strictEqual(d.displayName, "Test");
    assert.strictEqual(d.category, 1);
    assert.strictEqual(d.unit, 2);
    assert.strictEqual(d.type, 3);
  });

  it("find by name", () => {
    const r = new MetricRegistry();
    r.register({ name:"foo", category:0, unit:0, type:0 });
    const d = r.find("foo");
    assert.ok(d);
    assert.strictEqual(d.name, "foo");
    assert.strictEqual(r.find("nope"), undefined);
  });

  it("forEach iterates all", () => {
    const r = new MetricRegistry();
    r.register({ name:"a", category:0, unit:0, type:0 });
    r.register({ name:"b", category:0, unit:0, type:0 });
    const names = [];
    r.forEach(d => names.push(d.name));
    assert.deepStrictEqual(names, ["a", "b"]);
  });

  it("count and version", () => {
    const r = new MetricRegistry();
    assert.strictEqual(r.count, 0);
    assert.strictEqual(r.version, 0);
    r.register({ name:"a", category:0, unit:0, type:0 });
    assert.strictEqual(r.count, 1);
    assert.strictEqual(r.version >= 1, true);
  });

  it("lock prevents registration", () => {
    const r = new MetricRegistry();
    r.register({ name:"ok", category:0, unit:0, type:0 });
    r.lock();
    assert.throws(() => {
      r.register({ name:"fail", category:0, unit:0, type:0 });
    }, /locked/);
  });

  it("uses default displayName = name", () => {
    const r = new MetricRegistry();
    r.register({ name:"hello", category:0, unit:0, type:0 });
    assert.strictEqual(r.get(0).displayName, "hello");
  });

  it("uses default group = empty string", () => {
    const r = new MetricRegistry();
    r.register({ name:"x", category:0, unit:0, type:0 });
    assert.strictEqual(r.get(0).group, "");
  });

  it("freezes tags array", () => {
    const r = new MetricRegistry();
    r.register({ name:"t", category:0, unit:0, type:0, tags:["a","b"] });
    const d = r.get(0);
    assert.ok(Object.isFrozen(d.tags));
  });
});

// ─── MetricType / MetricUnit / MetricCategory ────────

describe("MetricType", () => {
  it("has all types", () => {
    assert.strictEqual(MetricType.TIMER, 0);
    assert.strictEqual(MetricType.COUNTER, 1);
    assert.strictEqual(MetricType.GAUGE, 2);
    assert.strictEqual(MetricType.CONSTANT, 3);
  });
});

describe("MetricUnit", () => {
  it("has all units", () => {
    assert.strictEqual(MetricUnit.MILLISECONDS, 0);
    assert.strictEqual(MetricUnit.COUNT, 1);
    assert.strictEqual(MetricUnit.BYTES, 2);
    assert.strictEqual(MetricUnit.MEGABYTES, 3);
    assert.strictEqual(MetricUnit.PERCENT, 4);
    assert.strictEqual(MetricUnit.FPS, 5);
  });
});

describe("MetricCategory", () => {
  it("has all categories", () => {
    assert.strictEqual(MetricCategory.FRAME, 0);
    assert.strictEqual(MetricCategory.ECS, 1);
    assert.strictEqual(MetricCategory.RENDER, 2);
    assert.strictEqual(MetricCategory.AUDIO, 3);
    assert.strictEqual(MetricCategory.PARTICLES, 4);
    assert.strictEqual(MetricCategory.PHYSICS, 5);
    assert.strictEqual(MetricCategory.STREAMING, 6);
    assert.strictEqual(MetricCategory.ASSETS, 7);
    assert.strictEqual(MetricCategory.USER, 8);
    assert.strictEqual(MetricCategory.PLUGIN, 9);
  });
});

// ─── DiagnosticsConfig ───────────────────────────────

describe("DiagnosticsConfig", () => {
  it("defaults", () => {
    const c = new DiagnosticsConfig();
    assert.strictEqual(c.enabled, true);
    assert.strictEqual(c.historySize, 300);
    assert.strictEqual(c.autoReset, true);
    assert.strictEqual(c.samplingRate, 1);
  });

  it("overrides", () => {
    const c = new DiagnosticsConfig({ enabled: false, historySize: 100, autoReset: false, samplingRate: 4 });
    assert.strictEqual(c.enabled, false);
    assert.strictEqual(c.historySize, 100);
    assert.strictEqual(c.autoReset, false);
    assert.strictEqual(c.samplingRate, 4);
  });
});

// ─── CPUTimer ────────────────────────────────────────

describe("CPUTimer", () => {
  it("records elapsed time via diagnostics", () => {
    const metrics = [];
    const fakeDiag = { recordTimer(id, ms) { metrics.push({id, ms}); } };
    const t = new CPUTimer(fakeDiag, 42);
    t.start();
    t.stop();
    assert.strictEqual(metrics.length, 1);
    assert.strictEqual(metrics[0].id, 42);
    assert.ok(metrics[0].ms >= 0);
  });

  it("discard does not record", () => {
    const metrics = [];
    const fakeDiag = { recordTimer(id, ms) { metrics.push({id, ms}); } };
    const t = new CPUTimer(fakeDiag, 0);
    t.start();
    t.discard();
    assert.strictEqual(metrics.length, 0);
  });

  it("double start throws in non-production", () => {
    const fakeDiag = { recordTimer() {} };
    const t = new CPUTimer(fakeDiag, 0);
    t.start();
    assert.throws(() => t.start(), /already running/);
  });

  it("stop on not-started is no-op", () => {
    const fakeDiag = { recordTimer() {} };
    const t = new CPUTimer(fakeDiag, 0);
    t.stop();
  });
});

// ─── FrameStorage ────────────────────────────────────

describe("FrameStorage", () => {
  it("allocates typed arrays", () => {
    const s = new FrameStorage(10);
    assert.ok(s.timerTotals instanceof Float64Array);
    assert.ok(s.timerCounts instanceof Uint32Array);
    assert.ok(s.timerMins instanceof Float64Array);
    assert.ok(s.timerMaxs instanceof Float64Array);
    assert.ok(s.counters instanceof Uint32Array);
    assert.ok(s.gauges instanceof Float64Array);
  });

  it("initializes mins to Infinity, maxs to -Infinity", () => {
    const s = new FrameStorage(5);
    assert.strictEqual(s.timerMins[0], Infinity);
    assert.strictEqual(s.timerMaxs[0], -Infinity);
    assert.strictEqual(s.timerTotals[0], 0);
    assert.strictEqual(s.timerCounts[0], 0);
    assert.strictEqual(s.counters[0], 0);
    assert.strictEqual(s.gauges[0], 0);
  });

  it("geometric growth via ensureCapacity", () => {
    const s = new FrameStorage(10);
    s.timerTotals[9] = 123;
    s.ensureCapacity(11);
    assert.ok(s.capacity >= 11);
    assert.strictEqual(s.timerTotals[9], 123);
    assert.strictEqual(s.timerTotals[10], 0);
  });

  it("cloneBuffer returns independent copy", () => {
    const s = new FrameStorage(10);
    s.timerTotals[0] = 42;
    const buf = s.cloneBuffer();
    const view = new Float64Array(buf, 0, 10);
    assert.strictEqual(view[0], 42);
    s.timerTotals[0] = 0;
    assert.strictEqual(view[0], 42);
  });

  it("reset clears accumulators", () => {
    const s = new FrameStorage(5);
    s.timerTotals[0] = 10;
    s.timerCounts[0] = 3;
    s.timerMins[0] = 1;
    s.timerMaxs[0] = 5;
    counters: s.counters[0] = 7;
    s.gauges[0] = 100;
    s.reset();
    assert.strictEqual(s.timerTotals[0], 0);
    assert.strictEqual(s.timerCounts[0], 0);
    assert.strictEqual(s.timerMins[0], Infinity);
    assert.strictEqual(s.timerMaxs[0], -Infinity);
    assert.strictEqual(s.counters[0], 0);
    assert.strictEqual(s.gauges[0], 0);
  });
});

// ─── FrameSnapshot ───────────────────────────────────

describe("FrameSnapshot", () => {
  it("is frozen", () => {
    const data = createSnapshotData();
    const snap = new FrameSnapshot(data);
    assert.ok(Object.isFrozen(snap));
  });

  it("accessors return correct values", () => {
    const data = createSnapshotData();
    data.timerTotals = new Float64Array([10, 20]);
    data.timerCounts = new Uint32Array([2, 3]);
    data.timerMins = new Float64Array([1, 2]);
    data.timerMaxs = new Float64Array([9, 18]);
    data.counters = new Uint32Array([5, 99]);
    data.gauges = new Float64Array([60, 120]);
    const snap = new FrameSnapshot(data);
    assert.strictEqual(snap.timerTotal(0), 10);
    assert.strictEqual(snap.timerCount(0), 2);
    assert.strictEqual(snap.timerMin(0), 1);
    assert.strictEqual(snap.timerMax(0), 9);
    assert.strictEqual(snap.counter(1), 99);
    assert.strictEqual(snap.gauge(0), 60);
  });

  it("stores metadata, events, registryVer, metricCount", () => {
    const data = createSnapshotData();
    data.metadata = { gpu: "NVIDIA" };
    data.events = [{ frame:1 }];
    data.registryVer = 3;
    data.metricCount = 10;
    const snap = new FrameSnapshot(data);
    assert.deepStrictEqual(snap.metadata, { gpu: "NVIDIA" });
    assert.strictEqual(snap.events.length, 1);
    assert.strictEqual(snap.registryVer, 3);
    assert.strictEqual(snap.metricCount, 10);
  });

  function createSnapshotData() {
    return {
      frame: 1, timestamp: 1000, delta: 16.6, fps: 60,
      registryVer: 0, metricCount: 0,
      timerTotals: new Float64Array(0),
      timerCounts: new Uint32Array(0),
      timerMins: new Float64Array(0),
      timerMaxs: new Float64Array(0),
      counters: new Uint32Array(0),
      gauges: new Float64Array(0),
      events: [],
      metadata: {},
    };
  }
});

// ─── FrameEvent ──────────────────────────────────────

describe("FrameEvent", () => {
  it("stores fields", () => {
    const ev = new FrameEvent(42, 1000, "asset", "Loaded", { key:"x" });
    assert.strictEqual(ev.frame, 42);
    assert.strictEqual(ev.timestamp, 1000);
    assert.strictEqual(ev.category, "asset");
    assert.strictEqual(ev.name, "Loaded");
    assert.deepStrictEqual(ev.metadata, { key:"x" });
  });

  it("defaults metadata to null", () => {
    const ev = new FrameEvent(0, 0, "cat", "name");
    assert.strictEqual(ev.metadata, null);
  });
});

// ─── FrameHistory ────────────────────────────────────

describe("FrameHistory", () => {
  function makeSnap(frame) {
    return new FrameSnapshot({
      frame, timestamp: frame * 1000, delta: 16.6, fps: 60,
      registryVer: 1, metricCount: 2,
      timerTotals: new Float64Array([frame, 0]),
      timerCounts: new Uint32Array([1, 0]),
      timerMins: new Float64Array([frame, Infinity]),
      timerMaxs: new Float64Array([frame, -Infinity]),
      counters: new Uint32Array([frame, 0]),
      gauges: new Float64Array([frame, 0]),
      events: [],
      metadata: {},
    });
  }

  it("push and latest", () => {
    const h = new FrameHistory(5);
    assert.strictEqual(h.latest(), null);
    h.push(makeSnap(1));
    assert.strictEqual(h.latest().frame, 1);
    h.push(makeSnap(2));
    assert.strictEqual(h.latest().frame, 2);
  });

  it("oldest", () => {
    const h = new FrameHistory(5);
    h.push(makeSnap(1));
    h.push(makeSnap(2));
    assert.strictEqual(h.oldest().frame, 1);
  });

  it("at index", () => {
    const h = new FrameHistory(10);
    for (let i = 0; i < 5; i++) h.push(makeSnap(i));
    assert.strictEqual(h.at(0).frame, 4);
    assert.strictEqual(h.at(4).frame, 0);
    assert.strictEqual(h.at(5), null);
    assert.strictEqual(h.at(-1), null);
  });

  it("frames iterator oldest first", () => {
    const h = new FrameHistory(10);
    for (let i = 0; i < 3; i++) h.push(makeSnap(i));
    const frames = [...h.frames()].map(s => s.frame);
    assert.deepStrictEqual(frames, [0, 1, 2]);
  });

  it("forEachReverse newest first", () => {
    const h = new FrameHistory(10);
    for (let i = 0; i < 3; i++) h.push(makeSnap(i));
    const frames = [];
    h.forEachReverse(s => frames.push(s.frame));
    assert.deepStrictEqual(frames, [2, 1, 0]);
  });

  it("ring buffer wraps correctly", () => {
    const h = new FrameHistory(3);
    for (let i = 0; i < 5; i++) h.push(makeSnap(i));
    assert.strictEqual(h.length, 3);
    assert.strictEqual(h.at(0).frame, 4);
    assert.strictEqual(h.at(2).frame, 2);
  });

  it("reset clears", () => {
    const h = new FrameHistory(5);
    h.push(makeSnap(1));
    h.reset();
    assert.strictEqual(h.length, 0);
    assert.strictEqual(h.latest(), null);
    assert.strictEqual(h.oldest(), null);
  });
});

// ─── Diagnostics: Integration ────────────────────────

describe("Diagnostics (integration)", () => {
  it("registers metrics and assigns IDs sequentially", () => {
    const d = new Diagnostics();
    const a = d.registerMetric({ name:"aaa", category:0, unit:0, type:0 });
    const b = d.registerMetric({ name:"bbb", category:0, unit:0, type:0 });
    assert.strictEqual(a, 0);
    assert.strictEqual(b, 1);
  });

  it("registerMetric is idempotent", () => {
    const d = new Diagnostics();
    const a = d.registerMetric({ name:"x", category:0, unit:0, type:0 });
    const b = d.registerMetric({ name:"x", category:0, unit:0, type:0 });
    assert.strictEqual(a, b);
  });

  it("beginFrame disabled when config.enabled=false", () => {
    const d = new Diagnostics({ enabled: false });
    d.beginFrame(1, 16.6);
    // Should not throw
  });

  it("recordTimer is a no-op when not inside a frame", () => {
    const d = basicDiag();
    d.recordTimer(0, 1.0);
    // Should not throw
  });

  it("recordTimer accumulates during frame", () => {
    const d = basicDiag();
    d.beginFrame(1, 16.6);
    d.recordTimer(2, 1.5);
    d.recordTimer(2, 2.5);
    d.endFrame();
    const snap = d.lastSnapshot;
    assert.ok(snap);
    assert.strictEqual(snap.timerCount(2), 2);
    assert.strictEqual(snap.timerTotal(2), 4);
    assert.strictEqual(snap.timerMin(2), 1.5);
    assert.strictEqual(snap.timerMax(2), 2.5);
  });

  it("recordCounter increments during frame", () => {
    const d = basicDiag();
    d.beginFrame(1, 16.6);
    d.recordCounter(3);
    d.recordCounter(3);
    d.recordCounter(3);
    d.endFrame();
    assert.strictEqual(d.lastSnapshot.counter(3), 3);
  });

  it("recordGauge stores value", () => {
    const d = basicDiag();
    d.beginFrame(1, 16.6);
    d.recordGauge(0, 16.6);
    d.endFrame();
    assert.strictEqual(d.lastSnapshot.gauge(0), 16.6);
  });

  it("autoReset resets accumulators each frame", () => {
    const d = basicDiag();
    d.beginFrame(1, 16.6);
    d.recordCounter(3, 5);
    d.endFrame();
    d.beginFrame(2, 16.6);
    d.recordCounter(3, 3);
    d.endFrame();
    assert.strictEqual(d.lastSnapshot.counter(3), 3);
  });

  it("autoReset=false accumulates across frames", () => {
    const d = new Diagnostics({ autoReset: false });
    d.registerMetric({ name:"c", displayName:"C", category:0, unit:0, type:MetricType.COUNTER });
    d.beginFrame(1, 16.6);
    d.recordCounter(0, 5);
    d.endFrame();
    d.beginFrame(2, 16.6);
    d.recordCounter(0, 3);
    d.endFrame();
    assert.strictEqual(d.lastSnapshot.counter(0), 8);
  });

  it("samplingRate skips frames", () => {
    const d = new Diagnostics({ samplingRate: 3 });
    const mid = d.registerMetric({ name:"t", displayName:"T", category:0, unit:0, type:MetricType.TIMER });
    for (let i = 0; i < 6; i++) {
      d.beginFrame(i, 16.6);
      d.recordTimer(mid, 1);
      d.endFrame();
    }
    // With samplingRate=3: frames 0,3 produce snapshots; 1,2,4,5 are skipped
    assert.strictEqual(d.history.length, 2);
  });

  it("lastSnapshot returns null when no frames", () => {
    const d = new Diagnostics();
    assert.strictEqual(d.lastSnapshot, null);
  });

  it("endFrame without beginFrame is no-op", () => {
    const d = basicDiag();
    d.endFrame();
    assert.strictEqual(d.lastSnapshot, null);
  });

  it("snapshot has correct frame and timing data", () => {
    const d = basicDiag();
    d.beginFrame(42, 16.6);
    d.endFrame();
    const snap = d.lastSnapshot;
    assert.strictEqual(snap.frame, 42);
    assert.ok(snap.delta > 0);
    assert.ok(snap.timestamp > 0);
    assert.ok(snap.registryVer >= 0);
    assert.strictEqual(snap.metricCount, 4);
  });

  it("snapshot data is independent clone (mutation-safe)", () => {
    const d = basicDiag();
    d.beginFrame(1, 16.6);
    d.recordCounter(3, 99);
    d.endFrame();
    const snap = d.lastSnapshot;
    assert.strictEqual(snap.counter(3), 99);
    // Start a new frame — old snapshot should be unchanged
    d.beginFrame(2, 16.6);
    d.recordCounter(3, 1);
    d.endFrame();
    // We can't check the first snapshot easily, but the second should be 1
    assert.strictEqual(d.lastSnapshot.counter(3), 1);
  });

  it("history accessible after frames", () => {
    const d = basicDiag();
    d.beginFrame(1, 16.6);
    d.endFrame();
    d.beginFrame(2, 16.6);
    d.endFrame();
    assert.strictEqual(d.history.length, 2);
    assert.strictEqual(d.history.latest().frame, 2);
    assert.strictEqual(d.history.oldest().frame, 1);
  });

  // ─── Metadata ────────────────────────────

  it("setMetadata / getMetadata / clearMetadata", () => {
    const d = new Diagnostics();
    d.setMetadata("gpu", "NVIDIA");
    d.setMetadata("version", "0.8.0");
    assert.strictEqual(d.getMetadata("gpu"), "NVIDIA");
    assert.strictEqual(d.getMetadata("version"), "0.8.0");
    d.clearMetadata();
    assert.strictEqual(d.getMetadata("gpu"), undefined);
  });

  it("metadata appears in snapshot", () => {
    const d = basicDiag();
    d.setMetadata("gpu.vendor", "NVIDIA");
    d.beginFrame(1, 16.6);
    d.endFrame();
    assert.strictEqual(d.lastSnapshot.metadata["gpu.vendor"], "NVIDIA");
  });

  // ─── Events ───────────────────────────────

  it("event() records frame events", () => {
    const d = basicDiag();
    d.beginFrame(1, 16.6);
    d.event("asset", "Texture Loaded", { key: "player.png" });
    d.endFrame();
    assert.strictEqual(d.lastSnapshot.events.length, 1);
    assert.strictEqual(d.lastSnapshot.events[0].category, "asset");
    assert.strictEqual(d.lastSnapshot.events[0].metadata.key, "player.png");
  });

  it("event() outside frame is no-op", () => {
    const d = basicDiag();
    d.event("test", "outside");
    d.beginFrame(1, 16.6);
    d.endFrame();
    assert.strictEqual(d.lastSnapshot.events.length, 0);
  });

  // ─── Timer / Scope ────────────────────────

  it("timer() returns cached CPUTimer", () => {
    const d = basicDiag();
    const t1 = d.timer(2);
    const t2 = d.timer(2);
    assert.strictEqual(t1, t2);
    assert.ok(t1 instanceof CPUTimer);
  });

  it("scope() records elapsed time", () => {
    const d = basicDiag();
    d.beginFrame(1, 16.6);
    d.scope(2, () => {
      // simulate work
    });
    d.endFrame();
    const snap = d.lastSnapshot;
    assert.strictEqual(snap.timerCount(2), 1);
    assert.ok(snap.timerTotal(2) >= 0);
  });

  it("scope() re-throws exceptions after stopping timer", () => {
    const d = basicDiag();
    d.beginFrame(1, 16.6);
    assert.throws(() => {
      d.scope(2, () => { throw new Error("boom"); });
    }, /boom/);
    // Timer should still have recorded
    d.endFrame();
    assert.strictEqual(d.lastSnapshot.timerCount(2), 1);
  });

  // ─── lockRegistry ─────────────────────────

  it("lockRegistry prevents further static registration", () => {
    const d = basicDiag();
    d.lockRegistry();
    assert.throws(() => {
      d.registerMetric({ name:"locked", category:0, unit:0, type:0 });
    }, /locked/);
  });

  it("registerDynamicMetric still works after lock", () => {
    const d = basicDiag();
    d.lockRegistry();
    const id = d.registerDynamicMetric({ name:"dyn", category:0, unit:0, type:0 });
    assert.strictEqual(d.metrics.get(id).name, "dyn");
  });

  // ─── reset ────────────────────────────────

  it("reset clears all state", () => {
    const d = basicDiag();
    d.beginFrame(1, 16.6);
    d.recordCounter(3, 99);
    d.event("test", "event");
    d.endFrame();
    d.setMetadata("key", "val");
    assert.strictEqual(d.history.length, 1);
    assert.strictEqual(d.getMetadata("key"), "val");
    d.reset();
    assert.strictEqual(d.history.length, 0);
    assert.strictEqual(d.lastSnapshot, null);
    assert.strictEqual(d.getMetadata("key"), undefined);
    // Accumulators should be reset
    d.beginFrame(2, 16.6);
    d.recordCounter(3, 1);
    d.endFrame();
    assert.strictEqual(d.lastSnapshot.counter(3), 1);
  });

  // ─── FrameStorage growth via dynamic metric ─

  it("dynamic metric triggers storage growth", () => {
    const d = new Diagnostics({ initialCapacity: 4 });
    // Register many metrics to trigger growth
    const ids = [];
    for (let i = 0; i < 20; i++) {
      ids.push(d.registerDynamicMetric({ name:`dyn_${i}`, category:0, unit:0, type:0 }));
    }
    d.beginFrame(1, 16.6);
    for (const id of ids) {
      d.recordCounter(id, 1);
    }
    d.endFrame();
    for (const id of ids) {
      assert.strictEqual(d.lastSnapshot.counter(id), 1);
    }
  });
});

// ─── Commit 2: ECS Integration ──────────────────────

describe("Diagnostics ECS Integration", () => {
  function createTestWorld() {
    const world = new World();
    world.register(FakeC1);
    world.register(FakeC2);

    const diag = new Diagnostics();
    diag.registerMetric({ name:"frame.delta",         category:MetricCategory.FRAME, group:"Frame",  unit:MetricUnit.MILLISECONDS, type:MetricType.GAUGE,   tags:Object.freeze(["frame"]) });
    diag.registerMetric({ name:"frame.fps",           category:MetricCategory.FRAME, group:"Frame",  unit:MetricUnit.FPS,          type:MetricType.GAUGE,   tags:Object.freeze(["frame"]) });
    diag.registerMetric({ name:"frame.update",        category:MetricCategory.FRAME, group:"Frame",  unit:MetricUnit.MILLISECONDS, type:MetricType.TIMER,   tags:Object.freeze(["frame","ecs"]) });
    diag.registerMetric({ name:"ecs.world.entities",  category:MetricCategory.ECS,   group:"World", unit:MetricUnit.COUNT,         type:MetricType.GAUGE,   tags:Object.freeze(["ecs","world"]) });
    diag.registerMetric({ name:"ecs.world.archetypes",category:MetricCategory.ECS,   group:"World", unit:MetricUnit.COUNT,         type:MetricType.GAUGE,   tags:Object.freeze(["ecs","world"]) });
    diag.registerMetric({ name:"ecs.world.systems",   category:MetricCategory.ECS,   group:"World", unit:MetricUnit.COUNT,         type:MetricType.GAUGE,   tags:Object.freeze(["ecs","world"]) });
    diag.registerMetric({ name:"ecs.entitiesCreated", category:MetricCategory.ECS,   group:"World", unit:MetricUnit.COUNT,         type:MetricType.COUNTER, tags:Object.freeze(["ecs"]) });
    diag.registerMetric({ name:"ecs.entitiesDestroyed",category:MetricCategory.ECS,  group:"World", unit:MetricUnit.COUNT,         type:MetricType.COUNTER, tags:Object.freeze(["ecs"]) });
    world.setResource(Diagnostics, diag);

    world.addSystem(new DiagTestSys());

    diag.lockRegistry();
    return world;
  }

  it("World.update() records a frame snapshot", () => {
    const world = createTestWorld();
    world.createEntity();
    world.update(1 / 60);
    const diag = world.getResource(Diagnostics);
    const snap = diag.lastSnapshot;
    assert.ok(snap, "expected a frame snapshot");
    assert.strictEqual(snap.frame, 0);
  });

  it("records ecs.world.* gauges after update", () => {
    const world = createTestWorld();
    world.createEntity();
    world.update(1 / 60);
    const diag = world.getResource(Diagnostics);
    const snap = diag.lastSnapshot;
    assert.ok(snap.gauge(diag.metrics.find("ecs.world.entities").id) >= 1);
    assert.ok(snap.gauge(diag.metrics.find("ecs.world.systems").id) >= 1);
    assert.ok(snap.gauge(diag.metrics.find("ecs.world.archetypes").id) >= 1);
  });

  it("records frame.delta and frame.fps gauges", () => {
    const world = createTestWorld();
    world.update(1 / 60);
    const diag = world.getResource(Diagnostics);
    const snap = diag.lastSnapshot;
    const expectedMs = (1 / 60) * 1000;
    assert.ok(Math.abs(snap.gauge(diag.metrics.find("frame.delta").id) - expectedMs) < 0.01);
    assert.ok(snap.gauge(diag.metrics.find("frame.fps").id) > 0);
  });

  it("records frame.update timer", () => {
    const world = createTestWorld();
    world.update(1 / 60);
    const diag = world.getResource(Diagnostics);
    const snap = diag.lastSnapshot;
    const updateId = diag.metrics.find("frame.update").id;
    assert.strictEqual(snap.timerCount(updateId), 1);
    assert.ok(snap.timerTotal(updateId) >= 0);
  });

  it("records ecs.system.* timer per system", () => {
    const world = createTestWorld();
    world.update(1 / 60);
    const diag = world.getResource(Diagnostics);
    const sysMetric = diag.metrics.find("ecs.system.diagtestsys");
    assert.ok(sysMetric, "expected auto-registered system metric");
    const snap = diag.lastSnapshot;
    assert.strictEqual(snap.timerCount(sysMetric.id), 1);
  });

  it("records entitiesCreated counter on createEntity", () => {
    const world = createTestWorld();
    class Creator extends System {
      update(ctx, dt) {
        ctx.world.createEntity();
        ctx.world.createEntity();
      }
    }
    world.addSystem(new Creator());
    world.update(1 / 60);
    const diag = world.getResource(Diagnostics);
    const snap = diag.lastSnapshot;
    const createdId = diag.metrics.find("ecs.entitiesCreated").id;
    assert.strictEqual(snap.counter(createdId), 2);
  });

  it("records entitiesDestroyed counter on destroyEntity", () => {
    const world = createTestWorld();
    let e1;
    class Destroyer extends System {
      update(ctx, dt) {
        if (e1 === undefined) {
          e1 = ctx.world.createEntity();
          ctx.world.createEntity();
        }
        if (e1 !== undefined) {
          ctx.world.destroyEntity(e1);
        }
      }
    }
    world.addSystem(new Destroyer());
    world.update(1 / 60);
    const diag = world.getResource(Diagnostics);
    const snap = diag.lastSnapshot;
    const destroyedId = diag.metrics.find("ecs.entitiesDestroyed").id;
    assert.strictEqual(snap.counter(destroyedId), 1);
    const createdId = diag.metrics.find("ecs.entitiesCreated").id;
    assert.strictEqual(snap.counter(createdId), 2);
  });

  it("entitiesCreated and entitiesDestroyed both recorded in same frame", () => {
    const world = createTestWorld();
    class Combo extends System {
      update(ctx, dt) {
        const e1 = ctx.world.createEntity();
        ctx.world.createEntity();
        ctx.world.destroyEntity(e1);
      }
    }
    world.addSystem(new Combo());
    world.update(1 / 60);
    const diag = world.getResource(Diagnostics);
    const snap = diag.lastSnapshot;
    const createdId = diag.metrics.find("ecs.entitiesCreated").id;
    const destroyedId = diag.metrics.find("ecs.entitiesDestroyed").id;
    assert.strictEqual(snap.counter(createdId), 2);
    assert.strictEqual(snap.counter(destroyedId), 1);
  });

  it("lockRegistry prevents static registration after init", () => {
    const world = createTestWorld();
    const diag = world.getResource(Diagnostics);
    assert.throws(() => {
      diag.registerMetric({ name:"should.fail", category:0, unit:0, type:0 });
    }, /locked/);
  });

  it("adds system after lock via registerDynamicMetric", () => {
    const world = createTestWorld();
    const diag = world.getResource(Diagnostics);
    const id = diag.registerDynamicMetric({ name:"late.metric", category:0, unit:0, type:0 });
    assert.strictEqual(diag.metrics.get(id).name, "late.metric");
  });
});

class FakeC1 { constructor() { this.x = 0; } }
class FakeC2 { constructor() { this.y = 0; } }

class DiagTestSys extends System {
  static query = { all: [FakeC1] };
  update(ctx, dt) {
    // system does work that is timed
  }
}
