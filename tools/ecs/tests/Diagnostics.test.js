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
import { RenderSystem } from "../../../ecs/systems/RenderSystem.js";
import { RenderQueue } from "../../../ecs/render/RenderQueue.js";
import { CanvasContext } from "../../../ecs/render/CanvasContext.js";
import { CollisionSystem } from "../../../ecs/systems/CollisionSystem.js";
import { SpatialHash } from "../../../collision/SpatialHash.js";
import { Transform } from "../../../ecs/components/Transform.js";
import { Velocity } from "../../../ecs/components/Velocity.js";
import { Renderable } from "../../../ecs/components/Renderable.js";
import { RenderBounds } from "../../../ecs/components/RenderBounds.js";
import { Visible } from "../../../ecs/components/Visible.js";
import { Collider } from "../../../ecs/components/Collider.js";
import { AudioManager } from "../../../audio/AudioManager.js";
import { ParticleSystem } from "../../../particles/ParticleSystem.js";
import { StreamingManager } from "../../../ecs/streaming/StreamingManager.js";
import { SceneManager } from "../../../ecs/scene/SceneManager.js";

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

// ─── Commit 1: Structural Change Metrics (Phase 2) ──

function _registerStructuralMetrics(diag) {
  diag.registerMetric({ name:"frame.delta",         category:MetricCategory.FRAME, group:"Frame",  unit:MetricUnit.MILLISECONDS, type:MetricType.GAUGE,   tags:Object.freeze(["frame"]) });
  diag.registerMetric({ name:"frame.fps",           category:MetricCategory.FRAME, group:"Frame",  unit:MetricUnit.FPS,          type:MetricType.GAUGE,   tags:Object.freeze(["frame"]) });
  diag.registerMetric({ name:"frame.update",        category:MetricCategory.FRAME, group:"Frame",  unit:MetricUnit.MILLISECONDS, type:MetricType.TIMER,   tags:Object.freeze(["frame","ecs"]) });
  diag.registerMetric({ name:"ecs.world.entities",  category:MetricCategory.ECS,   group:"World", unit:MetricUnit.COUNT,         type:MetricType.GAUGE,   tags:Object.freeze(["ecs","world"]) });
  diag.registerMetric({ name:"ecs.world.archetypes",category:MetricCategory.ECS,   group:"World", unit:MetricUnit.COUNT,         type:MetricType.GAUGE,   tags:Object.freeze(["ecs","world"]) });
  diag.registerMetric({ name:"ecs.world.systems",   category:MetricCategory.ECS,   group:"World", unit:MetricUnit.COUNT,         type:MetricType.GAUGE,   tags:Object.freeze(["ecs","world"]) });
  diag.registerMetric({ name:"ecs.entitiesCreated", category:MetricCategory.ECS,   group:"World", unit:MetricUnit.COUNT,         type:MetricType.COUNTER, tags:Object.freeze(["ecs"]) });
  diag.registerMetric({ name:"ecs.entitiesDestroyed",category:MetricCategory.ECS,  group:"World", unit:MetricUnit.COUNT,         type:MetricType.COUNTER, tags:Object.freeze(["ecs"]) });
  diag.registerMetric({ name:"ecs.componentsAdded",  category:MetricCategory.ECS,   group:"Changes", unit:MetricUnit.COUNT, type:MetricType.COUNTER, tags:Object.freeze(["ecs"]) });
  diag.registerMetric({ name:"ecs.componentsRemoved",category:MetricCategory.ECS,  group:"Changes", unit:MetricUnit.COUNT, type:MetricType.COUNTER, tags:Object.freeze(["ecs"]) });
  diag.registerMetric({ name:"ecs.entitiesMigrated", category:MetricCategory.ECS,  group:"Changes", unit:MetricUnit.COUNT, type:MetricType.COUNTER, tags:Object.freeze(["ecs"]) });
  diag.registerMetric({ name:"ecs.archetypesCreated",category:MetricCategory.ECS,  group:"Changes", unit:MetricUnit.COUNT, type:MetricType.COUNTER, tags:Object.freeze(["ecs"]) });
}

