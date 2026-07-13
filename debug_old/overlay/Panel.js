export class Panel {
  static metadata = { id: null, title: null, icon: null, group: null, pinned: false, searchable: true };

  constructor(id, title, context, options = {}) {
    const meta = this.constructor.metadata;
    this.id = id ?? meta?.id;
    this.title = title ?? meta?.title;
    this.ctx = context;
    this.icon = options.icon || meta?.icon || null;
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

  get metadata() {
    return this.constructor.metadata;
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
