import { AudioLoader } from "./AudioLoader.js";
import { AudioManager } from "../audio/AudioManager.js";
import { HtmlAudioBackend } from "../audio/backends/HtmlAudioBackend.js";
import { WebAudioBackend } from "../audio/backends/WebAudioBackend.js";
import { LoadingTask } from "./LoadingTask.js";
import { Sound } from "../audio/Sound.js";
import { Music } from "../audio/Music.js";

let _manager = null;
const _assets = new Map();
const _sounds = new Map();
const _musicCache = new Map();

let _rafId = null;
let _lastTime = 0;

function _detectBackendKind() {
  if (typeof window !== "undefined" && (window.AudioContext || window.webkitAudioContext)) {
    return "webaudio";
  }
  return "html";
}

function _createBackend() {
  if (_detectBackendKind() === "webaudio") return new WebAudioBackend();
  return new HtmlAudioBackend();
}

function _tick(time) {
  const dt = (time - _lastTime) / 1000;
  _lastTime = time;
  if (_manager) _manager.update(dt);
  _rafId = requestAnimationFrame(_tick);
}

function _startLoop() {
  if (_rafId !== null) return;
  if (typeof requestAnimationFrame === "undefined") return;
  _lastTime = performance.now();
  _rafId = requestAnimationFrame(_tick);
}

function _stopLoop() {
  if (_rafId === null) return;
  cancelAnimationFrame(_rafId);
  _rafId = null;
}

function _getManager() {
  if (!_manager) {
    _manager = new AudioManager({ backend: _createBackend() });
    for (const [key, asset] of _assets) _manager.registerAsset(key, asset);
  }
  return _manager;
}

function _registerAsset(name, path, asset) {
  if (!_manager) return;
  _manager.registerAsset(name, asset);
  if (path && path !== name) _manager.registerAsset(path, asset);
}

async function _loadAsset(path) {
  if (_detectBackendKind() === "webaudio") {
    const mgr = _getManager();
    const ctx = mgr._backend._getContext();
    return AudioLoader.loadBuffer(path, ctx);
  }
  return AudioLoader.load(path);
}

function _getSound(key) {
  let sound = _sounds.get(key);
  if (sound) return sound;
  const asset = _assets.get(key);
  if (!asset) return null;
  const mgr = _getManager();
  sound = new Sound(asset, mgr, { backend: mgr._backend });
  _sounds.set(key, sound);
  return sound;
}

function _isObject(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function _isBatchMap(a) {
  if (!_isObject(a)) return false;
  for (const v of Object.values(a)) {
    if (typeof v !== "string") return false;
  }
  return true;
}

function _playInstance(sound, options) {
  const hasPosition = options.x !== undefined || options.y !== undefined;
  const spatialOpts = {};
  if (hasPosition) {
    spatialOpts.spatial = true;
    spatialOpts.x = options.x;
    spatialOpts.y = options.y;
    if (options.minDistance != null) spatialOpts.minDistance = options.minDistance;
    if (options.maxDistance != null) spatialOpts.maxDistance = options.maxDistance;
  }

  const instance = sound.play(spatialOpts);
  if (!instance) return null;

  if (options.volume !== undefined) {
    instance._overrideSoundVolume = Math.max(0, Math.min(1, options.volume));
  }
  if (options.loop !== undefined) instance.loop = options.loop;
  if (options.group !== undefined) {
    instance._overrideGroup = options.group;
  }
  const needsApply = options.volume !== undefined || options.group !== undefined || hasPosition;
  if (needsApply) instance._applyVolume();

  return instance;
}

export const Audio = {

  // ── Audio.load ──

  load(a, b) {
    if (typeof a === "string") {
      if (typeof b === "string") {
        return this._loadNamed(a, b);
      }
      return this._loadSingle(a);
    }
    if (_isBatchMap(a)) {
      return this._loadBatch(a);
    }
    throw new TypeError(
      "Audio.load: expected a path string, a (name, path) pair, or a batch object."
    );
  },

  async _loadSingle(path) {
    return _loadAsset(path);
  },

  async _loadNamed(name, path) {
    if (_assets.has(name)) return _assets.get(name);
    const audio = await _loadAsset(path);
    _assets.set(name, audio);
    _registerAsset(name, path, audio);
    return audio;
  },

  _loadBatch(map) {
    const entries = Object.entries(map);
    const results = {};
    const task = new LoadingTask(() => results);
    task.expect(entries.length);

    for (const [name, path] of entries) {
      if (_assets.has(name)) {
        results[name] = _assets.get(name);
        task.done();
        continue;
      }
      _loadAsset(path).then((audio) => {
        results[name] = audio;
        _assets.set(name, audio);
        _registerAsset(name, path, audio);
        task.done();
      }).catch((err) => task.fail(err));
    }

    return task;
  },

  // ── Audio.play ──

  play(key, options = {}) {
    const mgr = _getManager();

    if (mgr._playLock) {
      mgr._playQueue.push(() => this.play(key, options));
      return null;
    }

    const sound = _getSound(key);
    if (!sound) {
      throw new Error(
        `Audio: "${key}" not loaded. Call Audio.load() first.`
      );
    }

    _startLoop();
    return _playInstance(sound, options);
  },

  // ── Audio.music ──

  music(key) {
    if (_musicCache.has(key)) return _musicCache.get(key);

    let asset = _assets.get(key);
    if (!asset) {
      asset = AudioLoader.get(key);
    }
    if (!asset) {
      const mgrMusic = _getManager().getMusic(key);
      if (mgrMusic) return mgrMusic;
    }
    if (!asset) {
      throw new Error(
        `Audio: music "${key}" not found. Load it first with Audio.load().`
      );
    }

    const mgr = _getManager();
    const music = new Music(asset, mgr);
    _musicCache.set(key, music);
    _startLoop();
    return music;
  },

  // ── Audio.group ──

  group(name) {
    return _getManager().group(name);
  },

  // ── Audio.listener ──

  get listener() {
    return _getManager().listener;
  },

  // ── Volume / mute ──

  get volume() {
    return _getManager().masterVolume;
  },
  set volume(v) {
    _getManager().masterVolume = v;
  },

  get muted() {
    return _getManager().masterMuted;
  },

  mute() { _getManager().mute(); },
  unmute() { _getManager().unmute(); },

  pauseAll() { _getManager().pauseAll(); },
  resumeAll() { _getManager().resumeAll(); },
  stopAll() { _getManager().stopAll(); },

  // ── Asset management ──

  get(key) {
    return _assets.get(key) || AudioLoader.get(key) || null;
  },

  has(key) {
    return _assets.has(key) || AudioLoader.has(key);
  },

  remove(key) {
    _assets.delete(key);
    const sound = _sounds.get(key);
    if (sound) { sound.destroy(); _sounds.delete(key); }
    const music = _musicCache.get(key);
    if (music) { music.destroy(); _musicCache.delete(key); }
    if (_manager) _manager.removeAsset(key);
    AudioLoader.unload(key);
  },

  clear() {
    _assets.clear();
    for (const s of _sounds.values()) s.destroy();
    _sounds.clear();
    for (const m of _musicCache.values()) m.destroy();
    _musicCache.clear();
    AudioLoader.clear();
    _stopLoop();
    if (_manager) {
      _manager.clear();
      _manager.destroy();
      _manager = null;
    }
  },
};
