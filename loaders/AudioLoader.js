import { LoadingTask } from "../core/LoadingTask.js";

const _cache = new Map();
const _bufferCache = new Map();

export const AudioLoader = {
  load(path) {
    if (_cache.has(path)) return Promise.resolve(_cache.get(path));

    return new Promise((resolve, reject) => {
      const audio = new Audio();
      audio.preload = "auto";
      audio.oncanplaythrough = () => {
        _cache.set(path, audio);
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
    return _cache.delete(key);
  },

  clear() {
    _cache.clear();
    _bufferCache.clear();
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
