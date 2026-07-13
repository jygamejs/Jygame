export class TriggerCondition {
  constructor(config) {
    this.name = config.name ?? `trigger:${config.metric}:${config.operator}:${config.threshold}`;
    this.metricName = config.metric;
    this.type = config.type;
    this.operator = config.operator;
    this.threshold = config.threshold;
    this.preFrames = config.preFrames ?? 100;
    this.postFrames = config.postFrames ?? 300;
    this.cooldown = config.cooldown ?? 500;
    this._metricId = -1;
  }

  resolve(registry) {
    const m = registry.find(this.metricName);
    this._metricId = m ? m.id : -1;
  }

  evaluate(snapshot) {
    if (this._metricId < 0) return false;
    let value;
    if (this.type === 0) value = snapshot.timerTotal(this._metricId);
    else if (this.type === 2) value = snapshot.gauge(this._metricId);
    else value = snapshot.counter(this._metricId);

    switch (this.operator) {
      case ">":  return value > this.threshold;
      case "<":  return value < this.threshold;
      case ">=": return value >= this.threshold;
      case "<=": return value <= this.threshold;
      case "==": return value === this.threshold;
      default:   return false;
    }
  }
}
