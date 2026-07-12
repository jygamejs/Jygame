export class Binding {
  constructor() {
    this._processors = [];
  }

  get type() { return "binding"; }
  get processors() { return this._processors; }

  set processors(list) { this._processors = list; }

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
