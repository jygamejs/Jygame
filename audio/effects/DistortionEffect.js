import { AudioEffect } from "./AudioEffect.js";

export class DistortionEffect extends AudioEffect {
  constructor(options = {}) {
    super();
    this._amount = options.amount ?? 0.5;
    this._curve = null;
    this._node = null;
    this._sampleRate = 44100;
  }

  _generateCurve(sampleRate) {
    const samples = sampleRate || 44100;
    const curve = new Float32Array(samples);
    const k = this._amount * 100;
    for (let i = 0; i < samples; i++) {
      const x = (i / samples) * 2 - 1;
      curve[i] = ((3 + k) * x) / (Math.PI + k * Math.abs(x));
    }
    this._curve = curve;
  }

  connect(inputNode, context) {
    this._node = context.createWaveShaper();
    this._sampleRate = context.sampleRate;
    if (!this._curve) this._generateCurve(this._sampleRate);
    this._node.curve = this._curve;
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
    if (key === "amount") {
      this._curve = null;
      this._generateCurve(this._sampleRate);
      if (this._node) this._node.curve = this._curve;
    }
  }
}
