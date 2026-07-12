import { Processor, registerProcessor } from "./Processor.js";

export class InvertProcessor extends Processor {
  get type() { return "invert"; }

  process(value) {
    return 1 - value;
  }

  serialize() {
    return { type: this.type };
  }

  static deserialize(data) {
    return new InvertProcessor();
  }
}

registerProcessor("invert", InvertProcessor);
