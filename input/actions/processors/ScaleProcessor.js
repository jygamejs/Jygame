import { Processor, registerProcessor } from "./Processor.js";

export class ScaleProcessor extends Processor {
  constructor(factor = 1) {
    super();
    this._factor = factor;
  }

  get type() { return "scale"; }
  get factor() { return this._factor; }

  process(value) {
    return Math.max(0, Math.min(1, value * this._factor));
  }

  serialize() {
    return { type: this.type, factor: this._factor };
  }

  static deserialize(data) {
    return new ScaleProcessor(data.factor);
  }
}

registerProcessor("scale", ScaleProcessor);
