export class AnimationSystem {
  constructor() {
    this._animations = new Set();
    this._elapsed = 0;
  }

  animate(target, property, from, to, duration = 120, easing = "easeOut") {
    this._animations.add({
      target, property, from, to, duration, easing, elapsed: 0,
    });
  }

  tick(dt) {
    this._elapsed += dt || 0;
    for (const anim of this._animations) {
      anim.elapsed += dt || 0;
      const t = Math.min(anim.elapsed / anim.duration, 1);
      const eased = this._ease(t, anim.easing);
      anim.target[anim.property] = anim.from + (anim.to - anim.from) * eased;
      if (t >= 1) {
        this._animations.delete(anim);
      }
    }
  }

  _ease(t, type) {
    switch (type) {
      case "easeOut": return 1 - Math.pow(1 - t, 3);
      case "easeIn": return t * t * t;
      case "linear": return t;
      default: return 1 - Math.pow(1 - t, 3);
    }
  }

  onInput(event) {
    return false;
  }
}
