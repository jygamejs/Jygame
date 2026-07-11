export class Panel {
  constructor(id, title, context, options = {}) {
    this.id = id;
    this.title = title;
    this.ctx = context;
    this.icon = options.icon || null;
    this.minWidth = options.minWidth || 200;
    this.minHeight = options.minHeight || 100;
    this.defaultWidth = options.defaultWidth || 400;
    this.defaultHeight = options.defaultHeight || 300;
    this.canCollapse = options.canCollapse ?? true;
    this.canClose = options.canClose ?? true;
    this.canFloat = options.canFloat ?? true;
    this._rect = { x: 0, y: 0, width: this.defaultWidth, height: this.defaultHeight };
    this._visible = false;
  }

  get rect() {
    return this._rect;
  }

  set rect(r) {
    this._rect = r;
  }

  update(data) {
  }

  render(ctx) {
  }

  onShow() {
    this._visible = true;
  }

  onHide() {
    this._visible = false;
  }

  onDestroy() {
  }

  onRegister() {
  }
}
