import { AudioEffect } from "./AudioEffect.js";

export class ReverbEffect extends AudioEffect {
  constructor(options) {
    super();
    this._impulseResponse = null;
    this._decay = 2;
    this._reverse = false;

    if (options instanceof AudioBuffer) {
      this._impulseResponse = options;
    } else if (options) {
      this._decay = options.decay ?? 2;
      this._reverse = options.reverse ?? false;
    }

    this._node = null;
  }

  _generateIR(context) {
    const rate = context.sampleRate;
    const length = Math.floor(rate * this._decay);
    const buffer = context.createBuffer(2, length, rate);
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);

    for (let i = 0; i < length; i++) {
      const t = i / rate;
      const envelope = Math.exp(-3 * t / this._decay);
      const idx = this._reverse ? length - 1 - i : i;
      left[idx] = (Math.random() * 2 - 1) * envelope;
      right[idx] = (Math.random() * 2 - 1) * envelope;
    }

    let peak = 0;
    for (let i = 0; i < length; i++) {
      const absL = Math.abs(left[i]);
      const absR = Math.abs(right[i]);
      if (absL > peak) peak = absL;
      if (absR > peak) peak = absR;
    }
    if (peak > 0) {
      for (let i = 0; i < length; i++) {
        left[i] /= peak;
        right[i] /= peak;
      }
    }

    return buffer;
  }

  connect(inputNode, context) {
    this._node = context.createConvolver();

    if (!this._impulseResponse) {
      this._impulseResponse = this._generateIR(context);
    }

    this._node.buffer = this._impulseResponse;
    inputNode.connect(this._node);
    return this._node;
  }

  disconnect() {
    if (this._node) {
      this._node.disconnect();
      this._node = null;
    }
  }
}
