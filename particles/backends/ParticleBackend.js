export class ParticleBackend {
  constructor() {
    if (new.target === ParticleBackend) {
      throw new Error("ParticleBackend is abstract — extend it");
    }
  }

  emit(count, initializer, emitter) {}
  emitOne(initializer) { return null; }
  update(dt) {}
  render(ctx) {}
  clear() {}
  destroy() {}
  warmup(count) {}

  addModifier(modifier, priority) {}
  removeModifier(modifier) {}
  clearModifiers() {}
  get modifierCount() { return 0; }

  setCollisionProvider(provider) {}

  get sortMode() { return "none"; }
  set sortMode(value) {}
  get sortFunction() { return null; }
  set sortFunction(value) {}
  get sortEveryFrame() { return false; }
  set sortEveryFrame(value) {}
  get sortedParticleCount() { return 0; }
  _markSortDirty() {}

  get activeCount() { return 0; }
  get freeCount() { return 0; }
  get capacity() { return 0; }
  get peakActive() { return 0; }
  get peakCapacity() { return 0; }
  get peakFree() { return 0; }
  get totalCreated() { return 0; }
  get isEmpty() { return true; }
  get hasParticles() { return false; }
  get particles() { return []; }
}
