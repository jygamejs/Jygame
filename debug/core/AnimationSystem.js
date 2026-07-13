export class AnimationSystem {
  constructor() {
    this._animations = new Set();
    this._elapsed = 0;
    this._listeners = new Map();
  }

  animate(target, property, from, to, duration = 120, easing = "easeOut") {
    this._animations.add({
      target, property, from, to, duration, easing, elapsed: 0,
    });
  }

  tick(dt) {
    this._elapsed += dt || 0;
    let changed = false;
    for (const anim of this._animations) {
      anim.elapsed += dt || 0;
      const t = Math.min(anim.elapsed / anim.duration, 1);
      const eased = this._ease(t, anim.easing);
      anim.target[anim.property] = anim.from + (anim.to - anim.from) * eased;
      if (t >= 1) {
        this._animations.delete(anim);
        changed = true;
      }
    }
    if (changed) this._emit("changed");
  }

  _ease(t, type) {
    switch (type) {
      case "easeOut": return 1 - Math.pow(1 - t, 3);
      case "easeIn": return t * t * t;
      case "linear": return t;
      default: return 1 - Math.pow(1 - t, 3);
    }
  }

  on(event, fn) {
    if (!this._listeners.has(event)) this._listeners.set(event, []);
    this._listeners.get(event).push(fn);
    return () => this.off(event, fn);
  }

  off(event, fn) {
    const arr = this._listeners.get(event);
    if (!arr) return;
    const idx = arr.indexOf(fn);
    if (idx >= 0) arr.splice(idx, 1);
  }

  _emit(event, data) {
    const arr = this._listeners.get(event);
    if (arr) arr.slice().forEach(cb => cb(data));
  }
}
