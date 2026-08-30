// What a Scene is allowed to know about the engine running it.
//
// A scene used to hold a raw `_game` back-pointer and reach through it for
// whatever it needed — including private fields like `_imageSmoothing` and
// `_interpolation`. That fused two unrelated dependencies into one reference:
//
//   * engine services — renderer, input, dimensions, element creation
//   * stack control   — push / pop / replace / switch
//
// They have different lifetimes and different reasons to change, and together
// they meant a Scene could not exist without a whole Game. The context splits
// them: services are read-through accessors that always reflect the live
// engine (the renderer can be swapped mid-run by a fallback), and transitions
// are explicit methods.
//
// `game` stays available for user code that legitimately wants the Game, but
// nothing inside Scene depends on it.
export class SceneContext {
  constructor({
    host = null,
    rendererHost = null,
    inputSystem = null,
    stack = null,
    uiLayer = null,
    imageSmoothing = true,
    interpolation = true,
    backgroundColor = null,
    game = null,
  } = {}) {
    this._host = host;
    this._rendererHost = rendererHost;
    this._inputSystem = inputSystem;
    this._stack = stack;
    this._uiLayer = uiLayer;
    this._imageSmoothing = imageSmoothing;
    this._interpolation = interpolation;
    this._backgroundColor = backgroundColor;
    this.game = game;
  }

  // ─── Services ───────────────────────────────────────

  get host() { return this._host; }
  get inputSystem() { return this._inputSystem; }
  get uiLayer() { return this._uiLayer; }

  // Read through to the renderer host rather than caching: a failed renderer
  // can be swapped for a fallback at any point, and scenes that cached the
  // old instance would keep drawing into a dead context.
  get renderer() { return this._rendererHost ? this._rendererHost.renderer : null; }
  get ctx() { return this._rendererHost ? this._rendererHost.ctx : null; }
  get width() { return this._rendererHost ? this._rendererHost.width : 0; }
  get height() { return this._rendererHost ? this._rendererHost.height : 0; }

  get imageSmoothing() { return this._imageSmoothing; }
  get interpolation() { return this._interpolation; }
  get backgroundColor() { return this._backgroundColor; }
  set backgroundColor(v) { this._backgroundColor = v; }

  createElement(tag) {
    if (this._host) return this._host.createElement(tag);
    if (typeof document !== "undefined") return document.createElement(tag);
    return null;
  }

  // ─── Transitions ────────────────────────────────────

  pushScene(scene) { if (this._stack) this._stack.push(scene); }
  popScene() { if (this._stack) this._stack.pop(); }
  replaceScene(scene) { if (this._stack) this._stack.replace(scene); }
  switchScene(scene) { if (this._stack) this._stack.switch(scene); }
  peekScene() { return this._stack ? this._stack.peek() : null; }
}
