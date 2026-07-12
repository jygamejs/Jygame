import { Binding } from "./Binding.js";
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
        sx += sb.vector[0] * strength;
        sy += sb.vector[1] * strength;
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
      type: this.type,
      kind: this._kind,
      subBindings: this._subBindings.map(sb => ({
        vector: sb.vector,
        binding: sb.binding.serialize(),
      })),
    };
  }

  static deserialize(data) {
    // Requires binding factory to reconstruct — returns raw data for now
    throw new Error("CompositeBinding.deserialize requires a binding registry");
  }
}
