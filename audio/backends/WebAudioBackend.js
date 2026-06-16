import { AudioBackend } from "./AudioBackend.js";
import { connectEffectChain, disconnectEffectChain } from "../effects/EffectChain.js";

class WebAudioPlayback {
  constructor(context, buffer, groupGain, effectChain, groupName, groupGains) {
    this._context = context;
    this._buffer = buffer;
    this._groupGain = groupGain;
    this._groupName = groupName || "master";
    this._groupGains = groupGains || null;
    this._effectChain = effectChain || null;

    this._gain = context.createGain();
    this._gain.gain.value = 1;
    this._gain.connect(groupGain);

    this._panner = null;

    this._source = null;

    this._volume = 1;
    this._muted = false;
    this._loop = false;
    this._offset = 0;
    this._startedAt = 0;
    this._paused = true;
    this._ended = false;
    this._onEnded = null;
    this._stopRequested = false;
    this._destroyed = false;
  }

  _connectSourceToChain(source) {
    if (this._effectChain && this._effectChain.length > 0) {
      const output = connectEffectChain(this._effectChain, source, this._context);
      output.connect(this._gain);
    } else {
      source.connect(this._gain);
    }
  }

  _createSource() {
    const source = this._context.createBufferSource();
    source.buffer = this._buffer;
    source.loop = this._loop;

    if (this._panner) {
      source.connect(this._panner);
      this._connectSourceToChain(this._panner);
    } else {
      this._connectSourceToChain(source);
    }

    source.onended = () => {
      if (this._stopRequested) {
        this._stopRequested = false;
        return;
      }
      this._ended = true;
      this._paused = true;
      if (this._onEnded) this._onEnded();
    };

    return source;
  }

  play() {
    if (this._destroyed) return;
    if (!this._paused && !this._ended) return;

    this._ended = false;
    this._paused = false;
    this._stopRequested = false;
    this._source = this._createSource();
    const startOffset = Math.min(this._offset, this._buffer.duration);
    this._source.start(0, startOffset);
    this._startedAt = this._context.currentTime;
  }

  pause() {
    if (this._destroyed || this._paused) return;
    if (!this._source) return;

    this._offset += this._context.currentTime - this._startedAt;
    this._paused = true;
    this._stopRequested = true;
    this._stopSource();
  }

  stop() {
    if (this._destroyed) return;
    this._offset = 0;
    this._paused = true;
    this._ended = false;
    this._stopRequested = true;
    this._stopSource();
  }

  _stopSource() {
    if (this._source) {
      try { this._source.stop(); } catch (e) {}
      this._source.disconnect();
      this._source = null;
    }
  }

  get currentTime() {
    if (this._destroyed) return 0;
    if (this._paused) return Math.min(this._offset, this._buffer.duration);
    const elapsed = this._context.currentTime - this._startedAt;
    const pos = this._offset + elapsed;
    if (this._loop) {
      return pos % this._buffer.duration;
    }
    return Math.min(pos, this._buffer.duration);
  }

  set currentTime(value) {
    if (this._destroyed) return;
    this._offset = Math.max(0, Math.min(value, this._buffer.duration));
    if (!this._paused) {
      this._stopRequested = true;
      this._stopSource();
      this._source = this._createSource();
      this._source.start(0, this._offset);
      this._startedAt = this._context.currentTime;
    }
  }

  get duration() {
    return this._buffer ? this._buffer.duration : 0;
  }

  get loop() { return this._loop; }
  set loop(value) {
    this._loop = value;
    if (this._source) this._source.loop = value;
  }

  get volume() { return this._volume; }
  set volume(value) {
    if (this._destroyed) return;
    this._volume = Math.max(0, Math.min(1, value));
    this._gain.gain.value = this._muted ? 0 : this._volume;
  }

  get muted() { return this._muted; }
  set muted(value) {
    if (this._destroyed) return;
    this._muted = value;
    this._gain.gain.value = value ? 0 : this._volume;
  }

  get paused() { return this._paused; }
  get ended() { return this._ended; }

  onEnded(callback) {
    this._onEnded = callback;
  }

  setPosition(x, y) {
    if (this._destroyed) return;
    if (!this._panner) {
      this._panner = this._context.createPanner();
      this._panner.distanceModel = "linear";
      this._panner.refDistance = 1e8;
      this._panner.maxDistance = 1e8;
      this._panner.rolloffFactor = 0;

      if (this._source) {
        this._source.disconnect();
        this._source.connect(this._panner);
        this._connectSourceToChain(this._panner);
      }
    }
    this._panner.positionX.value = x;
    this._panner.positionY.value = y;
    this._panner.positionZ.value = 0;
  }

