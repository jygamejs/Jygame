const MAX_EMIT_PER_FRAME = 1000;

export class ParticleEmitter {
  constructor({ system, rate = 0, initializer } = {}) {
    if (!system) throw new Error("ParticleEmitter requires a `system` (ParticleSystem)");
    this._system = system;
    this._rate = rate;
    this._initializer = initializer;
    this._accumulator = 0;
    this._emittedCount = 0;
    this._active = false;
  }

  get active() {
    return this._active;
  }

  get emittedCount() {
    return this._emittedCount;
  }

  get rate() {
    return this._rate;
  }

  set rate(value) {
    this._rate = Math.max(0, value);
  }

  get initializer() {
    return this._initializer;
  }

  set initializer(fn) {
    this._initializer = fn;
  }

  start() {
    this._active = true;
  }

  stop() {
    this._active = false;
  }

  toggle() {
    this._active = !this._active;
  }

  emit(count) {
    this._system.emit(count, this._initializer, this);
    this._emittedCount += count;
  }

  emitOne() {
    this.emit(1);
  }

  burst(count) {
    this.emit(count);
  }

  update(dt) {
    if (!this._active) return;
    this._accumulator += this._rate * dt;
    const count = Math.min(Math.floor(this._accumulator), MAX_EMIT_PER_FRAME);
    if (count > 0) {
      this.emit(count);
      this._accumulator -= count;
    }
  }

  reset() {
    this._accumulator = 0;
    this._emittedCount = 0;
  }

  destroy() {
    this.stop();
    this.reset();
  }
}
