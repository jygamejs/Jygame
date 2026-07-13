export class CPUTimer {
  constructor(diagnostics, metricId) {
    this._diagnostics = diagnostics;
    this._metricId = metricId;
    this._running = false;
    this._startTime = 0;
  }

  start() {
    if (this._running) {
      if (typeof process !== "undefined" && process.env.NODE_ENV !== "production") {
        throw new Error("CPUTimer.start() called while timer is already running.");
      }
    }
    this._running = true;
    this._startTime = performance.now();
  }

  stop() {
    if (!this._running) return;
    this._running = false;
    const elapsed = performance.now() - this._startTime;
    this._diagnostics.recordTimer(this._metricId, elapsed);
  }

  discard() {
    this._running = false;
  }
}
