import { AudioEffect } from "./AudioEffect.js";

export class CompressorEffect extends AudioEffect {
  constructor(options = {}) {
    super();
    this._threshold = options.threshold ?? -24;
    this._ratio = options.ratio ?? 12;
    this._attack = options.attack ?? 0.003;
    this._release = options.release ?? 0.25;
    this._knee = options.knee ?? 30;
    this._node = null;
  }

  connect(inputNode, context) {
    this._node = context.createDynamicsCompressor();
    this._node.threshold.value = this._threshold;
    this._node.ratio.value = this._ratio;
    this._node.attack.value = this._attack;
    this._node.release.value = this._release;
    this._node.knee.value = this._knee;
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
    if (key === "threshold") this._node.threshold.value = this._threshold;
    if (key === "ratio") this._node.ratio.value = this._ratio;
    if (key === "attack") this._node.attack.value = this._attack;
    if (key === "release") this._node.release.value = this._release;
    if (key === "knee") this._node.knee.value = this._knee;
  }
}
