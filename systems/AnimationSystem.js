export class AnimationSystem {
  update(entities, dt) {
    for (const entity of entities) {
      this.updateOne(entity, dt);
    }
  }

  updateOne(entity, dt) {
    const anim = entity.animation;
    if (!anim || !anim.playing) return;
    if (!entity.renderable) return;

    const clip = anim.animations.get(anim.current);
    if (!clip) return;

    const frameTime = 1 / clip.fps;
    anim.elapsed += dt;

    while (anim.elapsed >= frameTime) {
      anim.elapsed -= frameTime;
      anim.frame++;

      if (anim.frame >= clip.frames.length) {
        if (clip.loop) {
          anim.frame = 0;
        } else {
          anim.frame = clip.frames.length - 1;
          anim.playing = false;
          const cb = anim._callback;
          if (cb) {
            anim._callback = null;
            cb();
          }
          break;
        }
      }
    }

    entity.renderable.image = clip.frames[anim.frame];
  }
}

export const animationSystem = new AnimationSystem();