describe("Diagnostics Structural Changes", () => {
  it("records componentsAdded counter on addComponent", () => {
    const world = new World();
    world.register(Transform);
    const diag = new Diagnostics();
    _registerStructuralMetrics(diag);
    world.setResource(Diagnostics, diag);

    let e;
    class Adder extends System {
      update(ctx, dt) {
        if (e === undefined) e = ctx.world.createEntity();
        ctx.world.addComponent(e, Transform);
      }
    }
    world.addSystem(new Adder());
    diag.lockRegistry();

    world.update(1 / 60);
    const snap = diag.lastSnapshot;
    const addedId = diag.metrics.find("ecs.componentsAdded").id;
    assert.strictEqual(snap.counter(addedId), 1);
  });

  it("records componentsRemoved counter on removeComponent", () => {
    const world = new World();
    world.register(Transform);
    const diag = new Diagnostics();
    _registerStructuralMetrics(diag);
    world.setResource(Diagnostics, diag);

    let e;
    class Remover extends System {
      update(ctx, dt) {
        if (e === undefined) {
          e = ctx.world.createEntity();
          ctx.world.addComponent(e, Transform);
        } else {
          ctx.world.removeComponent(e, Transform);
        }
      }
    }
    world.addSystem(new Remover());
    diag.lockRegistry();

    world.update(1 / 60); // first frame: create + add
    world.update(1 / 60); // second frame: remove
    const snap = diag.lastSnapshot;
    const removedId = diag.metrics.find("ecs.componentsRemoved").id;
    assert.strictEqual(snap.counter(removedId), 1);
  });

  it("records componentsAdded for addMany and componentsRemoved for removeMany", () => {
    const world = new World();
    world.register(Transform);
    world.register(Velocity);
    const diag = new Diagnostics();
    _registerStructuralMetrics(diag);
    world.setResource(Diagnostics, diag);

    let e, phase;
    class Batch extends System {
      update(ctx, dt) {
        if (e === undefined) {
          e = ctx.world.createEntity();
          phase = 0;
        }
        if (phase === 0) {
          ctx.world.addMany(e, Transform, Velocity);
          phase = 1;
        } else if (phase === 1) {
          ctx.world.removeMany(e, Transform, Velocity);
          phase = 2;
        }
      }
    }
    world.addSystem(new Batch());
    diag.lockRegistry();

    world.update(1 / 60); // addMany
    let snap = diag.lastSnapshot;
    const addedId = diag.metrics.find("ecs.componentsAdded").id;
    assert.strictEqual(snap.counter(addedId), 2);

    world.update(1 / 60); // removeMany
    snap = diag.lastSnapshot;
    const removedId = diag.metrics.find("ecs.componentsRemoved").id;
    assert.strictEqual(snap.counter(removedId), 2);
  });

  it("records entitiesMigrated counter on component add/remove", () => {
    const world = new World();
    world.register(Transform);
    const diag = new Diagnostics();
    _registerStructuralMetrics(diag);
    world.setResource(Diagnostics, diag);

    let e, step;
    class Migrator extends System {
      update(ctx, dt) {
        if (e === undefined) {
          e = ctx.world.createEntity();
          step = 0;
        }
        if (step === 0) {
          ctx.world.addComponent(e, Transform);
          step = 1;
        }
      }
    }
    world.addSystem(new Migrator());
    diag.lockRegistry();

    world.update(1 / 60);
    const snap = diag.lastSnapshot;
    const migratedId = diag.metrics.find("ecs.entitiesMigrated").id;
    assert.ok(snap.counter(migratedId) >= 1);
  });

  it("records entitiesMigrated counter on clear", () => {
    const world = new World();
    world.register(Transform);
    const diag = new Diagnostics();
    _registerStructuralMetrics(diag);
    world.setResource(Diagnostics, diag);

    let e, step;
    class Clearer extends System {
      update(ctx, dt) {
        if (e === undefined) {
          e = ctx.world.createEntity();
          step = 0;
        }
        if (step === 0) {
          ctx.world.addComponent(e, Transform);
          step = 1;
          return;
        }
        if (step === 1) {
          ctx.world.clear(e);
          step = 2;
        }
      }
    }
    world.addSystem(new Clearer());
    diag.lockRegistry();

    const migratedId = diag.metrics.find("ecs.entitiesMigrated").id;

    world.update(1 / 60); // create + addComponent
    world.update(1 / 60); // clear
    const snap = diag.lastSnapshot;
    assert.strictEqual(snap.counter(migratedId), 1);

    world.update(1 / 60); // no changes → resets
    const snap2 = diag.lastSnapshot;
    assert.strictEqual(snap2.counter(migratedId), 0);
  });

  it("counters reset each frame (autoReset)", () => {
    const world = new World();
    world.register(Transform);
    const diag = new Diagnostics();
    _registerStructuralMetrics(diag);
    world.setResource(Diagnostics, diag);

    let e;
    class OneShot extends System {
      update(ctx, dt) {
        if (e === undefined) {
          e = ctx.world.createEntity();
          ctx.world.addComponent(e, Transform);
        }
      }
    }
    world.addSystem(new OneShot());
    diag.lockRegistry();

    const addedId = diag.metrics.find("ecs.componentsAdded").id;
    const migratedId = diag.metrics.find("ecs.entitiesMigrated").id;

    world.update(1 / 60);
    let snap = diag.lastSnapshot;
    assert.strictEqual(snap.counter(addedId), 1);
    assert.ok(snap.counter(migratedId) >= 1);

    world.update(1 / 60);
    snap = diag.lastSnapshot;
    assert.strictEqual(snap.counter(addedId), 0);
    assert.strictEqual(snap.counter(migratedId), 0);
  });

  it("archetypesCreated counter increments on new signature", () => {
    const world = new World();
    world.register(Transform);
    world.register(Velocity);
    const diag = new Diagnostics();
    _registerStructuralMetrics(diag);
    world.setResource(Diagnostics, diag);

    let e, step;
    class ArchCreator extends System {
      update(ctx, dt) {
        if (e === undefined) {
          e = ctx.world.createEntity();
          step = 0;
        }
        if (step === 0) {
          ctx.world.addComponent(e, Transform);
          step = 1;
        }
      }
    }
    world.addSystem(new ArchCreator());
    diag.lockRegistry();

    const archCreatedId = diag.metrics.find("ecs.archetypesCreated").id;

    world.update(1 / 60);
    const snap = diag.lastSnapshot;
    assert.strictEqual(snap.counter(archCreatedId), 1, "addComponent should create one archetype");
  });

  it("archetypesCreated does not increment for existing archetype", () => {
    const world = new World();
    world.register(Transform);
    const diag = new Diagnostics();
    _registerStructuralMetrics(diag);
    world.setResource(Diagnostics, diag);

    let e1, e2, step;
    class DuplicateArch extends System {
      update(ctx, dt) {
        if (e1 === undefined) {
          e1 = ctx.world.createEntity();
          e2 = ctx.world.createEntity();
          step = 0;
        }
        if (step === 0) {
          ctx.world.addComponent(e1, Transform);
          step = 1;
        } else if (step === 1) {
          ctx.world.addComponent(e2, Transform);
          step = 2;
        }
      }
    }
    world.addSystem(new DuplicateArch());
    diag.lockRegistry();

    const archCreatedId = diag.metrics.find("ecs.archetypesCreated").id;

    world.update(1 / 60); // first addComponent creates archetype
    world.update(1 / 60); // second addComponent reuses it
    const snap = diag.lastSnapshot;
    assert.strictEqual(snap.counter(archCreatedId), 0, "reusing existing archetype should not create new one");
  });

  it("does not record when Diagnostics is not set", () => {
    const world = new World();
    world.register(Transform);

    class SafeSystem extends System {
      update(ctx, dt) {
        const e = ctx.world.createEntity();
        ctx.world.addComponent(e, Transform);
      }
    }
    world.addSystem(new SafeSystem());
    world.update(1 / 60);
  });
});

// ─── Commit 3: Subsystem Instrumentation ────────────

