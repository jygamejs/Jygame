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
const _backendKinds = new Map();

let _rafId = null;
let _lastTime = 0;

const VALID_BACKENDS = new Set(["web", "html"]);
let _forcedBackend = null;
let _autoplayMode = "gated";

function _detectBackendKind() {
  if (typeof window !== "undefined" && (window.AudioContext || window.webkitAudioContext)) {
    return "web";
  }
  return "html";
}

function _getAutoBackendKind() {
  return _forcedBackend || _detectBackendKind();
}

function _createBackend() {
  if (_getAutoBackendKind() === "web") return new WebAudioBackend();
  return new HtmlAudioBackend();
}

function _resolveBackendKind(options) {
  const backend = options && options.backend;
  if (backend === undefined) return null;
  if (!VALID_BACKENDS.has(backend)) {
    throw new Error(
      `Audio: unknown backend "${backend}". Expected "web" or "html".`
    );
  }
  return backend;
}

function _assertBackendMatch(key, kind) {
  if (kind == null) return;
  const existing = _backendKinds.get(key);
  if (existing && existing !== kind) {
    throw new Error(
      `Audio: "${key}" is already loaded with the "${existing}" backend; ` +
      `it cannot be reloaded with "${kind}". Remove it first or reuse its backend.`
    );
  }
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
    _manager = new AudioManager({ backend: _createBackend(), autoplay: _autoplayMode });
    for (const [key, asset] of _assets) _manager.registerAsset(key, asset);
  }
  return _manager;
}

function _registerAsset(name, path, asset) {
  if (!_manager) return;
  _manager.registerAsset(name, asset);
  if (path && path !== name) _manager.registerAsset(path, asset);
}

async function _loadAsset(path, kind) {
  if ((kind || _getAutoBackendKind()) === "web") {
    const mgr = _getManager();
    const ctx = mgr.getBackend("web")._getContext();
    return AudioLoader.loadBuffer(path, ctx);
  }
  return AudioLoader.load(path);
}

function _getSound(key, kind) {
  let sound = _sounds.get(key);
  if (sound) return sound;
  const asset = _assets.get(key);
  if (!asset) return null;
  const mgr = _getManager();
  const effectiveKind = kind || _backendKinds.get(key) || _getAutoBackendKind();
  const backend = mgr.getBackend(effectiveKind);
  sound = new Sound(asset, mgr, { backend });
  sound._onPlay = _startLoop;
  _sounds.set(key, sound);
  return sound;
}

function _loadNamedSound(name, path, options) {
  const kind = _resolveBackendKind(options);
  const existing = _sounds.get(name);
  if (existing) {
    _assertBackendMatch(name, kind);
    return Promise.resolve(existing);
  }
  if (_sounds.has(path)) {
    const sound = _sounds.get(path);
    _assertBackendMatch(path, kind);
    _sounds.set(name, sound);
    _assets.set(name, sound._asset);
    _backendKinds.set(name, _backendKinds.get(path));
    if (_manager) _manager.registerAsset(name, sound._asset);
    return Promise.resolve(sound);
  }
  return _loadAsset(path, kind).then((audio) => {
    const effectiveKind = kind || _getAutoBackendKind();
    _assets.set(name, audio);
    _backendKinds.set(name, effectiveKind);
    _registerAsset(name, path, audio);
    const sound = _getSound(name, effectiveKind);
    if (path !== name) {
      _sounds.set(path, sound);
      _backendKinds.set(path, effectiveKind);
    }
    return sound;
  });
}

