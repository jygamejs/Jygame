function nextPow2(n) {
  if (n <= 0) return 1;
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

export class FrameStorage {
  constructor(metricCount) {
    const capacity = metricCount > 0 ? nextPow2(metricCount) : 16;
    this._buffer = null;
    this._capacity = 0;
    this.timerTotals = null;
    this.timerMins = null;
    this.timerMaxs = null;
    this.timerCounts = null;
    this.counters = null;
    this.gauges = null;
    this._allocate(capacity);
  }

  _allocate(capacity) {
    const float64Size = capacity * 8;
    const uint32Size = capacity * 4;
    const totalBytes = float64Size * 4 + uint32Size * 2;
    this._buffer = new ArrayBuffer(totalBytes);
    this._capacity = capacity;

    let offset = 0;
    this.timerTotals = new Float64Array(this._buffer, offset, capacity); offset += float64Size;
    this.timerMins   = new Float64Array(this._buffer, offset, capacity); offset += float64Size;
    this.timerMaxs   = new Float64Array(this._buffer, offset, capacity); offset += float64Size;
    this.gauges      = new Float64Array(this._buffer, offset, capacity); offset += float64Size;
    this.timerCounts = new Uint32Array(this._buffer, offset, capacity); offset += uint32Size;
    this.counters    = new Uint32Array(this._buffer, offset, capacity);
    this._clear();
  }

  _clear() {
    this.timerTotals.fill(0);
    this.timerMins.fill(Infinity);
    this.timerMaxs.fill(-Infinity);
    this.timerCounts.fill(0);
    this.counters.fill(0);
    this.gauges.fill(0);
  }

  ensureCapacity(minCapacity) {
    if (minCapacity <= this._capacity) return;
    const newCapacity = nextPow2(minCapacity);
    const oldTotals = this.timerTotals ? new Float64Array(this.timerTotals) : null;
    const oldMins = this.timerMins ? new Float64Array(this.timerMins) : null;
    const oldMaxs = this.timerMaxs ? new Float64Array(this.timerMaxs) : null;
    const oldCounts = this.timerCounts ? new Uint32Array(this.timerCounts) : null;
    const oldCounters = this.counters ? new Uint32Array(this.counters) : null;
    const oldGauges = this.gauges ? new Float64Array(this.gauges) : null;

    this._allocate(newCapacity);

    if (oldTotals) {
      const len = oldTotals.length;
      this.timerTotals.set(oldTotals);
      this.timerMins.set(oldMins);
      this.timerMaxs.set(oldMaxs);
      this.timerCounts.set(oldCounts);
      this.counters.set(oldCounters);
      this.gauges.set(oldGauges);
    }
  }

  reset() {
    this._clear();
  }

  get capacity() {
    return this._capacity;
  }

  cloneBuffer() {
    return this._buffer.slice(0);
  }
}