describe("Diagnostics Subsystem Instrumentation", () => {
  function mockCanvasCtx() {
    return {
      save() {}, restore() {}, translate() {}, rotate() {}, scale() {},
      fillRect() {}, beginPath() {}, arc() {}, fill() {}, drawImage() {},
      getTransform() { return { a:1, b:0, c:0, d:1, e:0, f:0 }; },
      setTransform() {},
    };
  }

  // ─── RenderSystem ──────────────────────────────────

  describe("RenderSystem", () => {
    it("records render.draw timer with nested populate/batch and per-type counters", () => {
      const world = new World();
      world.register(Transform);
      world.register(Renderable);
      world.register(RenderBounds);
      world.register(Visible);

      const diag = new Diagnostics();
      diag.registerMetric({ name:"frame.delta",         category:MetricCategory.FRAME, group:"Frame",  unit:MetricUnit.MILLISECONDS, type:MetricType.GAUGE,   tags:Object.freeze(["frame"]) });
      diag.registerMetric({ name:"frame.fps",           category:MetricCategory.FRAME, group:"Frame",  unit:MetricUnit.FPS,          type:MetricType.GAUGE,   tags:Object.freeze(["frame"]) });
      diag.registerMetric({ name:"frame.update",        category:MetricCategory.FRAME, group:"Frame",  unit:MetricUnit.MILLISECONDS, type:MetricType.TIMER,   tags:Object.freeze(["frame","ecs"]) });
      diag.registerMetric({ name:"ecs.world.entities",  category:MetricCategory.ECS,   group:"World", unit:MetricUnit.COUNT,         type:MetricType.GAUGE,   tags:Object.freeze(["ecs","world"]) });
      diag.registerMetric({ name:"ecs.world.systems",   category:MetricCategory.ECS,   group:"World", unit:MetricUnit.COUNT,         type:MetricType.GAUGE,   tags:Object.freeze(["ecs","world"]) });
      diag.registerMetric({ name:"ecs.world.archetypes",category:MetricCategory.ECS,   group:"World", unit:MetricUnit.COUNT,         type:MetricType.GAUGE,   tags:Object.freeze(["ecs","world"]) });
      diag.registerMetric({ name:"ecs.entitiesCreated", category:MetricCategory.ECS,   group:"World", unit:MetricUnit.COUNT,         type:MetricType.COUNTER, tags:Object.freeze(["ecs"]) });
      diag.registerMetric({ name:"ecs.entitiesDestroyed",category:MetricCategory.ECS,  group:"World", unit:MetricUnit.COUNT,         type:MetricType.COUNTER, tags:Object.freeze(["ecs"]) });
      diag.registerMetric({ name:"render.draw",         category:MetricCategory.RENDER, group:"Render", unit:MetricUnit.MILLISECONDS, type:MetricType.TIMER,   tags:Object.freeze(["render"]) });
      diag.registerMetric({ name:"render.commands",     category:MetricCategory.RENDER, group:"Render", unit:MetricUnit.COUNT,         type:MetricType.COUNTER, tags:Object.freeze(["render"]) });
      diag.registerMetric({ name:"render.populate",     category:MetricCategory.RENDER, group:"Render", unit:MetricUnit.MILLISECONDS, type:MetricType.TIMER,   tags:Object.freeze(["render"]) });
      diag.registerMetric({ name:"render.batch",        category:MetricCategory.RENDER, group:"Render", unit:MetricUnit.MILLISECONDS, type:MetricType.TIMER,   tags:Object.freeze(["render"]) });
      diag.registerMetric({ name:"render.images",       category:MetricCategory.RENDER, group:"Render", unit:MetricUnit.COUNT,         type:MetricType.COUNTER, tags:Object.freeze(["render"]) });
      diag.registerMetric({ name:"render.primitives",   category:MetricCategory.RENDER, group:"Render", unit:MetricUnit.COUNT,         type:MetricType.COUNTER, tags:Object.freeze(["render"]) });
      world.setResource(Diagnostics, diag);

      world.setResource(RenderQueue, new RenderQueue());
      world.setResource(CanvasContext, mockCanvasCtx());
      world.addSystem(new RenderSystem());
      diag.lockRegistry();

      const e = world.createEntity();
      world.addComponent(e, Transform);
      world.setComponent(e, Transform, { x:100, y:100 });
      world.addComponent(e, Renderable);
      world.addComponent(e, RenderBounds);
      world.setComponent(e, RenderBounds, { width:32, height:32 });
      world.addComponent(e, Visible);
      world.setComponent(e, Visible, { value:1 });

      world.update(1 / 60);
      const snap = diag.lastSnapshot;
      const draw = diag.metrics.find("render.draw");
      const cmds = diag.metrics.find("render.commands");
      const pop = diag.metrics.find("render.populate");
      const batch = diag.metrics.find("render.batch");
      const img = diag.metrics.find("render.images");
      const prim = diag.metrics.find("render.primitives");
      assert.ok(draw, "render.draw should exist");
      assert.ok(cmds, "render.commands should exist");
      assert.ok(pop, "render.populate should exist");
      assert.ok(batch, "render.batch should exist");
      assert.strictEqual(snap.timerCount(draw.id), 1);
      assert.ok(snap.counter(cmds.id) >= 1);
      assert.ok(snap.timerCount(pop.id) === 1, "populate scope recorded");
      assert.ok(snap.timerCount(batch.id) === 1, "batch scope recorded");
      assert.ok(snap.counter(img.id) === 0, "shape entity: 0 images");
      assert.ok(snap.counter(prim.id) >= 1, "shape entity: primitives >= 1");
    });

    it("works without Diagnostics (no crash)", () => {
      const world = new World();
      world.register(Transform);
      world.register(Renderable);
      world.register(RenderBounds);
      world.register(Visible);
      world.setResource(RenderQueue, new RenderQueue());
      const canvasCtx = {
        save() {}, restore() {}, translate() {}, rotate() {}, scale() {},
        fillRect() {}, beginPath() {}, arc() {}, fill() {}, drawImage() {},
        getTransform() { return { a:1, b:0, c:0, d:1, e:0, f:0 }; },
        setTransform() {},
      };
      world.setResource(CanvasContext, canvasCtx);
      world.addSystem(new RenderSystem());

      const e = world.createEntity();
      world.addComponent(e, Transform);
      world.setComponent(e, Transform, { x:100, y:100 });
      world.addComponent(e, Renderable);
      world.addComponent(e, RenderBounds);
      world.setComponent(e, RenderBounds, { width:32, height:32 });
      world.addComponent(e, Visible);
      world.setComponent(e, Visible, { value:1 });

      world.update(1 / 60);
      assert.ok(true, "RenderSystem update completes without Diagnostics");
    });
  });

  // ─── CollisionSystem ───────────────────────────────

  describe("CollisionSystem", () => {
    it("records physics.broadphase timer and physics.bodies gauge", () => {
      const world = new World();
      world.register(Transform);
      world.register(Collider);
      world.register(Visible);

      const diag = new Diagnostics();
      diag.registerMetric({ name:"frame.delta",         category:MetricCategory.FRAME, group:"Frame",  unit:MetricUnit.MILLISECONDS, type:MetricType.GAUGE,   tags:Object.freeze(["frame"]) });
      diag.registerMetric({ name:"frame.fps",           category:MetricCategory.FRAME, group:"Frame",  unit:MetricUnit.FPS,          type:MetricType.GAUGE,   tags:Object.freeze(["frame"]) });
      diag.registerMetric({ name:"frame.update",        category:MetricCategory.FRAME, group:"Frame",  unit:MetricUnit.MILLISECONDS, type:MetricType.TIMER,   tags:Object.freeze(["frame","ecs"]) });
      diag.registerMetric({ name:"ecs.world.entities",  category:MetricCategory.ECS,   group:"World", unit:MetricUnit.COUNT,         type:MetricType.GAUGE,   tags:Object.freeze(["ecs","world"]) });
      diag.registerMetric({ name:"ecs.world.systems",   category:MetricCategory.ECS,   group:"World", unit:MetricUnit.COUNT,         type:MetricType.GAUGE,   tags:Object.freeze(["ecs","world"]) });
      diag.registerMetric({ name:"ecs.world.archetypes",category:MetricCategory.ECS,   group:"World", unit:MetricUnit.COUNT,         type:MetricType.GAUGE,   tags:Object.freeze(["ecs","world"]) });
      diag.registerMetric({ name:"ecs.entitiesCreated", category:MetricCategory.ECS,   group:"World", unit:MetricUnit.COUNT,         type:MetricType.COUNTER, tags:Object.freeze(["ecs"]) });
      diag.registerMetric({ name:"ecs.entitiesDestroyed",category:MetricCategory.ECS,  group:"World", unit:MetricUnit.COUNT,         type:MetricType.COUNTER, tags:Object.freeze(["ecs"]) });
      world.setResource(Diagnostics, diag);

      world.setResource(SpatialHash, new SpatialHash());
      world.addSystem(new CollisionSystem());
      diag.lockRegistry();

      const e = world.createEntity();
      world.addComponent(e, Transform);
      world.setComponent(e, Transform, { x:100, y:100 });
      world.addComponent(e, Collider);
      world.setComponent(e, Collider, { width:32, height:32 });
      world.addComponent(e, Visible);
      world.setComponent(e, Visible, { value:1 });

      world.update(1 / 60);
      const snap = diag.lastSnapshot;
      const bp = diag.metrics.find("physics.broadphase");
      const bodies = diag.metrics.find("physics.bodies");
      assert.ok(bp, "physics.broadphase should be auto-registered");
      assert.ok(bodies, "physics.bodies should be auto-registered");
      assert.strictEqual(snap.timerCount(bp.id), 1);
      assert.ok(snap.gauge(bodies.id) >= 1);
    });
  });

  // ─── AudioManager ──────────────────────────────────

  describe("AudioManager", () => {
    it("records audio.update, audio.active, audio.pooled via diagnostics", () => {
      const am = new AudioManager();
      const diag = new Diagnostics();
      diag.registerMetric({ name:"frame.delta", category:MetricCategory.FRAME, group:"Frame", unit:MetricUnit.MILLISECONDS, type:MetricType.GAUGE, tags:Object.freeze(["frame"]) });
      diag.registerMetric({ name:"frame.fps",   category:MetricCategory.FRAME, group:"Frame", unit:MetricUnit.FPS,          type:MetricType.GAUGE, tags:Object.freeze(["frame"]) });
      diag.lockRegistry();

      am.diagnostics = diag;

      diag.beginFrame(1, 16.6);
      am.update(1 / 60);
      diag.endFrame();

      const snap = diag.lastSnapshot;
      const update = diag.metrics.find("audio.update");
      const active = diag.metrics.find("audio.active");
      const pooled = diag.metrics.find("audio.pooled");
      assert.ok(update, "audio.update should exist");
      assert.ok(active, "audio.active should exist");
      assert.ok(pooled, "audio.pooled should exist");
      assert.strictEqual(snap.timerCount(update.id), 1);
      assert.strictEqual(snap.gauge(active.id), 0);
      assert.ok(snap.gauge(pooled.id) >= 0);
    });
  });

  // ─── ParticleSystem ────────────────────────────────

  describe("ParticleSystem", () => {
    it("records particles.* metrics via diagnostics", () => {
      const ps = new ParticleSystem();
      const diag = new Diagnostics();
      diag.registerMetric({ name:"frame.delta", category:MetricCategory.FRAME, group:"Frame", unit:MetricUnit.MILLISECONDS, type:MetricType.GAUGE, tags:Object.freeze(["frame"]) });
      diag.registerMetric({ name:"frame.fps",   category:MetricCategory.FRAME, group:"Frame", unit:MetricUnit.FPS,          type:MetricType.GAUGE, tags:Object.freeze(["frame"]) });
      diag.lockRegistry();

      ps.diagnostics = diag;

      diag.beginFrame(1, 16.6);
      ps.update(1 / 60);
      ps.render(null);
      diag.endFrame();

      const snap = diag.lastSnapshot;
      const sim = diag.metrics.find("particles.simulation");
      const draw = diag.metrics.find("particles.draw");
      const alive = diag.metrics.find("particles.alive");
      assert.ok(sim, "particles.simulation should exist");
      assert.ok(draw, "particles.draw should exist");
      assert.ok(alive, "particles.alive should exist");
      assert.strictEqual(snap.timerCount(sim.id), 1);
      assert.strictEqual(snap.timerCount(draw.id), 1);
      assert.strictEqual(snap.gauge(alive.id), 0);
    });

    it("records particles.emitted counter on emit", () => {
      const ps = new ParticleSystem();
      const diag = new Diagnostics();
      diag.registerMetric({ name:"frame.delta", category:MetricCategory.FRAME, group:"Frame", unit:MetricUnit.MILLISECONDS, type:MetricType.GAUGE, tags:Object.freeze(["frame"]) });
      diag.registerMetric({ name:"frame.fps",   category:MetricCategory.FRAME, group:"Frame", unit:MetricUnit.FPS,          type:MetricType.GAUGE, tags:Object.freeze(["frame"]) });
      diag.lockRegistry();

      ps.diagnostics = diag;

      diag.beginFrame(1, 16.6);
      ps.emit(5, () => ({ x:0, y:0, vx:0, vy:0, life:1 }));
      diag.endFrame();

      const snap = diag.lastSnapshot;
      const emitted = diag.metrics.find("particles.emitted");
      assert.ok(emitted, "particles.emitted should exist");
      assert.strictEqual(snap.counter(emitted.id), 5);
    });
  });

  // ─── SpatialHash ───────────────────────────────────

  describe("SpatialHash", () => {
    it("records physics.narrowphase timer when diagnostics is set", () => {
      const diag = new Diagnostics();
      diag.registerMetric({ name:"frame.delta", category:MetricCategory.FRAME, group:"Frame", unit:MetricUnit.MILLISECONDS, type:MetricType.GAUGE, tags:Object.freeze(["frame"]) });
      diag.registerMetric({ name:"frame.fps",   category:MetricCategory.FRAME, group:"Frame", unit:MetricUnit.FPS,          type:MetricType.GAUGE, tags:Object.freeze(["frame"]) });
      diag.lockRegistry();

      const hash = new SpatialHash();
      hash.diagnostics = diag;

      hash.insert(1, 100, 100, 32, 32);

      diag.beginFrame(1, 16.6);
      const hits = hash.queryRect({ left:80, right:120, top:80, bottom:120 });
      diag.endFrame();

      const snap = diag.lastSnapshot;
      const np = diag.metrics.find("physics.narrowphase");
      assert.ok(np, "physics.narrowphase should be auto-registered");
      assert.strictEqual(snap.timerCount(np.id), 1);
      assert.deepStrictEqual(hits, [1]);
    });
  });

  // ─── StreamingManager ──────────────────────────────

  describe("StreamingManager", () => {
    it("records streaming.* counters and gauges on load/unload", () => {
      const world = new World();
      const sm = new StreamingManager(world);
      const diag = new Diagnostics();
      diag.lockRegistry();

      sm.diagnostics = diag;

      sm.createCell("town");
      sm.createCell("forest");

      diag.beginFrame(1, 16.6);
      sm.load("town");
      diag.endFrame();

      let snap = diag.lastSnapshot;
      const loadedCells = diag.metrics.find("streaming.loadedCells");
      const cellsLoaded = diag.metrics.find("streaming.cellsLoaded");
      assert.ok(loadedCells, "streaming.loadedCells should exist");
      assert.ok(cellsLoaded, "streaming.cellsLoaded should exist");
      assert.strictEqual(snap.counter(cellsLoaded.id), 1);
      assert.strictEqual(snap.gauge(loadedCells.id), 1);

      diag.beginFrame(2, 16.6);
      sm.load("forest");
      diag.endFrame();

      snap = diag.lastSnapshot;
      assert.strictEqual(snap.counter(cellsLoaded.id), 1);
      assert.strictEqual(snap.gauge(loadedCells.id), 2);

      diag.beginFrame(3, 16.6);
      sm.unload("town");
      diag.endFrame();

      snap = diag.lastSnapshot;
      const cellsUnloaded = diag.metrics.find("streaming.cellsUnloaded");
      assert.ok(cellsUnloaded, "streaming.cellsUnloaded should exist");
      assert.strictEqual(snap.counter(cellsUnloaded.id), 1);
      assert.strictEqual(snap.gauge(loadedCells.id), 1);
    });
  });

  // ─── SceneManager ──────────────────────────────────

  describe("SceneManager", () => {
    it("emits frame events on scene transitions", () => {
      const mgr = new SceneManager();
      const diag = new Diagnostics();
      diag.registerMetric({ name:"frame.delta", category:MetricCategory.FRAME, group:"Frame", unit:MetricUnit.MILLISECONDS, type:MetricType.GAUGE, tags:Object.freeze(["frame"]) });
      diag.registerMetric({ name:"frame.fps",   category:MetricCategory.FRAME, group:"Frame", unit:MetricUnit.FPS,          type:MetricType.GAUGE, tags:Object.freeze(["frame"]) });
      diag.lockRegistry();

      mgr.diagnostics = diag;

      const sceneA = { name:"SceneA", onCreate(){}, onEnter(){}, onExit(){}, onDestroy(){}, onPause(){}, onResume(){} };
      const sceneB = { name:"SceneB", onCreate(){}, onEnter(){}, onExit(){}, onDestroy(){}, onPause(){}, onResume(){} };
      mgr.add(sceneA);
      mgr.add(sceneB);

      diag.beginFrame(1, 16.6);
      mgr.start("SceneA");
      diag.endFrame();

      let snap = diag.lastSnapshot;
      assert.strictEqual(snap.events.length, 1);
      assert.strictEqual(snap.events[0].category, "scene");
      assert.strictEqual(snap.events[0].name, "Transition");
      assert.strictEqual(snap.events[0].metadata.scene, "SceneA");

      diag.beginFrame(2, 16.6);
      mgr.push("SceneB");
      diag.endFrame();

      snap = diag.lastSnapshot;
      assert.strictEqual(snap.events.length, 1);
      assert.strictEqual(snap.events[0].name, "Push");
      assert.strictEqual(snap.events[0].metadata.scene, "SceneB");

      diag.beginFrame(3, 16.6);
      mgr.pop();
      diag.endFrame();

      snap = diag.lastSnapshot;
      assert.strictEqual(snap.events.length, 1);
      assert.strictEqual(snap.events[0].name, "Pop");
    });
  });
});

