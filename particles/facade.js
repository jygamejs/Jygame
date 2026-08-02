import { ParticleAsset } from "./ParticleAsset.js";
import { ParticleEffect } from "./ParticleEffect.js";
import { BackendResolver } from "./EngineResolvers.js";
import { StorageResolver } from "./storage/StorageResolver.js";
import { Renderer } from "../renderer/index.js";

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

// A context source tells the backend resolver where to find a WebGL2 context.
// Precedence: explicit `renderer` / `gl` options, then the active world's
// `Renderer` resource (registered by the Scene from `game.renderer`).
function _resolveContextSource({ renderer, gl }) {
  if (renderer) return renderer;
  if (gl) return gl;
  const world = ParticleEffect._defaultWorld;
  if (world && typeof world.getResource === "function") {
    const r = world.getResource(Renderer);
    if (r) return r;
  }
  return null;
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
  gl,
} = {}) {
  const storage = StorageResolver.createDefault();
  const contextSource = _resolveContextSource({ renderer, gl });
  const backendInstance = BackendResolver.resolve({ backend, storage, renderer: contextSource });

  const asset = new ParticleAsset({
    capacity: _estimateCapacity(rate, lifetime, capacity),
    modifiers,
    shape,
    emitter: { rate },
    initializer: lifetime !== undefined
      ? _createLifetimeInitializer(lifetime, initializer)
      : initializer,
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
