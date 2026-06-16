import { Sound } from "./Sound.js";
import { Music } from "./Music.js";
import { AudioGroup } from "./AudioGroup.js";
import { AudioDefinition } from "./AudioDefinition.js";
import { AudioListener } from "./AudioListener.js";
import { AudioLoader } from "../loaders/AudioLoader.js";
import { HtmlAudioBackend } from "./backends/HtmlAudioBackend.js";
import { EffectChain } from "./effects/EffectChain.js";
import { AudioScene } from "./AudioScene.js";
import { ATTENUATION_LINEAR, ATTENUATION_QUADRATIC, ATTENUATION_INVERSE, computeAttenuation } from "./attenuation.js";

export { ATTENUATION_LINEAR, ATTENUATION_QUADRATIC, ATTENUATION_INVERSE, computeAttenuation };

const VALID_ATTENUATIONS = new Set([ATTENUATION_LINEAR, ATTENUATION_QUADRATIC, ATTENUATION_INVERSE]);

export class AudioManager {
  constructor(options = {}) {
    this._backend = options.backend || new HtmlAudioBackend();
    this._sounds = new Map();
    this._definitions = new Map();
    this._soundsByDefinition = new Map();
    this._groups = new Map();
    this._masterVolume = 1;
    this._masterMuted = false;
    this._listener = new AudioListener();
    this._transitionVolume = 1;
    this._transition = null;
    this._attenuation = ATTENUATION_LINEAR;
    this._inverseRolloff = 4;
    this._musicCache = new Map();
    this._scenes = new Map();
    this._masterProxy = null;
    this._masterEffectChain = new EffectChain();
    this._masterEffectChain.onChange = () => {
      this._backend._connectMasterEffectChain(this._masterEffectChain);
    };

    this._createGroup("master");
    this._createGroup("music");
    this._createGroup("sfx");
    this._createGroup("ui");
    this._createGroup("ambient");

    this._backend.unlock();
  }

  get listener() { return this._listener; }

  get attenuation() { return this._attenuation; }
  set attenuation(value) {
    if (!VALID_ATTENUATIONS.has(value)) {
      throw new Error("Invalid attenuation model: '" + value + "'. Must be 'linear', 'quadratic', or 'inverse'.");
    }
    this._attenuation = value;
  }

  get inverseRolloff() { return this._inverseRolloff; }
  set inverseRolloff(value) {
    this._inverseRolloff = Math.max(0, value);
  }

  get master() {
    if (!this._masterProxy) {
      this._masterProxy = { effects: this._masterEffectChain };
    }
    return this._masterProxy;
  }

  get effectiveMasterVolume() {
    return this._masterMuted ? 0 : this._masterVolume;
  }

  getVolumeForGroup(groupName) {
    const group = this._groups.get(groupName);
    return group ? (group._muted ? 0 : group._volume) : 1;
  }

  forEachGroup(fn) {
    this._groups.forEach(fn);
  }

  _createGroup(name) {
    const group = new AudioGroup(name, this);
    this._groups.set(name, group);
    return group;
  }

  getGroup(name) {
    return this._groups.get(name) || null;
  }

  group(name) {
    if (!this._groups.has(name)) {
      this._createGroup(name);
    }
    return this._groups.get(name);
  }

  _onGroupVolumeChange(groupName) {
    if (this._backend.supportsGroupGain) {
      if (groupName) {
        const group = this._groups.get(groupName);
        this._backend.setGroupVolume(groupName, group ? (group._muted ? 0 : group._volume) : 1);
      }
      return;
    }
    for (const sound of this._sounds.values()) {
      sound._updateAllVolumes();
    }
    for (const sound of this._soundsByDefinition.values()) {
      sound._updateAllVolumes();
    }
    for (const music of this._musicCache.values()) {
      music._updateVolume();
    }
  }

  _notifyAllSoundsVolumeChange() {
    if (this._backend.supportsGroupGain) return;
    for (const sound of this._sounds.values()) {
      sound._updateAllVolumes();
    }
    for (const sound of this._soundsByDefinition.values()) {
      sound._updateAllVolumes();
    }
    for (const music of this._musicCache.values()) {
      music._updateVolume();
    }
  }

  _iterateAllSounds(fn) {
    for (const sound of this._sounds.values()) fn(sound);
    for (const sound of this._soundsByDefinition.values()) fn(sound);
  }

  add(key, asset) {
    if (!key) throw new Error("AudioManager.add() requires a non-empty key");
    if (!asset) throw new Error("AudioManager.add() requires an audio asset");
    if (this._sounds.has(key)) throw new Error("Sound '" + key + "' already exists");

    const sound = new Sound(asset, this, { backend: this._backend });
    this._sounds.set(key, sound);
    return sound;
  }

  get(key) { return this._sounds.get(key); }
  has(key) { return this._sounds.has(key); }

  remove(key) {
    const sound = this._sounds.get(key);
    if (sound) {
      sound.destroy();
      this._sounds.delete(key);
    }
  }