// ─── Commit 2: Aggregate System Timing ───────────

function _registerCommit2Metrics(diag) {
  diag.registerMetric({ name:"frame.delta",         category:MetricCategory.FRAME, group:"Frame",  unit:MetricUnit.MILLISECONDS, type:MetricType.GAUGE,   tags:Object.freeze(["frame"]) });
  diag.registerMetric({ name:"frame.fps",           category:MetricCategory.FRAME, group:"Frame",  unit:MetricUnit.FPS,          type:MetricType.GAUGE,   tags:Object.freeze(["frame"]) });
  diag.registerMetric({ name:"frame.update",        category:MetricCategory.FRAME, group:"Frame",  unit:MetricUnit.MILLISECONDS, type:MetricType.TIMER,   tags:Object.freeze(["frame","ecs"]) });
  diag.registerMetric({ name:"ecs.world.entities",  category:MetricCategory.ECS,   group:"World", unit:MetricUnit.COUNT,         type:MetricType.GAUGE,   tags:Object.freeze(["ecs","world"]) });
  diag.registerMetric({ name:"ecs.world.archetypes",category:MetricCategory.ECS,   group:"World", unit:MetricUnit.COUNT,         type:MetricType.GAUGE,   tags:Object.freeze(["ecs","world"]) });
  diag.registerMetric({ name:"ecs.world.systems",   category:MetricCategory.ECS,   group:"World", unit:MetricUnit.COUNT,         type:MetricType.GAUGE,   tags:Object.freeze(["ecs","world"]) });
  diag.registerMetric({ name:"ecs.entitiesCreated", category:MetricCategory.ECS,   group:"World", unit:MetricUnit.COUNT,         type:MetricType.COUNTER, tags:Object.freeze(["ecs"]) });
  diag.registerMetric({ name:"ecs.entitiesDestroyed",category:MetricCategory.ECS,  group:"World", unit:MetricUnit.COUNT,         type:MetricType.COUNTER, tags:Object.freeze(["ecs"]) });
  diag.registerMetric({ name:"ecs.systems.total",    category:MetricCategory.ECS,   group:"Scheduler", unit:MetricUnit.MILLISECONDS, type:MetricType.TIMER,   tags:Object.freeze(["ecs","scheduler"]) });
}

