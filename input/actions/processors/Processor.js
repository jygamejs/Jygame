export class Processor {
  get type() { return "processor"; }

  process(value, deviceRegistry) {
    return value;
  }

  serialize() {
    return { type: this.type };
  }
}
