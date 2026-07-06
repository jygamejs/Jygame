import { LoadingTask } from "../core/LoadingTask.js";
import { Diagnostics, MetricCategory, MetricUnit, MetricType }
  from "../debug/index.js";

let _diagnostics = null;
let _diagnosticsInitDone = false;
let _diagFontsId;

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

    const font = new FontFace(family, `url(${path})`);
    await font.load();
    document.fonts.add(font);
    _loaded.add(family);
    if (_diagnostics) {
      _initFontDiag(_diagnostics);
      _recordFontGauge();
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
