export class SelectionManager {
  constructor() {
    this._selectedMetricId = null;
    this._selectedFrameIndex = -1;
    this._selectedCaptureId = null;
    this._selectedPanelId = null;
    this._hoveredMetricId = null;
    this._listeners = new Map();
  }

  get selectedMetricId() { return this._selectedMetricId; }
  get selectedFrameIndex() { return this._selectedFrameIndex; }
  get selectedCaptureId() { return this._selectedCaptureId; }
  get selectedPanelId() { return this._selectedPanelId; }
  get hoveredMetricId() { return this._hoveredMetricId; }

  selectMetric(id) {
    this._selectedMetricId = id;
    this._emit("change:metric", id);
  }

  selectFrame(index) {
    this._selectedFrameIndex = index;
    this._emit("change:frame", index);
  }

  selectCapture(id) {
    this._selectedCaptureId = id;
    this._emit("change:capture", id);
  }

  selectPanel(id) {
    this._selectedPanelId = id;
    this._emit("change:panel", id);
  }

  hoverMetric(id) {
    this._hoveredMetricId = id;
  }

  reset() {
    this._selectedMetricId = null;
    this._selectedFrameIndex = -1;
    this._selectedCaptureId = null;
    this._selectedPanelId = null;
    this._hoveredMetricId = null;
    this._emit("change:reset");
  }

  on(event, cb) {
    if (!this._listeners.has(event)) this._listeners.set(event, []);
    this._listeners.get(event).push(cb);
    return () => this.off(event, cb);
  }

  off(event, cb) {
    const arr = this._listeners.get(event);
    if (!arr) return;
    const idx = arr.indexOf(cb);
    if (idx >= 0) arr.splice(idx, 1);
  }

  _emit(event, data) {
    const arr = this._listeners.get(event);
    if (arr) arr.slice().forEach(cb => cb(data));
  }
}
