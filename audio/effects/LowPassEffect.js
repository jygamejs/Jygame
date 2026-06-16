import { AudioEffect } from "./AudioEffect.js";

export class LowPassEffect extends AudioEffect {
  constructor(options = {}) {
    super();
    this._frequency = options.frequency ?? 2000;
    this._Q = options.Q ?? 1;
    this._node = null;
  }

  connect(inputNode, context) {
    this._node = context.createBiquadFilter();
    this._node.type = "lowpass";
    this._node.frequency.value = this._frequency;
    this._node.Q.value = this._Q;
    inputNode.connect(this._node);
    return this._node;
  }

  disconnect() {
    if (this._node) {
      this._node.disconnect();
      this._node = null;
    }
  }

  _applyParam(key) {
    if (!this._node) return;
    if (key === "frequency") this._node.frequency.value = this._frequency;
    if (key === "Q") this._node.Q.value = this._Q;
  }
}
