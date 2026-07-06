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
}
