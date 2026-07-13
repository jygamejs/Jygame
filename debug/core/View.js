export class View {
  static metadata = { title: null, icon: null };

  constructor(contextProvider) {
    this._getContext = contextProvider;
  }

  get ctx() {
    return this._getContext();
  }

  get metadata() {
    return this.constructor.metadata;
  }

  update(dt) {}

  render(ctx, rect) {}

  onActivate() {}
  onDeactivate() {}

  dispose() {}

  handleInput(event, rect) { return false; }
}
