export class Binding {
  get type() { return "binding"; }

  evaluate(deviceRegistry) {
    return 0;
  }

  serialize() {
    return { type: this.type };
  }

  static deserialize(data) {
    return new Binding();
  }
}