  define(key, config) {
    if (!key || typeof key !== "string") {
      throw new Error("AudioManager.define() requires a non-empty key");
    }
    if (this._definitions.has(key)) {
      throw new Error("Audio definition '" + key + "' already exists");
    }

    const def = new AudioDefinition(config);
    this._definitions.set(key, def);
  }

  undefine(key) {
    if (!this._definitions.has(key)) return;
    this._definitions.delete(key);
    const sound = this._soundsByDefinition.get(key);
    if (sound) {
      sound.destroy();
      this._soundsByDefinition.delete(key);
    }
  }

  hasDefinition(key) {
    return this._definitions.has(key);
  }

  getDefinition(key) {
    return this._definitions.get(key) || null;
  }

  play(name, options = {}) {
    const def = this._definitions.get(name);
    if (!def) throw new Error("Audio definition '" + name + "' not found");

    let sound = this._soundsByDefinition.get(name);
    if (!sound) {
      const asset = this._backend.supportsGroupGain
        ? AudioLoader.getBuffer(def.source)
        : AudioLoader.get(def.source);
      if (!asset) throw new Error("Asset '" + def.source + "' not loaded. Use AudioLoader.load" + (this._backend.supportsGroupGain ? "Buffer" : "") + "() to load it first.");

      sound = new Sound(asset, this, { maxInstances: def.maxInstances, backend: this._backend });
      sound.volume = def.volume;
      sound.group = def.group;
      this._soundsByDefinition.set(name, sound);
    }

    const hasPosition = options.x !== undefined || options.y !== undefined;
    const spatialOpts = {};
    if (hasPosition) {
      spatialOpts.spatial = true;
      spatialOpts.x = options.x;
      spatialOpts.y = options.y;
      spatialOpts.minDistance = options.minDistance !== undefined ? options.minDistance : def.minDistance;
      spatialOpts.maxDistance = options.maxDistance !== undefined ? options.maxDistance : def.maxDistance;
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
    if (options.volume !== undefined || options.group !== undefined || hasPosition) {
      instance._applyVolume();
    }

    return instance;
  }

  hasMusic(key) {
    return this._musicCache.has(key);
  }

  music(key) {
    if (this._musicCache.has(key)) return this._musicCache.get(key);

    let asset = null;
    const existingSound = this._sounds.get(key) || this._soundsByDefinition.get(key);
    if (existingSound) {
      asset = existingSound._asset;
    }
    if (!asset) {
      const def = this._definitions.get(key);
      if (def) {
        asset = this._backend.supportsGroupGain
          ? AudioLoader.getBuffer(def.source)
          : AudioLoader.get(def.source);
        if (!asset) throw new Error("Asset '" + def.source + "' not loaded. Use AudioLoader.load" + (this._backend.supportsGroupGain ? "Buffer" : "") + "() to load it first.");
      }
    }
    if (!asset) throw new Error("Sound '" + key + "' not found. Use audio.add() or audio.define() first.");

    const music = new Music(asset, this);
    this._musicCache.set(key, music);
    return music;
  }

  clear() {
    for (const music of this._musicCache.values()) music.destroy();
    this._musicCache.clear();
    for (const sound of this._sounds.values()) sound.destroy();
    this._sounds.clear();
    for (const sound of this._soundsByDefinition.values()) sound.destroy();
    this._soundsByDefinition.clear();
  }

  destroy() {
    this.clear();
    this._transition = null;
    this._transitionVolume = 1;
    this._definitions.clear();
    for (const group of this._groups.values()) {
      this._backend._connectGroupEffectChain(group._name, null);
      group._manager = null;
    }
    this._groups.clear();
    this._backend._connectMasterEffectChain(null);
    for (const scene of this._scenes.values()) scene._manager = null;
    this._scenes.clear();
    this._listener = null;
    this._backend.destroy();
    this._backend = null;
  }

  suspend() {
    this._backend.suspend();
  }

  resume() {
    this._backend.resume();
  }

  update(dt) {
    const updateSpatial = (sound) => {
      const instances = sound._activeInstances;
      for (let i = 0; i < instances.length; i++) {
        const inst = instances[i];
        if (inst._spatial) {
          inst._applyVolume();
          if (inst._playback.setPosition) inst._playback.setPosition(inst._x, inst._y);
        }
      }
    };
    for (const sound of this._sounds.values()) updateSpatial(sound);
    for (const sound of this._soundsByDefinition.values()) updateSpatial(sound);
    this._backend.setListenerPosition(this._listener.x, this._listener.y);
    if (dt > 0) {
      for (const music of this._musicCache.values()) {
        music.update(dt);
      }
      if (this._transition) this._processTransition(dt);
    }
  }

  pauseAll() {
    this._iterateAllSounds(s => s._pauseAll());
  }

  resumeAll() {
    this._iterateAllSounds(s => s._resumeAll());
  }

  stopAll() {
    this._iterateAllSounds(s => s._stopAll());
  }

  mute() {
    this._masterMuted = true;
    if (this._backend.supportsGroupGain) this._backend.setMasterVolume(0);
    this._notifyAllSoundsVolumeChange();
  }

  unmute() {
    this._masterMuted = false;
    if (this._backend.supportsGroupGain) this._backend.setMasterVolume(this.effectiveMasterVolume);
    this._notifyAllSoundsVolumeChange();
  }

  get masterVolume() { return this._masterVolume; }
  set masterVolume(value) {
    this._masterVolume = Math.max(0, Math.min(1, value));
    if (this._backend.supportsGroupGain) this._backend.setMasterVolume(this.effectiveMasterVolume);
    this._notifyAllSoundsVolumeChange();
  }

  snapshot(name) {
    if (!name || typeof name !== "string") {
      throw new Error("AudioManager.snapshot() requires a non-empty name");
    }
    let scene = this._scenes.get(name);
    if (!scene) {
      scene = new AudioScene(this);
      this._scenes.set(name, scene);
    }
    scene.save();
    return this;
  }

  restoreSnapshot(name) {
    const scene = this._scenes.get(name);
    if (!scene) throw new Error("Audio snapshot '" + name + "' not found");
    scene.restore();
    return this;
  }

  transition(name, options = {}) {
    const scene = this._scenes.get(name);
    if (!scene) throw new Error("Audio snapshot '" + name + "' not found");

    const type = options.type || "cut";
    const duration = options.duration != null ? options.duration : 1;

    if (type === "cut") {
      scene.restore();
      return this;
    }

    if (type === "fadeOut") {
      this._transition = { type: "fadeOut", duration: Math.max(0.001, duration), timer: 0, targetScene: scene };
      return this;
    }

    if (type === "fadeIn") {
      scene.restore();
      this._transitionVolume = 0;
      this._notifyAllSoundsVolumeChange();
      this._transition = { type: "fadeIn", duration: Math.max(0.001, duration), timer: 0 };
      return this;
    }

    if (type === "crossfade") {
      const half = Math.max(0.001, duration / 2);
      this._transition = { type: "crossfade", duration: half, timer: 0, targetScene: scene, phase: "fadeOut" };
      return this;
    }

    throw new Error("Unknown transition type '" + type + "'");
  }

  _processTransition(dt) {
    const t = this._transition;
    t.timer += dt;

    if (t.type === "fadeOut") {
      this._transitionVolume = 1 - Math.min(t.timer / t.duration, 1);
      this._notifyAllSoundsVolumeChange();
      if (t.timer >= t.duration) {
        t.targetScene.restore();
        this._transitionVolume = 1;
        this._transition = null;
        this._notifyAllSoundsVolumeChange();
      }
    } else if (t.type === "fadeIn") {
      this._transitionVolume = Math.min(t.timer / t.duration, 1);
      this._notifyAllSoundsVolumeChange();
      if (t.timer >= t.duration) {
        this._transitionVolume = 1;
        this._transition = null;
        this._notifyAllSoundsVolumeChange();
      }
    } else if (t.type === "crossfade") {
      this._transitionVolume = 1 - Math.min(t.timer / t.duration, 1);
      this._notifyAllSoundsVolumeChange();
      if (t.timer >= t.duration) {
        if (t.phase === "fadeOut") {
          t.targetScene.restore();
          t.phase = "fadeIn";
          t.timer = 0;
          this._transitionVolume = 0;
          this._notifyAllSoundsVolumeChange();
        } else {
          this._transitionVolume = 1;
          this._transition = null;
          this._notifyAllSoundsVolumeChange();
        }
      }
    }
  }

  hasSnapshot(name) {
    return this._scenes.has(name);
  }

  removeSnapshot(name) {
    this._scenes.delete(name);
    return this;
  }

  pauseScene(name) {
    const scene = this._scenes.get(name);
    if (!scene) return this;
    scene.forEachSound((data, sound) => sound._pauseAll());
    const musicStates = scene._snapshot ? scene._snapshot.music : [];
    for (const state of musicStates) {
      const music = this._musicCache.get(state.key);
      if (music) music.pause();
    }
    return this;
  }

  resumeScene(name) {
    const scene = this._scenes.get(name);
    if (!scene) return this;
    scene.forEachSound((data, sound) => sound._resumeAll());
    const musicStates = scene._snapshot ? scene._snapshot.music : [];
    for (const state of musicStates) {
      const music = this._musicCache.get(state.key);
      if (music) music.play();
    }
    return this;
  }

  stopScene(name) {
    const scene = this._scenes.get(name);
    if (!scene) return this;
    scene.forEachSound((data, sound) => sound._stopAll());
    const musicStates = scene._snapshot ? scene._snapshot.music : [];
    for (const state of musicStates) {
      const music = this._musicCache.get(state.key);
      if (music) music.stop();
    }
    return this;
  }
}
