import { LoadingTask } from "../core/LoadingTask.js";
import { Diagnostics, MetricCategory, MetricUnit, MetricType }
  from "../debug/index.js";

let _diagnostics = null;
let _diagnosticsInitDone = false;
let _diagTexturesId, _diagLoadedId;

function _initImageDiag(diag) {
  if (_diagnosticsInitDone) return;
  _diagnosticsInitDone = true;
  _diagTexturesId = diag.registerDynamicMetric({
    name: "assets.textures",
    displayName: "Loaded Textures",
    category: MetricCategory.ASSETS,
    group: "Assets",
    unit: MetricUnit.COUNT,
    type: MetricType.GAUGE,
    tags: Object.freeze(["assets"]),
  });
  _diagLoadedId = diag.registerDynamicMetric({
    name: "assets.loaded",
    displayName: "Assets Loaded",
    category: MetricCategory.ASSETS,
    group: "Assets",
    unit: MetricUnit.COUNT,
    type: MetricType.COUNTER,
    tags: Object.freeze(["assets"]),
  });
}

function _recordTextureGauge() {
  if (!_diagnostics || !_diagnosticsInitDone) return;
  _diagnostics.recordGauge(_diagTexturesId, _cache.size);
}

const _cache = new Map();

async function _decode(img, path) {
  if (typeof img.decode !== "function") return;
  try {
    await img.decode();
  } catch (err) {
    console.warn(`Image decode failed for ${path}, rendering may be deferred:`, err);
  }
}

export const ImageLoader = {
  set diagnostics(diag) {
    _diagnostics = diag;
    _diagnosticsInitDone = false;
  },

  load(path, options = {}) {
    const decode = options.decode !== false;

    if (_cache.has(path)) return Promise.resolve(_cache.get(path));

    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = async () => {
        if (decode) await _decode(img, path);
        _cache.set(path, img);
        if (_diagnostics) {
          _initImageDiag(_diagnostics);
          _diagnostics.recordCounter(_diagLoadedId, 1);
          if (_diagnostics._active) _recordTextureGauge();
        }
        resolve(img);
      };
      img.onerror = () => reject(new Error(`Failed to load image: ${path}`));
      img.src = path;
    });
  },

  loadAll(map, options) {
    const entries = Object.entries(map);
    const results = {};
    const task = new LoadingTask(() => results);
    task.expect(entries.length);

    for (const [key, path] of entries) {
      this.load(path, options).then((img) => {
        results[key] = img;
        _cache.set(key, img);
        task.done();
      }).catch((err) => task.fail(err));
    }

    return task;
  },

  get(key) {
    return _cache.get(key) || null;
  },

  has(key) {
    return _cache.has(key);
  },

  unload(key) {
    const result = _cache.delete(key);
    if (_diagnostics) {
      _initImageDiag(_diagnostics);
      _recordTextureGauge();
    }
    return result;
  },

  clear() {
    _cache.clear();
    if (_diagnostics) {
      _initImageDiag(_diagnostics);
      _recordTextureGauge();
    }
  },
};