function _isObject(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// A single-argument `music(key)` call is ambiguous between a registered name
// and a path that has not been loaded yet. Paths are the strings that look
// like files — a `/` separator or a recognizable audio extension. Names that
// are neither loaded nor path-like get the descriptive "not found" error
// instead of a failed fetch.
function _looksLikePath(key) {
  if (key.includes("/")) return true;
  return /\.(mp3|ogg|wav|oga|m4a|aac|flac|webm|opus)$/i.test(key);
}

function _isBatchMap(a) {
  if (!_isObject(a)) return false;
  if (Object.keys(a).length === 0) return false;
  for (const v of Object.values(a)) {
    if (typeof v === "string") continue;
    if (_isObject(v) && typeof v.path === "string") continue;
    return false;
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

  load(a, b, c) {
    if (typeof a === "string") {
      if (typeof b === "string") {
        return this._loadNamed(a, b, c);
      }
      if (_isObject(b)) {
        return this._loadSingle(a, b);
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

  async _loadSingle(path, options) {
    const kind = _resolveBackendKind(options);
    const existing = _sounds.get(path);
    if (existing) {
      _assertBackendMatch(path, kind);
      return existing;
    }
    const audio = await _loadAsset(path, kind);
    const effectiveKind = kind || _getAutoBackendKind();
    _assets.set(path, audio);
    _backendKinds.set(path, effectiveKind);
    _registerAsset(path, null, audio);
    return _getSound(path, effectiveKind);
  },

  async _loadNamed(name, path, options) {
    return _loadNamedSound(name, path, options);
  },

  _loadBatch(map) {
    const entries = Object.entries(map);
    const results = {};
    const task = new LoadingTask(() => results);
    task.expect(entries.length);

    for (const [name, spec] of entries) {
      const path = typeof spec === "string" ? spec : spec.path;
      const options = typeof spec === "string" ? undefined : spec;
      _loadNamedSound(name, path, options).then((sound) => {
        results[name] = sound;
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

  // Returns a looping `Music` handle for a clip. The same handle is cached per
  // key and returned on every call. `music()` accepts the same forms as
  // `load()` and resolves a `Promise<Music>` so the clip can be fetched on
  // demand — no separate `Audio.load()` required:
  //
  //   await Audio.music("assets/theme.ogg")            // load by path
  //   await Audio.music("bgm", "assets/bg.ogg")        // load named
  //   await Audio.music("bgm")                         // already-loaded key
  //
  // The named form registers the clip under both the name and the path, so
  // `Audio.play("bgm")` reaches the same loaded asset afterwards. A key that
  // is not loaded and not a path throws "not found".
  async music(a, b, options) {
    const mgr = _getManager();

    // Named load form — music(name, path, options).
    if (typeof b === "string") {
      const cached = _musicCache.get(a);
      if (cached) return cached;
      const sound = await _loadNamedSound(a, b, options);
      const music = new Music(sound._asset, mgr, { backend: sound._backend });
      _musicCache.set(a, music);
      if (b !== a) _musicCache.set(b, music);
      _startLoop();
      return music;
    }

    // Key form — music(key, options).
    if (_musicCache.has(a)) return _musicCache.get(a);

    let asset = _assets.get(a);
    if (!asset) asset = AudioLoader.get(a);
    if (!asset && _looksLikePath(a)) {
      const sound = await _loadSingle(a, b);
      asset = sound._asset;
    }
    if (!asset) {
      const mgrMusic = mgr.getMusic(a);
      if (mgrMusic) return mgrMusic;
      throw new Error(
        `Audio: music "${a}" not found. Load it first with Audio.load().`
      );
    }

    const sound = _sounds.get(a);
    const music = new Music(asset, mgr, { backend: sound ? sound._backend : mgr._backend });
    _musicCache.set(a, music);
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

  // ── Backend / master effects ──

  get backend() {
    return _getAutoBackendKind();
  },
  set backend(value) {
    if (value === null || value === undefined || value === "auto") {
      _forcedBackend = null;
      return;
    }
    if (value !== "web" && value !== "html") {
      throw new Error(
        `Audio: unknown backend "${value}". Expected "web", "html", "auto", or null.`
      );
    }
    _forcedBackend = value;
  },

  get effects() {
    return _getManager().master.effects;
  },

  get attenuation() {
    return _getManager().attenuation;
  },
  set attenuation(value) {
    _getManager().attenuation = value;
  },

  get inverseRolloff() {
    return _getManager().inverseRolloff;
  },
  set inverseRolloff(value) {
    _getManager().inverseRolloff = value;
  },

  get autoplay() {
    return _autoplayMode;
  },
  set autoplay(value) {
    if (value !== "gated" && value !== "none") {
      throw new Error(
        `Audio: unknown autoplay mode "${value}". Expected "gated" or "none".`
      );
    }
    _autoplayMode = value;
    if (_manager) {
      _manager._autoplay = value;
      if (value === "gated") {
        if (!_manager._playLock) {
          _manager._playLock = true;
          _manager._registerUnlockGate();
        }
      } else if (_manager._playLock) {
        _manager.flush();
      }
    }
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
    return _sounds.get(key) || null;
  },

  has(key) {
    return _sounds.has(key) || _assets.has(key) || AudioLoader.has(key);
  },

  remove(key) {
    const sound = _sounds.get(key);
    if (sound) {
      sound.destroy();
      for (const [k, s] of _sounds) {
        if (s === sound) {
          _sounds.delete(k);
          _backendKinds.delete(k);
        }
      }
    }
    _assets.delete(key);
    _backendKinds.delete(key);
    const music = _musicCache.get(key);
    if (music) { music.destroy(); _musicCache.delete(key); }
    if (_manager) _manager.removeAsset(key);
    AudioLoader.unload(key);
  },

  clear() {
    _assets.clear();
    _backendKinds.clear();
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
