export class TurbulenceModifier {
  static get capabilities() {
    return {
      gpuCompatible: true,
      requiresState: true,
      spawnsParticles: false,
      requiresCollision: false,
      pass: "force",
    };
  }

  constructor({ strength = 50, frequency = 1, priority } = {}) {
    if (!Number.isFinite(strength) || strength < 0) {
      throw new Error("TurbulenceModifier strength must be a non-negative finite number");
    }
    if (!Number.isFinite(frequency) || frequency <= 0) {
      throw new Error("TurbulenceModifier frequency must be a finite number > 0");
    }
    this._strength = strength;
    this._frequency = frequency;
    this._time = 0;
    this.enabled = true;
    this.priority = priority;
  }

  onEmit(acc, ctx) {
    const state = ctx.stateStore.ensure(acc, this, () => ({ seed: 0 }));
    state.seed = Math.random() * 100000;
  }

  beginFrame(dt) {
    this._time += dt * this._frequency;
  }

  update(acc, dt, ctx) {
    const state = ctx.stateStore.get(acc, this);
    if (!state) return;
    const seed = state.seed;
    const t = this._time;
    acc.vx += Math.sin(seed + t) * this._strength * dt;
    acc.vy += Math.cos(seed + t * 1.31) * this._strength * dt;
  }

  toDescriptor() {
    return { type: "turbulence", strength: this._strength, frequency: this._frequency };
  }

  clone() {
    return new TurbulenceModifier({
      strength: this._strength,
      frequency: this._frequency,
      priority: this.priority
    });
  }

  toJSON() {
    const obj = { type: "TurbulenceModifier", strength: this._strength, frequency: this._frequency };
    if (this.priority !== undefined) obj.priority = this.priority;
    return obj;
  }

  static fromJSON(data) {
    return new TurbulenceModifier(data);
  }
}
