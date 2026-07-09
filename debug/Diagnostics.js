import { DiagnosticsConfig } from "./DiagnosticsConfig.js";
import { MetricRegistry } from "./MetricRegistry.js";
import { CPUTimer } from "./CPUTimer.js";
import { FrameStorage } from "./FrameStorage.js";
import { FrameSnapshot } from "./FrameSnapshot.js";
import { FrameEvent } from "./FrameEvent.js";
import { FrameHistory } from "./FrameHistory.js";
import { TriggerCondition } from "./TriggerCondition.js";
import { CaptureResult } from "./CaptureResult.js";

export class Diagnostics {
  constructor(options = {}) {
    this.config = new DiagnosticsConfig(options);
    this._metrics = new MetricRegistry();
    this._storage = new FrameStorage(this._metrics.count || 16);
    this._history = new FrameHistory(this.config.historySize);
    this._timers = new Map();
    this._metadata = {};
    this._events = [];

    this._frame = 0;
    this._delta = 0;
    this._fps = 0;
    this._insideFrame = false;
    this._active = false;
    this._triggers = [];
    this._cooldownRemaining = 0;
    this._captureRemaining = 0;
    this._captureBuffer = null;
    this._captureCallbacks = [];
  }

  // ─── Metric registry ────────────────────────────────

  get metrics() {
    return this._metrics;
  }

  registerMetric(descriptor) {
    const id = this._metrics.register(descriptor);
    this._storage.ensureCapacity(this._metrics.count);
    return id;
  }

  registerDynamicMetric(descriptor) {
    const id = this._metrics.register(descriptor, true);
    this._storage.ensureCapacity(this._metrics.count);
    return id;
  }

  lockRegistry() {
    this._metrics.lock();
  }

  // ─── Frame lifecycle ────────────────────────────────

  beginFrame(frameNumber, realDtMs) {
    if (!this.config.enabled) return;
    if (this.config.samplingRate > 1 && (frameNumber % this.config.samplingRate) !== 0) return;

    this._active = true;
    this._insideFrame = true;
    this._frame = frameNumber;
    this._delta = realDtMs;
    this._fps = realDtMs > 0 ? 1000 / realDtMs : 0;
    this._events = [];
  }

  endFrame() {
    if (!this._insideFrame) return;
    this._insideFrame = false;

    if (!this._active) return;
    this._active = false;

    const count = this._metrics.count;
    const cap = this._storage.capacity;
    const buf = this._storage.cloneBuffer();

    const snapshot = new FrameSnapshot({
      frame: this._frame,
      timestamp: performance.now(),
      delta: this._delta,
      fps: this._fps,
      registryVer: this._metrics.version,
      metricCount: count,
      timerTotals: new Float64Array(buf, 0, count),
      timerMins:   new Float64Array(buf, cap * 8, count),
      timerMaxs:   new Float64Array(buf, cap * 16, count),
      gauges:      new Float64Array(buf, cap * 24, count),
      timerCounts: new Uint32Array(buf, cap * 32, count),
      counters:    new Uint32Array(buf, cap * 32 + cap * 4, count),
      events: this._events ? [...this._events] : [],
      metadata: { ...this._metadata },
    });

    this._history.push(snapshot);

    if (this.config.autoReset) {
      this._resetAccumulators();
    }

    this._evaluateTriggers(snapshot);
  }

  _resetAccumulators() {
    this._storage.reset();
  }

  // ─── Recording ──────────────────────────────────────

  recordTimer(metricId, elapsedMs) {
    if (!this._active) return;
    if (metricId < 0 || metricId >= this._metrics.count) return;
    if (!this.config.allGroupsEnabled && !this.config.isCategoryEnabled(this._metrics.getCategory(metricId))) return;
    this._storage.timerTotals[metricId] += elapsedMs;
    this._storage.timerCounts[metricId] += 1;
    if (elapsedMs < this._storage.timerMins[metricId]) {
      this._storage.timerMins[metricId] = elapsedMs;
    }
    if (elapsedMs > this._storage.timerMaxs[metricId]) {
      this._storage.timerMaxs[metricId] = elapsedMs;
    }
  }

  recordCounter(metricId, incrementBy = 1) {
    if (!this._active) return;
    if (metricId < 0 || metricId >= this._metrics.count) return;
    if (!this.config.allGroupsEnabled && !this.config.isCategoryEnabled(this._metrics.getCategory(metricId))) return;
    this._storage.counters[metricId] += incrementBy;
  }

  recordGauge(metricId, value) {
    if (!this._active) return;
    if (metricId < 0 || metricId >= this._metrics.count) return;
    if (!this.config.allGroupsEnabled && !this.config.isCategoryEnabled(this._metrics.getCategory(metricId))) return;
    this._storage.gauges[metricId] = value;
  }

  // ─── Metadata ───────────────────────────────────────

  setMetadata(key, value) {
    this._metadata[key] = value;
  }

  getMetadata(key) {
    return this._metadata[key];
  }

  clearMetadata() {
    this._metadata = {};
  }

  // ─── Events ─────────────────────────────────────────

