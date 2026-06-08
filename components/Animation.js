export class Animation {
  constructor() {
    this.animations = new Map();
    this.current = null;
    this.frame = 0;
    this.elapsed = 0;
    this.playing = false;
    this._callback = null;
  }

  add(name, clip) {
    this.animations.set(name, clip);
    return this;
  }

  play(name) {
    this.current = name;
    this.frame = 0;
    this.elapsed = 0;
    this.playing = true;
  }

  pause() {
    this.playing = false;
  }

  resume() {
    if (this.current) {
      this.playing = true;
    }
  }

  stop() {
    this.playing = false;
    this.frame = 0;
    this.elapsed = 0;
  }

  onComplete(cb) {
    this._callback = cb;
    return this;
  }
}
