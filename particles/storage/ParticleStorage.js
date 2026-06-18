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
}
