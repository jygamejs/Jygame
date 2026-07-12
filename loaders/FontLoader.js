import { LoadingTask } from "./LoadingTask.js";
import { Diagnostics, MetricCategory, MetricUnit, MetricType, resolveMetricIds }
  from "../debug/index.js";

let _diagnostics = null;
let _diagIds = null;
let _pendingCount = 0;

function _initFontDiag(diag) {
  if (_diagIds) return;
  _diagIds = resolveMetricIds(diag, {
    fonts: {
      name: "assets.fonts",
      displayName: "Loaded Fonts",
      category: MetricCategory.ASSETS,
      group: "Assets",
      unit: MetricUnit.COUNT,
      type: MetricType.GAUGE,
      tags: Object.freeze(["assets"]),
    },
    loaded: "assets.loaded",
    pending: "assets.pending",
    errors: "assets.loadErrors",
  });
}

function _recordFontGauge() {
  if (!_diagnostics || !_diagIds) return;
  if (_diagIds.fonts >= 0) _diagnostics.recordGauge(_diagIds.fonts, _loaded.size);
}

const _loaded = new Set();

export const FontLoader = {
  set diagnostics(diag) {
    _diagnostics = diag;
    _diagIds = null;
  },

  async load(family, path) {
    if (_loaded.has(family)) return;

    if (_diagnostics) {
      _initFontDiag(_diagnostics);
      _pendingCount++;
      if (_diagIds && _diagIds.pending >= 0) _diagnostics.recordGauge(_diagIds.pending, _pendingCount);
    }

    try {
      const font = new FontFace(family, `url(${path})`);
      await font.load();
      document.fonts.add(font);
      _loaded.add(family);
      if (_diagnostics) {
        const ids = _diagIds;
        if (ids && ids.loaded >= 0) _diagnostics.recordCounter(ids.loaded, 1);
        _pendingCount--;
        if (ids && ids.pending >= 0) _diagnostics.recordGauge(ids.pending, _pendingCount);
        _recordFontGauge();
      }
    } catch (err) {
      if (_diagnostics) {
        const ids = _diagIds;
        if (ids && ids.errors >= 0) _diagnostics.recordCounter(ids.errors, 1);
        _pendingCount--;
        if (ids && ids.pending >= 0) _diagnostics.recordGauge(ids.pending, _pendingCount);
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
