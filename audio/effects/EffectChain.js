export function connectEffectChain(effects, inputNode, context) {
  let currentNode = inputNode;
  for (let i = 0; i < effects.length; i++) {
    const nextNode = effects[i].connect(currentNode, context);
    if (!nextNode || typeof nextNode.connect !== "function") {
      console.warn("EffectChain: effect at index " + i + " returned an invalid node; chain may be broken");
      break;
    }
    currentNode = nextNode;
  }
  return currentNode;
}

export function disconnectEffectChain(effects) {
  for (let i = 0; i < effects.length; i++) {
    effects[i].disconnect();
  }
}

export class EffectChain {
  constructor() {
    this._effects = [];
    this._onChange = null;
  }

  set onChange(callback) { this._onChange = callback; }

  add(effect) {
    this._effects.push(effect);
    if (this._onChange) this._onChange();
    return this;
  }

  remove(effect) {
    const idx = this._effects.indexOf(effect);
    if (idx !== -1) {
      this._effects.splice(idx, 1);
      effect.disconnect();
      if (this._onChange) this._onChange();
    }
    return this;
  }

  clear() {
    if (this._effects.length > 0) {
      for (const effect of this._effects) effect.disconnect();
      this._effects.length = 0;
      if (this._onChange) this._onChange();
    }
    return this;
  }

  get length() { return this._effects.length; }

  forEach(fn) { this._effects.forEach(fn); }
}
