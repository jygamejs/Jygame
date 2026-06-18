export class ParticleStateManager {
  constructor() {
    this._states = new Map();
  }

  ensure(particle, key, create) {
    let entry = this._states.get(particle);
    if (!entry) {
      entry = new Map();
      this._states.set(particle, entry);
    }
    let state = entry.get(key);
    if (!state) {
      state = create();
      entry.set(key, state);
    }
    return state;
  }

  get(particle, key) {
    const entry = this._states.get(particle);
    return entry ? entry.get(key) : undefined;
  }

  release(particle) {
    this._states.delete(particle);
  }

  releaseAll() {
    this._states.clear();
  }
}
