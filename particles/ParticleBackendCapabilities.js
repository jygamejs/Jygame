export class ParticleBackendCapabilities {
  constructor({
    gpuSimulation = false,
    gpuRendering = false,
    supportsSpawnModifiers = false,
    supportsCollisionModifiers = false,
    maxParticles = Infinity,
    maxModifiers = Infinity,
    supportsStatefulModifiers = false,
    supportsCustomShaders = false,
  } = {}) {
    this.gpuSimulation = gpuSimulation;
    this.gpuRendering = gpuRendering;
    this.supportsSpawnModifiers = supportsSpawnModifiers;
    this.supportsCollisionModifiers = supportsCollisionModifiers;
    this.maxParticles = maxParticles;
    this.maxModifiers = maxModifiers;
    this.supportsStatefulModifiers = supportsStatefulModifiers;
    this.supportsCustomShaders = supportsCustomShaders;
    Object.freeze(this);
  }

  canRun(modifier) {
    const caps = (modifier.constructor && modifier.constructor.capabilities) || {};
    if (caps.spawnsParticles && !this.supportsSpawnModifiers) return false;
    if (caps.requiresCollision && !this.supportsCollisionModifiers) return false;
    if (caps.requiresState && !this.supportsStatefulModifiers) return false;
    return true;
  }

  static get CPU() {
    return new ParticleBackendCapabilities({
      gpuSimulation: false,
      gpuRendering: false,
      supportsSpawnModifiers: true,
      supportsCollisionModifiers: true,
      supportsStatefulModifiers: true,
    });
  }

  static get GPU_RENDER() {
    return new ParticleBackendCapabilities({
      gpuSimulation: false,
      gpuRendering: true,
      supportsSpawnModifiers: true,
      supportsCollisionModifiers: true,
      supportsStatefulModifiers: true,
    });
  }

  static get GPU_FULL() {
    return new ParticleBackendCapabilities({
      gpuSimulation: true,
      gpuRendering: true,
      supportsSpawnModifiers: false,
      supportsCollisionModifiers: false,
      supportsStatefulModifiers: false,
    });
  }
}
