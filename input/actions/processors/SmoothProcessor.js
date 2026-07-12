import { Processor, registerProcessor } from "./Processor.js";

export class SmoothProcessor extends Processor {
  constructor(samples = 4) {
    super();
    this._samples = Math.max(1, samples);
    this._buffer = [];
  }

  get type() { return "smooth"; }
  get samples() { return this._samples; }

  process(value) {
    this._buffer.push(value);
    if (this._buffer.length > this._samples) {
      this._buffer.shift();
    }
    let sum = 0;
    for (let i = 0; i < this._buffer.length; i++) {
      sum += this._buffer[i];
    }
    return sum / this._buffer.length;
  }

  reset() {
    this._buffer = [];
  }

  serialize() {
    return { type: this.type, samples: this._samples };
  }

  static deserialize(data) {
    return new SmoothProcessor(data.samples);
  }
}

registerProcessor("smooth", SmoothProcessor);