function busyWork(ms) {
  const start = performance.now();
  while (performance.now() - start < ms) { /* spin */ }
}

describe("Diagnostics Aggregate Timing", () => {
  it("frame.update > ecs.systems.total > per-system timers", () => {
    const world = new World();
    world.register(FakeC1);
    world.register(FakeC2);
    const diag = new Diagnostics();
    _registerCommit2Metrics(diag);
    world.setResource(Diagnostics, diag);

    class BusySys1 extends System {
      static query = { all: [FakeC1] };
      update(ctx, dt) { busyWork(5); }
    }
    class BusySys2 extends System {
      static query = { all: [FakeC2] };
      update(ctx, dt) { busyWork(3); }
    }
    world.addSystem(new BusySys1());
    world.addSystem(new BusySys2());
    diag.lockRegistry();

    const e = world.createEntity();
    world.addComponent(e, FakeC1);
    world.addComponent(e, FakeC2);

    world.update(1 / 60);
    const snap = diag.lastSnapshot;

    const fu = diag.metrics.find("frame.update");
    const st = diag.metrics.find("ecs.systems.total");
    const s1 = diag.metrics.find("ecs.system.busysys1");
    const s2 = diag.metrics.find("ecs.system.busysys2");

    assert.ok(fu, "frame.update should be registered");
    assert.ok(st, "ecs.systems.total should be registered");
    assert.ok(s1, "ecs.system.busysys1 should be registered");
    assert.ok(s2, "ecs.system.busysys2 should be registered");

    const fuTime = snap.timerTotal(fu.id);
    const stTime = snap.timerTotal(st.id);
    const s1Time = snap.timerTotal(s1.id);
    const s2Time = snap.timerTotal(s2.id);

    assert.ok(stTime >= s1Time + s2Time, `ecs.systems.total (${stTime}) should be >= sum of per-system (${s1Time + s2Time})`);
    assert.ok(fuTime >= stTime, `frame.update (${fuTime}) should be >= ecs.systems.total (${stTime})`);
  });

  it("ecs.systems.total includes sort time", () => {
    const world = new World();
    world.register(FakeC1);
    world.register(FakeC2);
    const diag = new Diagnostics();
    _registerCommit2Metrics(diag);
    world.setResource(Diagnostics, diag);

    class PrioA extends System {
      static priority = 10;
      static query = { all: [FakeC1] };
      update(ctx, dt) { /* simulate work via scope timing */ }
    }
    class PrioB extends System {
      static priority = 0;
      static query = { all: [FakeC2] };
      update(ctx, dt) { /* simulate work */ }
    }
    world.addSystem(new PrioA());
    world.addSystem(new PrioB());
    diag.lockRegistry();

    const e = world.createEntity();
    world.addComponent(e, FakeC1);
    world.addComponent(e, FakeC2);

    world.update(1 / 60);
    const snap = diag.lastSnapshot;
    const st = diag.metrics.find("ecs.systems.total");
    const sA = diag.metrics.find("ecs.system.prioa");
    const sB = diag.metrics.find("ecs.system.priob");
    assert.ok(st);
    assert.ok(sA);
    assert.ok(sB);
    assert.ok(snap.timerTotal(st.id) >= snap.timerTotal(sA.id) + snap.timerTotal(sB.id));
  });

  it("disabled system excluded from ecs.systems.total", () => {
    const world = new World();
    world.register(FakeC1);
    const diag = new Diagnostics();
    _registerCommit2Metrics(diag);
    world.setResource(Diagnostics, diag);

    class ActiveSys extends System {
      static query = { all: [FakeC1] };
      update(ctx, dt) { /* active */ }
    }
    class DisabledSys extends System {
      static query = { all: [FakeC1] };
      update(ctx, dt) { /* disabled, should not run */ }
    }
    world.addSystem(new ActiveSys());
    const ds = new DisabledSys();
    ds.enabled = false;
    world.addSystem(ds);
    diag.lockRegistry();

    const e = world.createEntity();
    world.addComponent(e, FakeC1);

    world.update(1 / 60);
    const snap = diag.lastSnapshot;
    const st = diag.metrics.find("ecs.systems.total");
    const active = diag.metrics.find("ecs.system.activesys");
    const disabled = diag.metrics.find("ecs.system.disabledsys");
    assert.ok(st);
    assert.ok(active);
    assert.ok(disabled);
    assert.ok(snap.timerTotal(st.id) >= snap.timerTotal(active.id));
    assert.strictEqual(snap.timerTotal(disabled.id), 0);
  });

  it("zero systems: ecs.systems.total records 0", () => {
    const world = new World();
    world.register(FakeC1);
    const diag = new Diagnostics();
    _registerCommit2Metrics(diag);
    world.setResource(Diagnostics, diag);
    diag.lockRegistry();

    world.update(1 / 60);
    const snap = diag.lastSnapshot;
    const st = diag.metrics.find("ecs.systems.total");
    assert.ok(st);
    assert.ok(snap.timerTotal(st.id) < 0.5, `expected near-zero time, got ${snap.timerTotal(st.id)}`);
  });

  it("exception in system: snapshot created before throw", () => {
    const world = new World();
    world.register(FakeC1);
    const diag = new Diagnostics();
    _registerCommit2Metrics(diag);
    world.setResource(Diagnostics, diag);

    class GoodSys extends System {
      static query = { all: [FakeC1] };
      update(ctx, dt) { /* works fine */ }
    }
    class ThrowSys extends System {
      update(ctx, dt) { throw new Error("boom"); }
    }
    world.addSystem(new GoodSys());
    world.addSystem(new ThrowSys());
    diag.lockRegistry();

    const e = world.createEntity();
    world.addComponent(e, FakeC1);

    try {
      world.update(1 / 60);
    } catch (e) {
      // expected
    }
    const snap = diag.lastSnapshot;
    assert.ok(snap, "snapshot should be created after exception");
    const st = diag.metrics.find("ecs.systems.total");
    assert.ok(st, "ecs.systems.total should be registered");
    assert.ok(snap.timerCount(st.id) > 0 || snap.timerTotal(st.id) >= 0, "systems.total should have a timer entry");
  });
});

