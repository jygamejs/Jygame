import { ParticleAsset } from "./ParticleAsset.js";
import { GpuParticleBackend } from "./backends/GpuParticleBackend.js";
import { WebGpuDeviceManager } from "./gpu/webgpu/WebGpuDeviceManager.js";

const DEFAULT_CAPACITY = 256;
const CAPACITY_SAFETY_MULTIPLIER = 1.5;

function _resolvePosition(position) {
  if (position == null) return { x: 0, y: 0 };
  if (Array.isArray(position)) {
    return { x: position[0] ?? 0, y: position[1] ?? 0 };
  }
  return { x: position.x ?? 0, y: position.y ?? 0 };
}

function _createLifetimeInitializer(lifetime, userInitializer) {
  const setLife = Array.isArray(lifetime)
    ? (p) => {
        const min = lifetime[0];
        const max = lifetime[1];
        p.life = min + Math.random() * (max - min);
        p.maxLife = p.life;
      }
    : (p) => {
        p.life = lifetime;
        p.maxLife = lifetime;
      };

  if (userInitializer) {
    return (p, i, emitter) => {
      setLife(p);
      userInitializer(p, i, emitter);
    };
  }
  return setLife;
}

function _estimateCapacity(rate, lifetime, capacity) {
  if (capacity !== undefined && capacity !== null) return capacity;
  if (rate > 0 && lifetime !== undefined) {
    const maxLife = Array.isArray(lifetime) ? lifetime[1] : lifetime;
    return Math.max(DEFAULT_CAPACITY, Math.ceil(rate * maxLife * CAPACITY_SAFETY_MULTIPLIER));
  }
  return DEFAULT_CAPACITY;
}

export function createParticleEffect({
  rate = 0,
  shape,
  modifiers,
  lifetime,
  position,
  follow,
  initializer,
  capacity,
  backend,
  renderer,
  storage,
  renderParticle,
} = {}) {
  let backendInstance;
  if (backend === "cpu") {
    backendInstance = null;
  } else if (backend === "gpu") {
    backendInstance = new GpuParticleBackend({ renderer, storage });
  } else if (backend !== undefined && backend !== null && typeof backend !== "string") {
    backendInstance = backend;
  } else if (backend === undefined && WebGpuDeviceManager.isAvailable() && renderer) {
    backendInstance = new GpuParticleBackend({ renderer, storage });
  }

  const asset = new ParticleAsset({
    capacity: _estimateCapacity(rate, lifetime, capacity),
    modifiers,
    shape,
    emitter: { rate },
    initializer: lifetime !== undefined
      ? _createLifetimeInitializer(lifetime, initializer)
      : initializer,
    renderParticle,
    renderer,
    backend: backendInstance,
  });

  const pos = _resolvePosition(position);
  const effect = asset.spawn({ x: pos.x, y: pos.y });

  if (follow !== undefined && follow !== null) {
    if (typeof follow === "object" && "target" in follow) {
      effect.follow(follow.target, follow.getter);
    } else {
      effect.follow(follow);
    }
  }

  return effect;
}
