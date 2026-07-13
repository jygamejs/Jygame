export class FrameSnapshot {
  constructor(data) {
    this.frame = data.frame;
    this.timestamp = data.timestamp;
    this.delta = data.delta;
    this.fps = data.fps;
    this.registryVer = data.registryVer;
    this.metricCount = data.metricCount;
    this.timerTotals = data.timerTotals;
    this.timerCounts = data.timerCounts;
    this.timerMins = data.timerMins;
    this.timerMaxs = data.timerMaxs;
    this.counters = data.counters;
    this.gauges = data.gauges;
    this.events = data.events;
    this.metadata = data.metadata;

    Object.freeze(this);
  }

  timerTotal(id)  { return this.timerTotals[id]; }
  timerCount(id)  { return this.timerCounts[id]; }
  timerMin(id)    { return this.timerMins[id]; }
  timerMax(id)    { return this.timerMaxs[id]; }
  counter(id)     { return this.counters[id]; }
  gauge(id)       { return this.gauges[id]; }

  toJSON() {
    return {
      f: this.frame,
      ts: this.timestamp,
      d: this.delta,
      fps: this.fps,
      rv: this.registryVer,
      mc: this.metricCount,
      tt: Array.from(this.timerTotals),
      tn: Array.from(this.timerMins),
      tx: Array.from(this.timerMaxs),
      tc: Array.from(this.timerCounts),
      c: Array.from(this.counters),
      g: Array.from(this.gauges),
      e: this.events,
      m: this.metadata,
    };
  }

  static fromJSON(data) {
    return new FrameSnapshot({
      frame: data.f,
      timestamp: data.ts,
      delta: data.d,
      fps: data.fps,
      registryVer: data.rv,
      metricCount: data.mc,
      timerTotals: new Float64Array(data.tt),
      timerMins: new Float64Array(data.tn),
      timerMaxs: new Float64Array(data.tx),
      timerCounts: new Uint32Array(data.tc),
      counters: new Uint32Array(data.c),
      gauges: new Float64Array(data.g),
      events: data.e,
      metadata: data.m,
    });
  }
}