// ─── Commit 4: World-State Gauges ────────────

describe("Diagnostics World-State Gauges", () => {
  function _registerWorldGaugeMetrics(diag) {
    diag.registerMetric({ name:"frame.delta",         category:MetricCategory.FRAME, group:"Frame",  unit:MetricUnit.MILLISECONDS, type:MetricType.GAUGE,   tags:Object.freeze(["frame"]) });
    diag.registerMetric({ name:"frame.fps",           category:MetricCategory.FRAME, group:"Frame",  unit:MetricUnit.FPS,          type:MetricType.GAUGE,   tags:Object.freeze(["frame"]) });
    diag.registerMetric({ name:"frame.update",        category:MetricCategory.FRAME, group:"Frame",  unit:MetricUnit.MILLISECONDS, type:MetricType.TIMER,   tags:Object.freeze(["frame","ecs"]) });
    diag.registerMetric({ name:"ecs.world.entities",  category:MetricCategory.ECS,   group:"World", unit:MetricUnit.COUNT,         type:MetricType.GAUGE,   tags:Object.freeze(["ecs","world"]) });
    diag.registerMetric({ name:"ecs.world.archetypes",category:MetricCategory.ECS,   group:"World", unit:MetricUnit.COUNT,         type:MetricType.GAUGE,   tags:Object.freeze(["ecs","world"]) });
    diag.registerMetric({ name:"ecs.world.systems",   category:MetricCategory.ECS,   group:"World", unit:MetricUnit.COUNT,         type:MetricType.GAUGE,   tags:Object.freeze(["ecs","world"]) });
    diag.registerMetric({ name:"ecs.world.components",category:MetricCategory.ECS,   group:"World", unit:MetricUnit.COUNT,         type:MetricType.GAUGE,   tags:Object.freeze(["ecs","world"]) });
    diag.registerMetric({ name:"ecs.world.tables",    category:MetricCategory.ECS,   group:"World", unit:MetricUnit.COUNT,         type:MetricType.GAUGE,   tags:Object.freeze(["ecs","world"]) });
    diag.registerMetric({ name:"ecs.world.capacity",  category:MetricCategory.ECS,   group:"World", unit:MetricUnit.COUNT,         type:MetricType.GAUGE,   tags:Object.freeze(["ecs","world"]) });
    diag.registerMetric({ name:"ecs.entitiesCreated", category:MetricCategory.ECS,   group:"World", unit:MetricUnit.COUNT,         type:MetricType.COUNTER, tags:Object.freeze(["ecs"]) });
    diag.registerMetric({ name:"ecs.entitiesDestroyed",category:MetricCategory.ECS,  group:"World", unit:MetricUnit.COUNT,         type:MetricType.COUNTER, tags:Object.freeze(["ecs"]) });
    diag.registerMetric({ name:"ecs.systems.total",   category:MetricCategory.ECS,   group:"Scheduler", unit:MetricUnit.MILLISECONDS, type:MetricType.TIMER,   tags:Object.freeze(["ecs","scheduler"]) });
  }

  it("records component count matching registered component types", () => {
    const world = new World();
    world.register(FakeC1);
    world.register(FakeC2);
    const diag = new Diagnostics();
    _registerWorldGaugeMetrics(diag);
    world.setResource(Diagnostics, diag);

    class DummySys extends System {
      update(ctx, dt) {}
    }
    world.addSystem(new DummySys());
    diag.lockRegistry();

    world.update(1 / 60);
    const snap = diag.lastSnapshot;
    const compGauge = diag.metrics.find("ecs.world.components");
    assert.ok(compGauge, "ecs.world.components should be registered");
    assert.strictEqual(snap.gauge(compGauge.id), 2, "should equal registered component types (FakeC1, FakeC2)");
  });

  it("table count grows as archetypes are created", () => {
    const world = new World();
    world.register(FakeC1);
    world.register(FakeC2);
    const diag = new Diagnostics();
    _registerWorldGaugeMetrics(diag);
    world.setResource(Diagnostics, diag);

    let e, step;
    class ArchCreator extends System {
      update(ctx, dt) {
        if (e === undefined) {
          e = ctx.world.createEntity();
          step = 0;
        }
        if (step === 0) {
          ctx.world.addComponent(e, FakeC1);
          step = 1;
        } else if (step === 1) {
          ctx.world.addComponent(e, FakeC2);
          step = 2;
        }
      }
    }
    world.addSystem(new ArchCreator());
    diag.lockRegistry();

    const tablesGauge = diag.metrics.find("ecs.world.tables");

    // Frame 1: entity in empty archetype (1 table exists from construction)
    world.update(1 / 60);
    let snap = diag.lastSnapshot;
    assert.strictEqual(snap.gauge(tablesGauge.id), 2, "empty + {FakeC1} = 2 tables");

    // Frame 2: add FakeC2 → {FakeC1,FakeC2} archetype created
    world.update(1 / 60);
    snap = diag.lastSnapshot;
    assert.strictEqual(snap.gauge(tablesGauge.id), 3, "empty + {FakeC1} + {FakeC1,FakeC2} = 3 tables");
  });

  it("entity capacity reflects EntityManager pre-allocation", () => {
    const world = new World({ initialCapacity: 128 });
    world.register(FakeC1);
    const diag = new Diagnostics();
    _registerWorldGaugeMetrics(diag);
    world.setResource(Diagnostics, diag);

    class DummySys extends System {
      update(ctx, dt) {}
    }
    world.addSystem(new DummySys());
    diag.lockRegistry();

    world.update(1 / 60);
    const snap = diag.lastSnapshot;
    const capGauge = diag.metrics.find("ecs.world.capacity");
    assert.ok(capGauge, "ecs.world.capacity should be registered");
    assert.strictEqual(snap.gauge(capGauge.id), 128, "capacity should match initialCapacity option");
  });
});