  event(category, name, metadata = null) {
    if (!this._insideFrame) return;
    this._events.push(new FrameEvent(this._frame, performance.now(), category, name, metadata));
  }

  // ─── Timers ─────────────────────────────────────────

  timer(metricId) {
    let t = this._timers.get(metricId);
    if (!t) {
      t = new CPUTimer(this, metricId);
      this._timers.set(metricId, t);
    }
    return t;
  }

  scope(metricId, fn) {
    const timer = this.timer(metricId);
    timer.start();
    try {
      return fn();
    } finally {
      timer.stop();
    }
  }

  // ─── Triggers ────────────────────────────────────────

  addTrigger(config) {
    const trigger = new TriggerCondition(config);
    trigger.resolve(this._metrics);
    this._triggers.push(trigger);
    return trigger;
  }

  removeTrigger(trigger) {
    const idx = this._triggers.indexOf(trigger);
    if (idx !== -1) this._triggers.splice(idx, 1);
  }

  onCapture(callback) {
    this._captureCallbacks.push(callback);
  }

  _evaluateTriggers(snapshot) {
    if (this._cooldownRemaining > 0) {
      this._cooldownRemaining--;
      return;
    }

    if (this._captureRemaining > 0) {
      this._captureBuffer.push(snapshot);
      this._captureRemaining--;
      if (this._captureRemaining === 0) {
        this._emitCapture(this._captureBuffer);
        this._captureBuffer = null;
      }
      return;
    }

    for (let i = 0; i < this._triggers.length; i++) {
      const trigger = this._triggers[i];
      if (trigger.evaluate(snapshot)) {
        const preCount = Math.min(trigger.preFrames, this._history.count - 1);
        const preSnapshots = [];
        for (let j = preCount; j > 0; j--) {
          preSnapshots.push(this._history.at(j));
        }
        preSnapshots.reverse();
        this._captureBuffer = [snapshot];
        this._captureRemaining = trigger.postFrames;
        this._cooldownRemaining = trigger.cooldown;
        break;
      }
    }
  }

  _emitCapture(captureBuffer) {
    const result = new CaptureResult({
      name: "triggered",
      timestamp: performance.now(),
      preFrames: captureBuffer.length - this._captureRemaining - 1,
      postFrames: this._captureRemaining,
      snapshots: captureBuffer,
      registry: this._metrics,
    });
    for (let i = 0; i < this._captureCallbacks.length; i++) {
      this._captureCallbacks[i](result);
    }
  }

  // ─── Export / Import ────────────────────────────────

  toJSON({ snapshots = true, registry = true, meta = true } = {}) {
    const result = { version: 1 };

    if (meta) {
      result.meta = {
        timestamp: performance.now(),
        frames: this._history.count,
        engine: "jygame",
      };
      if (this._history.count > 0) {
        const first = this._history.at(this._history.count - 1);
        const last = this._history.at(0);
        if (first && last) {
          result.meta.duration = last.timestamp - first.timestamp;
        }
      }
    }

    if (registry) {
      const metrics = [];
      this._metrics.forEach(d => {
        const entry = { id: d.id, name: d.name, category: d.category, type: d.type, displayName: d.displayName, unit: d.unit, group: d.group };
        if (d.budget !== undefined) entry.budget = d.budget;
        if (d.format !== undefined) entry.format = d.format;
        if (d.description) entry.description = d.description;
        metrics.push(entry);
      });
      result.registry = { version: this._metrics.version, metrics };
    }

    if (snapshots) {
      result.snapshots = [];
      for (let i = this._history.count - 1; i >= 0; i--) {
        const snap = this._history.at(i);
        if (snap) result.snapshots.push(snap.toJSON());
      }
    }

    return result;
  }

  exportSession() {
    return JSON.stringify(this.toJSON());
  }

  exportCapture(captureResult) {
    const data = {
      version: 1,
      meta: {
        timestamp: captureResult.timestamp,
        name: captureResult.name,
        frames: captureResult.snapshots.length,
        engine: "jygame",
      },
      snapshots: captureResult.snapshots.map(s => s.toJSON()),
    };
    return JSON.stringify(data);
  }

  static importSession(json) {
    const data = typeof json === "string" ? JSON.parse(json) : json;
    if (data.version !== 1) throw new Error(`Unsupported export version: ${data.version}`);

    const diag = new Diagnostics();
    if (data.registry) {
      for (const m of data.registry.metrics) {
        diag.registerMetric(m);
      }
      diag.lockRegistry();
    }
    return diag;
  }

  // ─── Read access ────────────────────────────────────

  get isInsideFrame() {
    return this._insideFrame;
  }

  get lastSnapshot() {
    return this._history.latest();
  }

  get history() {
    return this._history;
  }

  // ─── Session control ────────────────────────────────

  reset() {
    this._history.reset();
    this._storage.reset();
    this._events = [];
    this._frame = 0;
    this._metadata = {};
    this._active = false;
    this._insideFrame = false;
    this._triggers = [];
    this._cooldownRemaining = 0;
    this._captureRemaining = 0;
    this._captureBuffer = null;
  }
}
