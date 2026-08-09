import { Binding, registerBinding, deserializeBinding } from "./Binding.js";
import { ActionKind } from "../ActionKind.js";

export class CompositeBinding extends Binding {
  constructor(kind, subBindings) {
    super();
    this._kind = kind;
    this._subBindings = subBindings;
    this._lastVector = { x: 0, y: 0 };
  }

  get type() { return "composite"; }
  get kind() { return this._kind; }
  get subBindings() { return this._subBindings; }
  get vector() { return { ...this._lastVector }; }

  evaluate(deviceRegistry) {
    let sx = 0, sy = 0;
    let hasActive = false;

    for (const sb of this._subBindings) {
      const strength = sb.binding.evaluate(deviceRegistry);
      if (strength > 0) {
        if (sb.vector) {
          // Static unit direction scaled by strength (keyboard keys, d-pad).
          sx += sb.vector[0] * strength;
          sy += sb.vector[1] * strength;
        } else {
          // Dynamic vector (e.g. an analog stick) already carries magnitude.
          const dyn = sb.binding.vector;
          if (dyn) {
            sx += dyn.x;
            sy += dyn.y;
          }
        }
        hasActive = true;
      }
    }

    const len = Math.sqrt(sx * sx + sy * sy);
    if (len > 1) {
      sx /= len;
      sy /= len;
    }

    this._lastVector = { x: sx, y: sy };
    return hasActive ? 1 : 0;
  }

  serialize() {
    return {
      ...super.serialize(),
      kind: this._kind,
      subBindings: this._subBindings.map(sb => ({
        vector: sb.vector,
        binding: sb.binding.serialize(),
      })),
    };
  }

  static deserialize(data) {
    const subBindings = data.subBindings.map(sb => ({
      vector: sb.vector,
      binding: deserializeBinding(sb.binding),
    }));
    return new CompositeBinding(data.kind, subBindings);
  }
}

registerBinding("composite", CompositeBinding);
