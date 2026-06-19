import { KeyframeTrack } from "./KeyframeTrack.js";

/*
 * CONFLICT BEHAVIOR
 *
 * AnimationModifier does not blend with other modifiers.
 * If multiple modifiers write the same particle property,
 * priority order determines the final value — the modifier
 * executed last wins.
 *
 * For example, ScaleModifier and AnimationModifier both
 * writing to "size" will not accumulate or average. Use
 * mutually exclusive priority ranges or toggle enabled
 * to switch between them.
 *
 * ROTATION INTERACTION
 *
 * Animate rotationSpeed when you want rotational motion.
 * The ParticleSystem integrates rotationSpeed every frame:
 *   rotation += rotationSpeed * dt
 *
 * Animate rotation when you want direct timeline control
 * (interpolation mode with RotationModifier or keyframes
 * with AnimationModifier).
 *
 * Using both simultaneously on the same particle may
 * produce overriding behavior depending on priority.
 */

const VALID_PROPERTIES = new Set([
  "size", "alpha", "rotation", "rotationSpeed",
  "vx", "vy", "ax", "ay",
  "originX", "originY", "width", "height"
]);

export class AnimationModifier {
  constructor({ property, keyframes, easing = "linear", priority } = {}) {
    if (!property || !VALID_PROPERTIES.has(property)) {
      throw new Error(
        "AnimationModifier property must be one of: " +
        Array.from(VALID_PROPERTIES).join(", ")
      );
    }

    this._track = new KeyframeTrack(keyframes, easing);
    this._property = property;
    this._keyframes = keyframes;
    this._easing = easing;
    this.enabled = true;
    this.priority = priority;
  }

  onEmit(particle, ctx) {
    const state = ctx.stateStore.ensure(particle, this, () => ({ segment: 0 }));
    state.segment = 0;
    particle[this._property] = this._track.evaluate(0, 0);
  }

  update(particle, dt, ctx) {
    const state = ctx.stateStore.get(particle, this);
    if (!state) return;
    let seg = state.segment;
    seg = this._track.advance(particle.ageRatio, seg);
    state.segment = seg;
    particle[this._property] = this._track.evaluate(particle.ageRatio, seg);
  }

  toJSON() {
    const obj = { type: "AnimationModifier", property: this._property, keyframes: this._keyframes };
    if (this._easing !== "linear") obj.easing = this._easing;
    if (this.priority !== undefined) obj.priority = this.priority;
    return obj;
  }

  static fromJSON(data) {
    return new AnimationModifier(data);
  }
}