  setGroup(groupName) {
    if (this._destroyed || groupName === this._groupName) return;
    const newGain = this._groupGains && this._groupGains.get(groupName);
    if (!newGain) return;
    this._groupName = groupName;
    if (this._gain) {
      try { this._gain.disconnect(); } catch (e) {}
      this._gain.connect(newGain);
    }
    this._groupGain = newGain;
  }

  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;
    this._stopRequested = true;
    this._stopSource();
    this._onEnded = null;
    if (this._panner) {
      this._panner.disconnect();
      this._panner = null;
    }
    if (this._effectChain) {
      disconnectEffectChain(this._effectChain);
    }
    this._gain.disconnect();
    this._gain = null;
    this._groupGain = null;
    this._context = null;
    this._buffer = null;
  }
}

export class WebAudioBackend extends AudioBackend {
  constructor() {
    super();
    this._context = null;
    this._masterGain = null;
    this._groupGains = new Map();
    this._groupChainOutputs = new Map();
    this._masterChainOutput = null;
    this._unlocked = false;
    this._unlockHandler = null;
  }

  get supportsGroupGain() { return true; }

  _ensureContext() {
    if (this._context) return;
    this._context = new AudioContext();
    this._masterGain = this._context.createGain();
    this._masterGain.gain.value = 1;
    this._masterGain.connect(this._context.destination);

    this._ensureGroupGain("master");
  }

  _ensureGroupGain(name) {
    if (this._groupGains.has(name)) return this._groupGains.get(name);
    const gain = this._context.createGain();
    gain.gain.value = 1;
    gain.connect(this._masterGain);
    this._groupGains.set(name, gain);
    return gain;
  }

  createPlayback(asset, effectChain, groupName) {
    this._ensureContext();
    const name = groupName || "master";
    this._ensureGroupGain(name);
    return new WebAudioPlayback(this._context, asset, this._groupGains.get(name), effectChain || null, name, this._groupGains);
  }

  _connectGroupEffectChain(groupName, chain) {
    if (!this._context) return;
    const gainNode = this._groupGains.get(groupName);
    if (!gainNode) return;

    try { gainNode.disconnect(); } catch (e) {}

    const oldOutput = this._groupChainOutputs.get(groupName);
    if (oldOutput && oldOutput !== gainNode) {
      try { oldOutput.disconnect(); } catch (e) {}
    }

    if (chain && chain.length > 0) {
      const output = connectEffectChain(chain, gainNode, this._context);
      output.connect(this._masterGain);
      this._groupChainOutputs.set(groupName, output);
    } else {
      gainNode.connect(this._masterGain);
      this._groupChainOutputs.set(groupName, gainNode);
    }
  }

  _connectMasterEffectChain(chain) {
    if (!this._context) return;

    try { this._masterGain.disconnect(); } catch (e) {}

    if (this._masterChainOutput && this._masterChainOutput !== this._masterGain) {
      try { this._masterChainOutput.disconnect(); } catch (e) {}
    }

    if (chain && chain.length > 0) {
      const output = connectEffectChain(chain, this._masterGain, this._context);
      output.connect(this._context.destination);
      this._masterChainOutput = output;
    } else {
      this._masterGain.connect(this._context.destination);
      this._masterChainOutput = this._masterGain;
    }
  }

  setGroupVolume(name, value) {
    const gain = this._ensureGroupGain(name);
    gain.gain.value = Math.max(0, Math.min(1, value));
  }

  setMasterVolume(value) {
    if (!this._context) return;
    this._masterGain.gain.value = Math.max(0, Math.min(1, value));
  }

  setListenerPosition(x, y) {
    if (!this._context) return;
    if (this._context.listener.positionX) {
      this._context.listener.positionX.value = x;
      this._context.listener.positionY.value = y;
      this._context.listener.positionZ.value = 0;
    }
  }

  unlock() {
    if (this._unlocked) return;
    this._unlocked = true;
    this._unlockHandler = () => {
      if (this._context && this._context.state === "suspended") {
        this._context.resume();
      }
    };
    window.addEventListener("pointerdown", this._unlockHandler, { once: true });
    window.addEventListener("keydown", this._unlockHandler, { once: true });
    if (this._context && this._context.state === "suspended") {
      this._context.resume();
    }
  }

  suspend() {
    if (this._context && this._context.state === "running") {
      return this._context.suspend();
    }
  }

  resume() {
    if (this._context && this._context.state === "suspended") {
      return this._context.resume();
    }
  }

  destroy() {
    if (this._unlockHandler) {
      window.removeEventListener("pointerdown", this._unlockHandler);
      window.removeEventListener("keydown", this._unlockHandler);
      this._unlockHandler = null;
    }
    for (const gain of this._groupGains.values()) {
      gain.disconnect();
    }
    this._groupGains.clear();
    this._groupChainOutputs.clear();
    this._masterChainOutput = null;
    if (this._masterGain) {
      this._masterGain.disconnect();
      this._masterGain = null;
    }
    if (this._context) {
      this._context.close();
      this._context = null;
    }
  }
}
