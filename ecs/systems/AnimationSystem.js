import { System } from "../core/System.js";
import { Animation } from "../components/Animation.js";
import { Renderable } from "../components/Renderable.js";
import { AnimationCallbacks } from "../animation/AnimationCallbacks.js";
import { AnimationClipRegistry } from "../animation/AnimationClipRegistry.js";
import { AnimationPlayback, LoopOverride, PlaybackMode, startPlayback } from "../animation/AnimationPlayback.js";

export class AnimationSystem extends System {
  static query = { all: [Animation, Renderable] };
  static priority = 1;

  update(ctx, dt) {
    const aid = this._compiled.componentIds.get(Animation);
    const rid = this._compiled.componentIds.get(Renderable);
    if (aid === undefined || rid === undefined) return;

    const registry = ctx.resources.get(AnimationClipRegistry);
    if (!registry) {
      throw new Error(
        "AnimationSystem.update failed: AnimationClipRegistry resource is not set. " +
        "Use world.setResource(AnimationClipRegistry, registry) before updating."
      );
    }

    const callbacks = ctx.resources.get(AnimationCallbacks);
    const playback = ctx.resources.get(AnimationPlayback);

    for (const table of ctx) {
      const count = table.count;
      if (count === 0) continue;

      const clipIdCol = table.getColumn(aid, "clipId");
      const frameIndexCol = table.getColumn(aid, "frameIndex");
      const elapsedCol = table.getColumn(aid, "elapsed");
      const isPlayingCol = table.getColumn(aid, "isPlaying");
      const speedCol = table.getColumn(aid, "speed");
      const modeCol = table.getColumn(aid, "mode");
      const loopCol = table.getColumn(aid, "loop");
      const imageCol = table.getColumn(rid, "image");
      if (!clipIdCol || !frameIndexCol || !elapsedCol || !isPlayingCol || !speedCol || !imageCol) continue;

      const entityIds = table.entityIds;
      for (let r = 0; r < count; r++) {
        if (!isPlayingCol[r]) continue;

        const clip = registry.getById(clipIdCol[r]);
        if (!clip) continue;

        const frameCount = clip.frameCount;
        if (frameCount === 0) {
          isPlayingCol[r] = 0;
          continue;
        }

        elapsedCol[r] += dt * speedCol[r];

        let frame = Math.floor(elapsedCol[r] / clip.frameDuration);

        const loopOverride = loopCol ? loopCol[r] : LoopOverride.RESPECT_CLIP;
        let loops;
        if (loopOverride === LoopOverride.NON_LOOP) loops = false;
        else if (loopOverride === LoopOverride.LOOP) loops = true;
        else loops = clip.loop;

        if (loops) {
          frame %= clip.frameCount;
        } else if (frame >= clip.frameCount) {
          frame = clip.frameCount - 1;
          isPlayingCol[r] = 0;
          frameIndexCol[r] = frame;
          imageCol[r] = clip.frames[frame];

          if (entityIds) {
            const entity = entityIds[r];
            const state = playback && playback.has(entity) ? playback.get(entity) : null;
            const completedName = state ? state.current : null;
            if (state) {
              this._advanceAfterCompletion(ctx, entity, state, modeCol ? modeCol[r] : PlaybackMode.NORMAL);
            }
            if (callbacks) {
              const cb = callbacks.get(entity);
              if (cb) cb(completedName);
            }
          }
          // The transition above may have started a fresh clip (queue advance
          // or resume), which already wrote frameIndex 0 and the first frame.
          // Do not let the trailing writes clobber that.
          continue;
        }

        frameIndexCol[r] = frame;
        imageCol[r] = clip.frames[frame];
      }
    }
  }

  // Transition the playback controller when a finite clip reaches its end.
  // Fires before the completion callback so user callbacks see a consistent
  // state (the queue has already advanced / the persistent request resumed)
  // and cannot corrupt the transition.
  _advanceAfterCompletion(ctx, entity, state, mode) {
    const registry = ctx.resources.get(AnimationClipRegistry);

    if (mode === PlaybackMode.ONCE || mode === PlaybackMode.QUEUED) {
      if (state.queue.length > 0) {
        const next = state.queue.shift();
        startPlayback(ctx.world, entity, registry, state, next, PlaybackMode.QUEUED, {
          loop: LoopOverride.NON_LOOP,
        });
      } else if (state.requested) {
        startPlayback(ctx.world, entity, registry, state, state.requested, PlaybackMode.NORMAL, {
          loop: LoopOverride.RESPECT_CLIP,
        });
      }
    } else if (mode === PlaybackMode.FORCED) {
      if (!state.hold && state.requested) {
        startPlayback(ctx.world, entity, registry, state, state.requested, PlaybackMode.NORMAL, {
          loop: LoopOverride.RESPECT_CLIP,
        });
      }
    } else {
      // A non-looping persistent clip ended.
      if (state.requested && state.requested !== state.current) {
        startPlayback(ctx.world, entity, registry, state, state.requested, PlaybackMode.NORMAL, {
          loop: LoopOverride.RESPECT_CLIP,
        });
      }
    }
  }
}
