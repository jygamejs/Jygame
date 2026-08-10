import { Animation } from "../components/Animation.js";
import { Renderable } from "../components/Renderable.js";

// Playback modes. Stored per-entity in the Animation component's `mode`
// column (u8) so the AnimationSystem can read them without indirection.
//
//   NORMAL  → the persistent request. Loops per the clip's own `loop` flag.
//   ONCE    → a temporary one-shot. Always finite, never loops.
//   QUEUED  → a queued entry currently playing. Always finite, never loops.
//   FORCED  → a higher-priority state (death, stun, hit). Loops per the
//             clip unless the caller overrides it.
export const PlaybackMode = Object.freeze({
  NORMAL: 0,
  ONCE: 1,
  QUEUED: 2,
  FORCED: 3,
});

// Loop override values stored in the Animation component's `loop` column.
export const LoopOverride = Object.freeze({
  RESPECT_CLIP: 0, // use clip.loop
  NON_LOOP: 1,     // force finite playback
  LOOP: 2,         // force infinite playback
});

// Per-entity playback intent: names and the queue live here because they are
// strings/arrays and cannot live in the typed-array Animation component. The
// hot per-frame playback state (mode, loop, clipId, elapsed, ...) lives in the
// Animation component columns.
export class AnimationPlaybackState {
  constructor() {
    this.current = null;   // name of the clip currently owning playback
    this.requested = null; // latest persistent normal request
    this.queue = [];       // pending queued clip names
    this.hold = false;     // forced animation: remain on last frame when done
  }
}

// World resource: entity → AnimationPlaybackState.
export class AnimationPlayback {
  constructor() {
    this._byEntity = new Map();
  }

  get(entity) {
    let state = this._byEntity.get(entity);
    if (!state) {
      state = new AnimationPlaybackState();
      this._byEntity.set(entity, state);
    }
    return state;
  }

  has(entity) {
    return this._byEntity.has(entity);
  }

  delete(entity) {
    this._byEntity.delete(entity);
  }

  get size() {
    return this._byEntity.size;
  }
}

export function resolveClipId(registry, entity, name) {
  if (!registry) return null;
  const keyed = registry.getId(`${entity}:${name}`);
  if (keyed !== null && keyed !== undefined) return keyed;
  const bare = registry.getId(name);
  return bare === null || bare === undefined ? null : bare;
}

// Shared playback starter used by both the Sprite facade (on play()/playOnce()/
// queue()) and the AnimationSystem (when advancing after a clip completes).
// Returns true when the clip resolved; playback state and the Animation
// component are always updated either way so `current`/`playing` stay coherent.
export function startPlayback(world, entity, registry, state, name, mode, opts = {}) {
  if (!state) return false;

  state.current = name;
  state.hold = !!opts.hold;

  if (!world.has(entity, Animation)) return false;

  const anim = world.get(entity, Animation);
  anim.frameIndex = 0;
  anim.elapsed = 0;
  anim.isPlaying = 1;
  anim.speed = 1;
  anim.mode = mode;
  anim.loop = opts.loop === undefined ? LoopOverride.RESPECT_CLIP : opts.loop;

  const clipId = resolveClipId(registry, entity, name);
  if (clipId === null) return false;
  anim.clipId = clipId;

  if (world.has(entity, Renderable)) {
    const clip = registry.getById(clipId);
    if (clip && clip.frames && clip.frames.length) {
      world.get(entity, Renderable).image = clip.frames[0];
    }
  }
  return true;
}
