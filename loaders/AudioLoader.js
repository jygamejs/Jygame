import { LoadingTask } from "../core/LoadingTask.js";
import { Diagnostics, MetricCategory, MetricUnit, MetricType, resolveMetricIds }
  from "../debug/index.js";

let _diagnostics = null;
let _diagIds = null;
let _pendingCount = 0;

function _initAudioDiag(diag) {
  if (_diagIds) return;
  _diagIds = resolveMetricIds(diag, {
    audioClips: {
      name: "assets.audioClips",
      displayName: "Audio Clips",
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

function _recordAudioGauge() {
  if (!_diagnostics || !_diagIds) return;
  if (_diagIds.audioClips >= 0) _diagnostics.recordGauge(_diagIds.audioClips, _cache.size);
}

const _cache = new Map();
const _bufferCache = new Map();

export const AudioLoader = {
  set diagnostics(diag) {
    _diagnostics = diag;
    _diagIds = null;
  },

  load(path) {
    if (_cache.has(path)) return Promise.resolve(_cache.get(path));

    if (_diagnostics) {
      _initAudioDiag(_diagnostics);
      _pendingCount++;
      if (_diagIds && _diagIds.pending >= 0) _diagnostics.recordGauge(_diagIds.pending, _pendingCount);
    }

    return new Promise((resolve, reject) => {
      const audio = new Audio();
      audio.preload = "auto";
      audio.oncanplaythrough = () => {
        _cache.set(path, audio);
        if (_diagnostics) {
          const ids = _diagIds;
          if (ids && ids.loaded >= 0) _diagnostics.recordCounter(ids.loaded, 1);
          _pendingCount--;
          if (ids && ids.pending >= 0) _diagnostics.recordGauge(ids.pending, _pendingCount);
          _recordAudioGauge();
        }
        resolve(audio);
      };
      audio.onerror = () => {
        if (_diagnostics) {
          const ids = _diagIds;
          if (ids && ids.errors >= 0) _diagnostics.recordCounter(ids.errors, 1);
          _pendingCount--;
          if (ids && ids.pending >= 0) _diagnostics.recordGauge(ids.pending, _pendingCount);
        }
        reject(new Error(`Failed to load audio: ${path}`));
      };
      audio.src = path;
      audio.load();
    });
  },

  loadAll(map, options) {
    const entries = Object.entries(map);
    const results = {};
    const task = new LoadingTask(() => results);
    task.expect(entries.length);

    for (const [key, path] of entries) {
      this.load(path, options).then((audio) => {
        results[key] = audio;
        _cache.set(key, audio);
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
    _bufferCache.delete(key);
    const result = _cache.delete(key);
    if (_diagnostics) {
      _initAudioDiag(_diagnostics);
      _recordAudioGauge();
    }
    return result;
  },

  clear() {
    _cache.clear();
    _bufferCache.clear();
    if (_diagnostics) {
      _initAudioDiag(_diagnostics);
      _recordAudioGauge();
    }
  },

  loadBuffer(path, audioContext) {
    if (_bufferCache.has(path)) return Promise.resolve(_bufferCache.get(path));

    return fetch(path)
      .then(r => {
        if (!r.ok) throw new Error(`Failed to load audio buffer: ${path}`);
        return r.arrayBuffer();
      })
      .then(arrayBuffer => audioContext.decodeAudioData(arrayBuffer))
      .then(audioBuffer => {
        _bufferCache.set(path, audioBuffer);
        return audioBuffer;
      });
  },

  getBuffer(key) {
    return _bufferCache.get(key) || null;
  },
};
