function _wrapDiag(diag) {
  if (!diag || diag.__wrapped) return diag;
  return {
    ...diag,
    __wrapped: true,
    timerTotal: (id) => diag.timerTotals?.[id] ?? 0,
    gauge: (id) => diag.gauges?.[id] ?? 0,
    counter: (id) => diag.counters?.[id] ?? 0,
  };
}

export class WorkspaceSnapshotStore {
  constructor(maxSize = 300) {
    this._snapshots = [];
    this._maxSize = maxSize;
    this._descriptorMap = new Map();
    this._latestValues = new Map();

    this.analysis = {
      latest: (name) => this._latestValues.get(name) ?? 0,
      average: (name, window = 60) => this._average(name, window),
      max: (name, window = 60) => this._max(name, window),
    };

    this.registry = {
      forEach: (fn) => this._descriptorMap.forEach((desc) => fn(desc)),
      find: (name) => this._descriptorMap.get(name) || null,
    };

    const self = this;
    this.history = {
      get count() { return self._snapshots.length; },
      frames: () => self._frames(),
      at: (index) => self._at(index),
      latest: () => self._at(0),
      window: (name, length) => self._window(name, length),
    };
  }

  ingest(snapshot) {
    this._snapshots.push(snapshot);
    if (this._snapshots.length > this._maxSize) this._snapshots.shift();

    const descriptors = snapshot.metricDescriptors;
    if (descriptors) {
      for (const desc of descriptors) {
        if (!this._descriptorMap.has(desc.name)) {
          this._descriptorMap.set(desc.name, desc);
        }
      }
    }

    const diag = snapshot.diagnostics;
    if (diag) {
      this._descriptorMap.forEach((desc) => {
        this._latestValues.set(desc.name, this._readDiagValue(diag, desc));
      });
    }
  }

  _readDiagValue(diag, desc) {
    if (desc.type === 0) return diag.timerTotals?.[desc.id] ?? 0;
    if (desc.type === 1) return diag.counters?.[desc.id] ?? 0;
    if (desc.type === 2) return diag.gauges?.[desc.id] ?? 0;
    return 0;
  }

  _frames() {
    const snapshots = this._snapshots;
    const wrap = _wrapDiag;
    return {
      [Symbol.iterator]: function* () {
        for (let i = snapshots.length - 1; i >= 0; i--) {
          const diag = snapshots[i].diagnostics;
          if (diag) yield wrap(diag);
        }
      },
    };
  }

  _at(index) {
    const len = this._snapshots.length;
    if (index < 0 || index >= len) return null;
    const snap = this._snapshots[len - 1 - index];
    if (!snap || !snap.diagnostics) return null;
    return _wrapDiag(snap.diagnostics);
  }

  _average(name, windowSize) {
    const values = this._window(name, windowSize);
    if (values.length === 0) return 0;
    let sum = 0;
    for (const v of values) sum += v;
    return sum / values.length;
  }

  _max(name, windowSize) {
    const values = this._window(name, windowSize);
    if (values.length === 0) return 0;
    let max = -Infinity;
    for (const v of values) {
      if (v > max) max = v;
    }
    return max === -Infinity ? 0 : max;
  }

  _window(name, length) {
    const values = [];
    const desc = this._descriptorMap.get(name);
    if (!desc) return values;
    const start = Math.max(0, this._snapshots.length - length);
    for (let i = start; i < this._snapshots.length; i++) {
      const diag = this._snapshots[i].diagnostics;
      values.push(diag ? this._readDiagValue(diag, desc) : 0);
    }
    return values;
  }
}
