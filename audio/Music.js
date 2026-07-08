export class Music {
  constructor(asset, manager, options = {}) {
    this._asset = asset;
    this._manager = manager;
    this._backend = manager._backend;
    this._playback = null;
    this._volume = 1;
    this._fadeVolume = 1;
    this._loop = true;
    this._fadeState = null;
    this._fadeDuration = 0;
    this._fadeTimer = 0;
    this._fadeFrom = 1;
    this._fadeTo = 1;
    this._destroyed = false;
    this._effectChain = options.effectChain || null;
  }

  get effects() { return this._effectChain; }

  get volume() { return this._volume; }
  set volume(value) {
    if (this._destroyed) return;
    this._volume = Math.max(0, Math.min(1, value));
    this._updateVolume();
  }

  get loop() { return this._loop; }
  set loop(value) {
    this._loop = value;
    if (this._playback) this._playback.loop = value;
  }

  get isPlaying() {
    return !!this._playback && !this._playback.paused && !this._playback.ended;
  }

  get isPaused() {
    return !!this._playback && this._playback.paused && !this._playback.ended;
  }

  get currentTime() { return this._playback ? this._playback.currentTime : 0; }
  set currentTime(value) { if (this._playback) this._playback.currentTime = Math.max(0, value); }

  get duration() { return this._playback ? this._playback.duration : 0; }

  play() {
    if (this._destroyed) throw new Error("Cannot use destroyed Music");
    if (this._playback) {
      if (this._playback.paused) {
        this._playback.play();
        this._playback.loop = this._loop;
        if (this._onPlay) this._onPlay();
        return this;
      }
      if (this._playback.ended) {
        this.stop();
      } else {
        return this;
      }
    }
    this._playback = this._backend.createPlayback(this._asset, this._effectChain, "music");
    this._playback.loop = this._loop;
    this._playback.onEnded(() => {});
    this._updateVolume();
    this._playback.play();
    if (this._onPlay) this._onPlay();
    return this;
  }

  pause() { if (this._playback) this._playback.pause(); }

  stop() {
    this._cancelFade();
    if (this._playback) {
      this._playback.stop();
      this._playback.destroy();
      this._playback = null;
    }
  }

  fadeIn(seconds) {
    if (!this._playback) this.play();
    if (!this._playback) return;
    this._fadeVolume = 0;
    this._updateVolume();
    this._fadeState = "fadeIn";
    this._fadeDuration = Math.max(0.001, seconds);
    this._fadeTimer = 0;
    this._fadeFrom = 0;
    this._fadeTo = 1;
  }

  fadeOut(seconds) {
    if (!this._playback) return;
    this._fadeState = "fadeOut";
    this._fadeDuration = Math.max(0.001, seconds);
    this._fadeTimer = 0;
    this._fadeFrom = this._fadeVolume;
    this._fadeTo = 0;
  }

  startFadeIn(seconds) {
    this.fadeIn(seconds);
  }

  crossFade(other, seconds) {
    if (this._destroyed || other._destroyed) return;
    if (!other._playback) other.play();
    if (!this._playback) this.play();
    const dur = Math.max(0.001, seconds);
    this.fadeOut(dur);
    other.fadeIn(dur);
  }

  update(dt) {
    if (this._destroyed || !this._fadeState) return;
    this._fadeTimer += dt;
    const t = Math.min(this._fadeTimer / this._fadeDuration, 1);
    this._fadeVolume = this._fadeFrom + (this._fadeTo - this._fadeFrom) * t;
    this._updateVolume();
    if (t >= 1) this._onFadeComplete();
  }

  _updateVolume() {
    if (!this._playback) return;
    const transitionVol = this._manager ? this._manager.transitionVolume : 1;
    const groupVol = this._backend.supportsGroupGain ? 1 : (this._manager ? this._getGroupVolume() : 1);
    const masterVol = this._backend.supportsGroupGain ? 1 : (this._manager ? this._manager.effectiveMasterVolume : 1);
    this._playback.volume = this._volume * this._fadeVolume * groupVol * masterVol * transitionVol;
  }

  _getGroupVolume() {
    return this._manager.getVolumeForGroup("music");
  }

  _cancelFade() {
    this._fadeState = null;
    this._fadeDuration = 0;
    this._fadeTimer = 0;
  }

  _onFadeComplete() {
    if (this._fadeState === "fadeOut" || this._fadeState === "crossFade") {
      this.stop();
    } else if (this._fadeState === "fadeIn") {
      this._fadeVolume = 1;
      this._updateVolume();
    }
    this._cancelFade();
  }

  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;
    this.stop();
    this._manager = null;
    this._asset = null;
  }
}
