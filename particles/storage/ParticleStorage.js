export class ParticleStorage {
  constructor() {
    if (new.target === ParticleStorage) {
      throw new Error("ParticleStorage is abstract and cannot be instantiated directly");
    }
  }

  acquire(...args) {
    throw new Error("ParticleStorage#acquire must be implemented by subclass");
  }

  release(obj) {
    throw new Error("ParticleStorage#release must be implemented by subclass");
  }

  clear() {
    throw new Error("ParticleStorage#clear must be implemented by subclass");
  }

  warmup(count) {
    throw new Error("ParticleStorage#warmup must be implemented by subclass");
  }

  get activeParticles() {
    throw new Error("ParticleStorage#activeParticles must be implemented by subclass");
  }

  get activeCount() {
    throw new Error("ParticleStorage#activeCount must be implemented by subclass");
  }

  get freeCount() {
    throw new Error("ParticleStorage#freeCount must be implemented by subclass");
  }

  get capacity() {
    throw new Error("ParticleStorage#capacity must be implemented by subclass");
  }

  get peakActive() {
    throw new Error("ParticleStorage#peakActive must be implemented by subclass");
  }

  get peakCapacity() {
    throw new Error("ParticleStorage#peakCapacity must be implemented by subclass");
  }

  get peakFree() {
    throw new Error("ParticleStorage#peakFree must be implemented by subclass");
  }

  get totalCreated() {
    throw new Error("ParticleStorage#totalCreated must be implemented by subclass");
  }

  /** Resolve a sort-index to the particle/accessor for rendering. */
  resolveParticle(sortIndex) {
    throw new Error("ParticleStorage#resolveParticle must be implemented by subclass");
  }

  /** Read a numeric field from the particle at the given sort-index. */
  getFieldValue(sortIndex, fieldName) {
    throw new Error("ParticleStorage#getFieldValue must be implemented by subclass");
  }

  /** Write a numeric field to the particle at the given sort-index. */
  setFieldValue(sortIndex, fieldName, value) {
    throw new Error("ParticleStorage#setFieldValue must be implemented by subclass");
  }

  /** Read __jygameSortOrder for the particle at the given sort-index. */
  getSortOrder(sortIndex) {
    throw new Error("ParticleStorage#getSortOrder must be implemented by subclass");
  }

  /**
   * Storage-native physics integration for one particle.
   * Called from the backend hot loop. Bypasses all accessor overhead.
   * @param {object} particle — Particle (ObjectParticleStorage) or SoAParticleAccessor (SoAParticleStorage)
   * @param {number} dt — delta time in seconds
   */
  integrateParticle(particle, dt) {
    throw new Error("ParticleStorage#integrateParticle must be implemented by subclass");
  }
}
