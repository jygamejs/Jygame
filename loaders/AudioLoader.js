import { LoadingTask } from "../core/LoadingTask.js";
import { Diagnostics, MetricCategory, MetricUnit, MetricType }
  from "../debug/index.js";

let _diagnostics = null;
let _diagnosticsInitDone = false;
let _diagAudioClipsId, _diagLoadedId;

function _initAudioDiag(diag) {
  if (_diagnosticsInitDone) return;
  _diagnosticsInitDone = true;
  _diagAudioClipsId = diag.registerDynamicMetric({
    name: "assets.audioClips",
    displayName: "Audio Clips",
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

function _recordAudioGauge() {
  if (!_diagnostics || !_diagnosticsInitDone) return;
  _diagnostics.recordGauge(_diagAudioClipsId, _cache.size);
}

const _cache = new Map();
const _bufferCache = new Map();

export const AudioLoader = {
  set diagnostics(diag) {
    _diagnostics = diag;
    _diagnosticsInitDone = false;
  },

  load(path) {
    if (_cache.has(path)) return Promise.resolve(_cache.get(path));

    return new Promise((resolve, reject) => {
      const audio = new Audio();
      audio.preload = "auto";
      audio.oncanplaythrough = () => {
        _cache.set(path, audio);
        if (_diagnostics) {
          _initAudioDiag(_diagnostics);
          _diagnostics.recordCounter(_diagLoadedId, 1);
          if (_diagnostics._active) _recordAudioGauge();
        }
        resolve(audio);
      };
      audio.onerror = () => reject(new Error(`Failed to load audio: ${path}`));
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
