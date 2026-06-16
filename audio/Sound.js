import { AudioInstance } from "./AudioInstance.js";
import { ATTENUATION_LINEAR, ATTENUATION_QUADRATIC, ATTENUATION_INVERSE } from "./attenuation.js";
import { EffectChain } from "./effects/EffectChain.js";
import { ObjectPool } from "./ObjectPool.js";

export class Sound {
  constructor(asset, manager, options = {}) {
    if (!asset) throw new Error("Sound requires an audio asset");

    this._asset = asset;
    this._manager = manager;
    this._backend = options.backend || (manager && manager._backend);
    if (!this._backend) {
      throw new Error("Sound requires an AudioBackend (provide options.backend or a manager)");
    }
    this._ownsBackend = !!options.backend && !manager;
    this._pool = new ObjectPool(() => {
      const playback = this._backend.createPlayback(this._asset, this._effectChain, this._groupName);
      return new AudioInstance(playback, this);
    }, { maxSize: options.maxPoolSize ?? 64 });
    this._activeInstances = [];
    this._volume = 1;
    this._groupName = "master";
    this._destroyed = false;
    this._maxInstances = options.maxInstances ?? 32;
    this._overflowPolicy = options.overflowPolicy || "drop-new";
    this._attenuation = null;
    this._persistent = false;
    this._effectChain = new EffectChain();
  }

  get persistent() { return this._persistent; }
  set persistent(value) { this._persistent = value; }

  get effects() { return this._effectChain; }

  get volume() { return this._destroyed ? 0 : this._volume; }
  set volume(value) {
    if (this._destroyed) return;
    this._volume = Math.max(0, Math.min(1, value));
    this._updateAllVolumes();
  }

  get group() { return this._groupName; }
  set group(value) {
    this._groupName = value || "master";
    this._updateAllVolumes();
  }

  get isPlaying() { return this._activeInstances.length > 0; }

  get attenuation() { return this._attenuation; }
  set attenuation(value) {
    if (value !== null && value !== ATTENUATION_LINEAR && value !== ATTENUATION_QUADRATIC && value !== ATTENUATION_INVERSE) {
      throw new Error("Invalid attenuation model: '" + value + "'. Must be 'linear', 'quadratic', 'inverse', or null.");
    }
    this._attenuation = value;
  }

  play(options = {}) {
    this._checkNotDestroyed();

    if (this._activeInstances.length >= this._maxInstances) {
      if (this._overflowPolicy === "drop-new") return null;
      if (this._overflowPolicy === "replace-oldest") {
        const oldest = this._activeInstances[0];
        oldest.stop();
        this._returnInstance(oldest);
      }
    }

    const instance = this._getInstance();
    instance._returned = false;
    instance._poolIndex = this._activeInstances.length;
    this._activeInstances.push(instance);

    if (options.x !== undefined) instance._x = options.x;
    if (options.y !== undefined) instance._y = options.y;
    if (options.minDistance !== undefined) instance._minDistance = options.minDistance;
    if (options.maxDistance !== undefined) instance._maxDistance = options.maxDistance;
    if (options.spatial !== undefined) instance._spatial = options.spatial;
    if (options.x !== undefined || options.y !== undefined) instance._spatial = true;

    instance.restart();
    return instance;
  }

  _getInstance() {
    return this._pool.acquire();
  }

  returnInstance(instance) {
    this._returnInstance(instance);
  }

  _returnInstance(instance) {
    if (instance._returned) return;
    instance._returned = true;
    instance._reset();

    let idx = instance._poolIndex;
    if (idx < 0 || idx >= this._activeInstances.length || this._activeInstances[idx] !== instance) {
      idx = this._activeInstances.indexOf(instance);
      if (idx === -1) return;
    }

    const last = this._activeInstances.length - 1;
    if (idx !== last) {
      this._activeInstances[idx] = this._activeInstances[last];
      this._activeInstances[idx]._poolIndex = idx;
    }
    this._activeInstances.pop();

    if (this._pool.release(instance)) {
      instance.destroy();
    }
  }

  _updateAllVolumes() {
    for (let i = 0; i < this._activeInstances.length; i++) {
      this._activeInstances[i]._applyVolume();
    }
  }

  _getGroupVolume() {
    return this._getVolumeForGroup(this._groupName);
  }

  _getVolumeForGroup(groupName) {
    if (!this._manager) return 1;
    if (this._backend && this._backend.supportsGroupGain) return 1;
    return this._manager.getVolumeForGroup(groupName);
  }

  _getMasterVolume() {
    if (!this._manager) return 1;
    if (this._backend && this._backend.supportsGroupGain) return 1;
    return this._manager.effectiveMasterVolume;
  }

  _checkNotDestroyed() {
    if (this._destroyed) throw new Error("Cannot use destroyed Sound");
  }

  _pauseAll() {
    for (let i = 0; i < this._activeInstances.length; i++) {
      const inst = this._activeInstances[i];
      if (!inst.paused) {
        inst._pausedByManager = true;
        inst.pause();
      }
    }
  }

  _resumeAll() {
    for (let i = 0; i < this._activeInstances.length; i++) {
      const inst = this._activeInstances[i];
      if (inst._pausedByManager) {
        inst._pausedByManager = false;
        inst._applyVolume();
        inst._playback.play();
      }
    }
  }

  _stopAll() {
    while (this._activeInstances.length > 0) {
      const inst = this._activeInstances[this._activeInstances.length - 1];
      inst.stop();
      this._returnInstance(inst);
    }
  }

  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;
    this._stopAll();
    this._pool.drain();
    if (this._ownsBackend && this._backend) {
      this._backend.destroy();
    }
    this._asset = null;
    this._manager = null;
  }
}
