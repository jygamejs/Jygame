import { ParticleAsset } from "./ParticleAsset.js";
import { ParticleEffect } from "./ParticleEffect.js";
import { BackendResolver } from "./EngineResolvers.js";
import { StorageResolver } from "./storage/StorageResolver.js";
import { Renderer } from "../renderer/index.js";
import { VisualType } from "../visuals/ParticleVisual.js";
import { DefaultParticleVisual } from "../visuals/DefaultParticleVisual.js";

const DEFAULT_CAPACITY = 256;
const CAPACITY_SAFETY_MULTIPLIER = 1.5;

function _resolvePosition(position) {
  if (position == null) return { x: 0, y: 0 };
  if (Array.isArray(position)) {
    return { x: position[0] ?? 0, y: position[1] ?? 0 };
  }
  return { x: position.x ?? 0, y: position.y ?? 0 };
}

function _createVisualInitializer(visual) {
  if (!visual) return null;
  if (visual.visualType === VisualType.CIRCLE) {
    const radius = visual.radius;
    if (radius != null) {
      return (p) => {
        p.visualType = VisualType.CIRCLE;
        // radius overrides size if provided; otherwise size drives diameter
        if (radius != null) p.size = radius * 2;
      };
    }
    return (p) => {
      p.visualType = VisualType.CIRCLE;
    };
  }
  if (visual.visualType === VisualType.TEXTURE) {
    return (p) => {
      p.visualType = VisualType.TEXTURE;
      p.texture = visual.texture;
      p.width = visual.width;
      p.height = visual.height;
      p.originX = visual.originX;
      p.originY = visual.originY;
      p.frameX = visual.frameX;
      p.frameY = visual.frameY;
      p.frameWidth = visual.frameWidth;
      p.frameHeight = visual.frameHeight;
    };
  }
  // DEFAULT
  return (p) => {
    p.visualType = VisualType.DEFAULT;
  };
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

function _combineInitializers(visualInit, lifetimeInit, userInit) {
  return (p, i, emitter) => {
    if (visualInit) visualInit(p, i, emitter);
    if (lifetimeInit) lifetimeInit(p, i, emitter);
    if (userInit) userInit(p, i, emitter);
  };
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
  visual,
} = {}) {
  const storage = StorageResolver.createDefault();
  const contextSource = _resolveContextSource({ renderer, gl });
  const backendInstance = BackendResolver.resolve({ backend, storage, renderer: contextSource });

  const effectiveVisual = visual ?? new DefaultParticleVisual();
  const visualInit = _createVisualInitializer(effectiveVisual);
  const lifetimeInit = lifetime !== undefined ? _createLifetimeInitializer(lifetime, null) : null;
  const combinedInit = _combineInitializers(visualInit, lifetimeInit, initializer);

  const asset = new ParticleAsset({
    capacity: _estimateCapacity(rate, lifetime, capacity),
    modifiers,
    shape,
    visual: effectiveVisual,
    emitter: { rate },
    initializer: combinedInit,
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
