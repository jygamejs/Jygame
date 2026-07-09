import { LoadingTask } from "../core/LoadingTask.js";
import { Diagnostics, MetricCategory, MetricUnit, MetricType, resolveMetricIds }
  from "../debug/index.js";

let _diagnostics = null;
let _diagIds = null;
let _pendingCount = 0;

function _initImageDiag(diag) {
  if (_diagIds) return;
  _diagIds = resolveMetricIds(diag, {
    textures: {
      name: "assets.textures",
      displayName: "Loaded Textures",
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

function _recordTextureGauge() {
  if (!_diagnostics || !_diagIds) return;
  if (_diagIds.textures >= 0) _diagnostics.recordGauge(_diagIds.textures, _cache.size);
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
    _diagIds = null;
  },

  load(path, options = {}) {
    const decode = options.decode !== false;

    if (_cache.has(path)) return Promise.resolve(_cache.get(path));

    if (_diagnostics) {
      _initImageDiag(_diagnostics);
      _pendingCount++;
      if (_diagIds && _diagIds.pending >= 0) _diagnostics.recordGauge(_diagIds.pending, _pendingCount);
    }

    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = async () => {
        if (decode) await _decode(img, path);
        _cache.set(path, img);
        if (_diagnostics) {
          const ids = _diagIds;
          if (ids && ids.loaded >= 0) _diagnostics.recordCounter(ids.loaded, 1);
          _pendingCount--;
          if (ids && ids.pending >= 0) _diagnostics.recordGauge(ids.pending, _pendingCount);
          _recordTextureGauge();
        }
        resolve(img);
      };
      img.onerror = () => {
        if (_diagnostics) {
          const ids = _diagIds;
          if (ids && ids.errors >= 0) _diagnostics.recordCounter(ids.errors, 1);
          _pendingCount--;
          if (ids && ids.pending >= 0) _diagnostics.recordGauge(ids.pending, _pendingCount);
        }
        reject(new Error(`Failed to load image: ${path}`));
      };
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