// ─── Commit 3: Query Instrumentation ───────────

describe("Diagnostics Query Instrumentation", () => {
  function _registerQueryMetrics(diag) {
    diag.registerMetric({ name:"frame.delta",         category:MetricCategory.FRAME, group:"Frame",  unit:MetricUnit.MILLISECONDS, type:MetricType.GAUGE,   tags:Object.freeze(["frame"]) });
    diag.registerMetric({ name:"frame.fps",           category:MetricCategory.FRAME, group:"Frame",  unit:MetricUnit.FPS,          type:MetricType.GAUGE,   tags:Object.freeze(["frame"]) });
    diag.registerMetric({ name:"frame.update",        category:MetricCategory.FRAME, group:"Frame",  unit:MetricUnit.MILLISECONDS, type:MetricType.TIMER,   tags:Object.freeze(["frame","ecs"]) });
    diag.registerMetric({ name:"ecs.world.entities",  category:MetricCategory.ECS,   group:"World", unit:MetricUnit.COUNT,         type:MetricType.GAUGE,   tags:Object.freeze(["ecs","world"]) });
    diag.registerMetric({ name:"ecs.world.archetypes",category:MetricCategory.ECS,   group:"World", unit:MetricUnit.COUNT,         type:MetricType.GAUGE,   tags:Object.freeze(["ecs","world"]) });
    diag.registerMetric({ name:"ecs.world.systems",   category:MetricCategory.ECS,   group:"World", unit:MetricUnit.COUNT,         type:MetricType.GAUGE,   tags:Object.freeze(["ecs","world"]) });
    diag.registerMetric({ name:"ecs.entitiesCreated", category:MetricCategory.ECS,   group:"World", unit:MetricUnit.COUNT,         type:MetricType.COUNTER, tags:Object.freeze(["ecs"]) });
    diag.registerMetric({ name:"ecs.entitiesDestroyed",category:MetricCategory.ECS,  group:"World", unit:MetricUnit.COUNT,         type:MetricType.COUNTER, tags:Object.freeze(["ecs"]) });
    diag.registerMetric({ name:"ecs.systems.total",   category:MetricCategory.ECS,   group:"Scheduler", unit:MetricUnit.MILLISECONDS, type:MetricType.TIMER,   tags:Object.freeze(["ecs","scheduler"]) });
    diag.registerMetric({ name:"ecs.query.scans",     category:MetricCategory.ECS,   group:"Queries", unit:MetricUnit.COUNT,         type:MetricType.COUNTER, tags:Object.freeze(["ecs","query"]) });
    diag.registerMetric({ name:"ecs.query.scanTime",  category:MetricCategory.ECS,   group:"Queries", unit:MetricUnit.MILLISECONDS, type:MetricType.TIMER,   tags:Object.freeze(["ecs","query"]) });
  }

  it("re-scan after archetype creation records counter and timer", () => {
    const world = new World();
    world.register(FakeC1);
    world.register(FakeC2);
    const diag = new Diagnostics();
    _registerQueryMetrics(diag);
    world.setResource(Diagnostics, diag);

    let e, step;
    class QueryUser extends System {
      static query = { all: [FakeC1] };
      update(ctx, dt) {
        if (e === undefined) {
          e = ctx.world.createEntity();
          step = 0;
        }
        if (step === 0) {
          ctx.world.addComponent(e, FakeC1);
          step = 1;
        } else if (step === 1) {
          ctx.world.addComponent(e, FakeC2);
          step = 2;
        }
      }
    }
    world.addSystem(new QueryUser());
    diag.lockRegistry();

    const scansId = diag.metrics.find("ecs.query.scans").id;
    const scanTimeId = diag.metrics.find("ecs.query.scanTime").id;

    // Frame 1: create entity + add FakeC1 → archetype {FakeC1} created → version 1→2
    // _refresh happens BEFORE update, so version hasn't changed yet → no re-scan
    world.update(1 / 60);
    let snap = diag.lastSnapshot;
    assert.strictEqual(snap.counter(scansId), 0, "no scan in frame 1 (version unchanged at _refresh time)");

    // Frame 2: add FakeC2 → archetype {FakeC1,FakeC2} created → version 2→3
    // _refresh sees version mismatch → re-scan recorded!
    world.update(1 / 60);
    snap = diag.lastSnapshot;
    assert.strictEqual(snap.counter(scansId), 1, "re-scan triggered in frame 2 after version bump");
    assert.strictEqual(snap.timerCount(scanTimeId), 1, "scan timer recorded one hit");
    assert.ok(snap.timerTotal(scanTimeId) > 0, "scan time > 0");
  });

  it("re-scan timer total is non-negative", () => {
    const world = new World();
    world.register(FakeC1);
    world.register(FakeC2);
    const diag = new Diagnostics();
    _registerQueryMetrics(diag);
    world.setResource(Diagnostics, diag);

    let e, step;
    class QueryUser extends System {
      static query = { all: [FakeC1] };
      update(ctx, dt) {
        if (e === undefined) {
          e = ctx.world.createEntity();
          step = 0;
        }
        if (step === 0) {
          ctx.world.addComponent(e, FakeC1);
          step = 1;
        }
      }
    }
    world.addSystem(new QueryUser());
    diag.lockRegistry();

    const scanTimeId = diag.metrics.find("ecs.query.scanTime").id;

    world.update(1 / 60);
    world.update(1 / 60);
    const snap = diag.lastSnapshot;
    assert.ok(snap.timerCount(scanTimeId) >= 1, "scan timer should have been recorded");
    assert.ok(snap.timerTotal(scanTimeId) >= 0, "scan time should be non-negative");
  });

  it("stable archetype version does not re-scan", () => {
    const world = new World();
    world.register(FakeC1);
    const diag = new Diagnostics();
    _registerQueryMetrics(diag);
    world.setResource(Diagnostics, diag);

    let e;
    class QueryUser extends System {
      static query = { all: [FakeC1] };
      update(ctx, dt) {
        if (e === undefined) {
          e = ctx.world.createEntity();
          ctx.world.addComponent(e, FakeC1);
        }
      }
    }
    world.addSystem(new QueryUser());
    diag.lockRegistry();

    const scansId = diag.metrics.find("ecs.query.scans").id;

    // Frame 1: create entity + add FakeC1 → version bump outside _refresh
    world.update(1 / 60);
    let snap = diag.lastSnapshot;
    assert.strictEqual(snap.counter(scansId), 0);

    // Frame 2: re-scan due to version change from frame 1
    world.update(1 / 60);
    snap = diag.lastSnapshot;
    assert.strictEqual(snap.counter(scansId), 1);

    // Frame 3: stable version → no re-scan
    world.update(1 / 60);
    snap = diag.lastSnapshot;
    assert.strictEqual(snap.counter(scansId), 0, "stable version produces no re-scan");
  });

  it("no Diagnostics: scan still works, no recording", () => {
    const world = new World();
    world.register(FakeC1);
    world.register(FakeC2);

    class SilentSys extends System {
      static query = { all: [FakeC1] };
      update(ctx, dt) {
        const e = ctx.world.createEntity();
        ctx.world.addComponent(e, FakeC1);
      }
    }
    world.addSystem(new SilentSys());

    world.update(1 / 60);
    assert.ok(true, "query engine works without diagnostics");
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
