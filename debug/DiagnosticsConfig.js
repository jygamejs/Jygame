export class DiagnosticsConfig {
  constructor(options = {}) {
    this.enabled = options.enabled ?? true;
    this.historySize = options.historySize ?? 300;
    this.autoReset = options.autoReset ?? true;
    this.samplingRate = options.samplingRate ?? 1;
  }
}
