import { LoadingTask } from "../core/LoadingTask.js";
import { Diagnostics, MetricCategory, MetricUnit, MetricType }
  from "../debug/index.js";

let _diagnostics = null;
let _diagnosticsInitDone = false;
let _pendingCount = 0;
let _diagFontsId, _diagLoadedId, _diagPendingId, _diagLoadErrorsId;

function _initFontDiag(diag) {
  if (_diagnosticsInitDone) return;
  _diagnosticsInitDone = true;
  _diagFontsId = diag.registerDynamicMetric({
    name: "assets.fonts",
    displayName: "Loaded Fonts",
    category: MetricCategory.ASSETS,
    group: "Assets",
    unit: MetricUnit.COUNT,
    type: MetricType.GAUGE,
    tags: Object.freeze(["assets"]),
  });
  const loaded = diag.metrics.find("assets.loaded");
  if (loaded) _diagLoadedId = loaded.id;
  const pending = diag.metrics.find("assets.pending");
  if (pending) _diagPendingId = pending.id;
  const errors = diag.metrics.find("assets.loadErrors");
  if (errors) _diagLoadErrorsId = errors.id;
}

function _recordFontGauge() {
  if (!_diagnostics || !_diagnosticsInitDone) return;
  _diagnostics.recordGauge(_diagFontsId, _loaded.size);
}

const _loaded = new Set();

export const FontLoader = {
  set diagnostics(diag) {
    _diagnostics = diag;
    _diagnosticsInitDone = false;
  },

  async load(family, path) {
    if (_loaded.has(family)) return;

    if (_diagnostics) {
      _initFontDiag(_diagnostics);
      _pendingCount++;
      if (_diagPendingId !== undefined) _diagnostics.recordGauge(_diagPendingId, _pendingCount);
    }

    try {
      const font = new FontFace(family, `url(${path})`);
      await font.load();
      document.fonts.add(font);
      _loaded.add(family);
      if (_diagnostics) {
        if (_diagLoadedId !== undefined) _diagnostics.recordCounter(_diagLoadedId, 1);
        _pendingCount--;
        if (_diagPendingId !== undefined) _diagnostics.recordGauge(_diagPendingId, _pendingCount);
        _recordFontGauge();
      }
    } catch (err) {
      if (_diagnostics) {
        if (_diagLoadErrorsId !== undefined) _diagnostics.recordCounter(_diagLoadErrorsId, 1);
        _pendingCount--;
        if (_diagPendingId !== undefined) _diagnostics.recordGauge(_diagPendingId, _pendingCount);
      }
      throw err;
    }
  },

  loadAll(map) {
    const entries = Object.entries(map);
    const task = new LoadingTask();
    task.expect(entries.length);

    for (const [family, path] of entries) {
      this.load(family, path).then(() => {
        task.done();
      }).catch((err) => task.fail(err));
    }

    return task;
  },

  isLoaded(family) {
    return _loaded.has(family);
  },

  unload(family) {
    const result = _loaded.delete(family);
    if (_diagnostics) {
      _initFontDiag(_diagnostics);
      _recordFontGauge();
    }
    return result;
  },

  clear() {
    _loaded.clear();
    if (_diagnostics) {
      _initFontDiag(_diagnostics);
      _recordFontGauge();
    }
  },
};
