import { MetricType } from "./MetricType.js";

export class Analysis {
  constructor(history, registry) {
    this._history = history;
    this._registry = registry;
    this._custom = new Map();
  }

  latest(metricName) {
    const snap = this._history.latest();
    if (!snap) return 0;
    const id = this._resolveId(metricName);
    if (id < 0) return 0;
    return this._readValue(snap, id);
  }

  percent(numerator, denominator) {
    const snap = this._history.latest();
    if (!snap) return 0;
    const n = this._resolveId(numerator);
    const d = this._resolveId(denominator);
    if (n < 0 || d < 0) return 0;
    const dv = this._readValue(snap, d);
    if (dv <= 0) return 0;
    return (this._readValue(snap, n) / dv) * 100;
  }

  average(metricName, window = 60) {
    const id = this._resolveId(metricName);
    if (id < 0) return 0;
    let sum = 0, n = 0;
    const limit = Math.min(window, this._history.count);
    for (let i = limit - 1; i >= 0; i--) {
      const snap = this._history.at(i);
      if (snap) {
        sum += this._readValue(snap, id);
        n++;
      }
    }
    return n > 0 ? sum / n : 0;
  }

  max(metricName, window = 60) {
    const id = this._resolveId(metricName);
    if (id < 0) return 0;
    let result = -Infinity;
    const limit = Math.min(window, this._history.count);
    for (let i = limit - 1; i >= 0; i--) {
      const snap = this._history.at(i);
      if (snap) {
        result = Math.max(result, this._readValue(snap, id));
      }
    }
    return result === -Infinity ? 0 : result;
  }

  min(metricName, window = 60) {
    const id = this._resolveId(metricName);
    if (id < 0) return 0;
    let result = Infinity;
    const limit = Math.min(window, this._history.count);
    for (let i = limit - 1; i >= 0; i--) {
      const snap = this._history.at(i);
      if (snap) {
        result = Math.min(result, this._readValue(snap, id));
      }
    }
    return result === Infinity ? 0 : result;
  }

  stddev(metricName, window = 60) {
    const id = this._resolveId(metricName);
    if (id < 0) return 0;
    const values = [];
    const limit = Math.min(window, this._history.count);
    for (let i = limit - 1; i >= 0; i--) {
      const snap = this._history.at(i);
      if (snap) values.push(this._readValue(snap, id));
    }
    if (values.length < 2) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const sqDiff = values.reduce((sum, v) => sum + (v - mean) ** 2, 0);
    return Math.sqrt(sqDiff / (values.length - 1));
  }

  register(name, { compute, format }) {
    this._custom.set(name, { compute, format });
  }

  resolve(name) {
    if (this._custom.has(name)) {
      const c = this._custom.get(name);
      const value = c.compute(this);
      return c.format ? c.format(value) : value;
    }
    return this.latest(name);
  }

  _resolveId(name) {
    const m = this._registry.find(name);
    return m ? m.id : -1;
  }

  _readValue(snap, id) {
    const desc = this._registry.get(id);
    if (!desc) return 0;
    if (desc.type === MetricType.TIMER) return snap.timerTotal(id);
    if (desc.type === MetricType.GAUGE) return snap.gauge(id);
    if (desc.type === MetricType.COUNTER) return snap.counter(id);
    return 0;
  }
}
