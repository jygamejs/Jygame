import { Input } from "../input/Input.js";
import { Scene as EcsScene } from "../ecs/scene/Scene.js";
import { DefaultWorldBuilder } from "../ecs/bootstrap/DefaultWorldBuilder.js";
import { CanvasContext } from "../ecs/render/CanvasContext.js";
import { Camera } from "../view/Camera.js";
import { View } from "../view/View.js";
import { Viewport } from "../view/Viewport.js";
import { RenderConfig } from "../view/RenderConfig.js";
import { Renderer } from "../renderer/index.js";
import { Sprite } from "../display/Sprite.js";
import { Text } from "../display/Text.js";
import { InputContext } from "../input/actions/InputContext.js";
import { ActionMap } from "../input/actions/ActionMap.js";
import { BindingCompiler } from "../input/facade/BindingCompiler.js";
import { ComboMap } from "../input/ComboMap.js";
import { RenderQueue } from "../ecs/render/RenderQueue.js";
import { AudioListener } from "../audio/AudioListener.js";
import { ParticleEffect } from "../particles/ParticleEffect.js";

const _VIEW_COMPONENTS = Symbol("scene.views");

export class Scene extends EcsScene {
  constructor() {
    super();
    this.dom = null;
    // A scene's UI root is created lazily so that constructing a Scene needs
    // no DOM at all. The element comes from the Game's host when the scene is
    // mounted; standalone scenes (tests, headless tools) fall back to the
    // ambient document if one exists, and simply have no root if it does not.
    this._root = null;
    this._cleanups = [];
    this._entered = false;
    this._exited = false;
    this._context = null;
    this.blocksUpdateBelow = true;
    this.blocksRenderBelow = false;
    this._prevDefaultWorld = null;
    this._prevDefaultParticleWorld = null;
    this._prevDefaultTextWorld = null;
    this._inputContext = null;
    this._actionMap = null;
    this._inputPriority = 0;

    this[_VIEW_COMPONENTS] = [];
    this._listener = new AudioListener();
    this._ready = false;
    this._initPromise = null;
    this._initError = null;
  }

  get ready() {
    return this._ready;
  }

  // The scene's DOM layer. Created on first access from the host that owns
  // this scene, so it costs nothing for scenes that never render UI.
  get root() {
    if (!this._root) this._root = this._createRoot();
    return this._root;
  }

  set root(el) {
    this._root = el;
  }

  _createRoot() {
    const el = this._context
      ? this._context.createElement("div")
      : (typeof document !== "undefined" ? document.createElement("div") : null);
    if (el) {
      el.style.position = "absolute";
      el.style.inset = "0";
    }
    return el;
  }

  _createWorld() {
    return DefaultWorldBuilder.createDefault();
  }

  on(target, event, handler) {
    target.addEventListener(event, handler);
    this._cleanups.push(() => target.removeEventListener(event, handler));
  }

  onSwipe(cb) {
    this._cleanups.push(Input.onSwipe(cb));
  }

  onTap(cb) {
    this._cleanups.push(Input.onTap(cb));
  }

  // Any other recognized gesture — long press, pinch, rotate, drag, pan,
  // double tap, or a direction-specific swipe. The callback receives the
  // GestureEvent. Unsubscribed automatically when the scene exits.
  onGesture(type, cb) {
    this._cleanups.push(Input.gestures.on(type, cb));
  }

  cleanup(fn) {
    this._cleanups.push(fn);
  }

  get views() {
    return this[_VIEW_COMPONENTS];
  }

  get view() {
    return this[_VIEW_COMPONENTS][0] || null;
  }

  get listener() {
    return this._listener;
  }

  addView(view) {
    this[_VIEW_COMPONENTS].push(view);
  }

  removeView(view) {
    const idx = this[_VIEW_COMPONENTS].indexOf(view);
    if (idx !== -1) this[_VIEW_COMPONENTS].splice(idx, 1);
  }

  clearViews() {
    this[_VIEW_COMPONENTS].length = 0;
  }

  replaceView(oldView, newView) {
    const idx = this[_VIEW_COMPONENTS].indexOf(oldView);
    if (idx !== -1) {
      this[_VIEW_COMPONENTS][idx] = newView;
    }
  }

  _ensureDefaultView() {
    if (this[_VIEW_COMPONENTS].length === 0) {
      const vp = this._context
        ? new Viewport(0, 0, this._context.width, this._context.height)
        : new Viewport(0, 0, 800, 600);
      const cam = new Camera(vp.width * 0.5, vp.height * 0.5);
      this[_VIEW_COMPONENTS].push(new View({ camera: cam, viewport: vp }));
    }
  }

  _getSortedViews() {
    return [...this[_VIEW_COMPONENTS]].sort((a, b) => a.order - b.order);
  }

  async _initScene() {
    this._ensureCreated();

    if (this._context) {
      const immediate = this._context.renderer
        ? this._context.renderer.immediateContext
        : this._context.ctx;
      this._world.setResource(CanvasContext, immediate);

      if (this._context.renderer) {
        this._world.setResource(Renderer, this._context.renderer);
      }

      if (this._context.imageSmoothing !== undefined) {
        this._world.setResource("imageSmoothing.default", this._context.imageSmoothing ? 1 : 0);
      }

      // Tells the queue whether to carry per-command interpolation endpoints.
      // With interpolation off those writes are pure overhead.
      const queue = this._world.getResource(RenderQueue);
      if (queue) queue.interpolation = this._context.interpolation !== false;

      if (this._context.inputSystem && this._context.inputSystem.contextStack) {
        this._compileInputBindings();
        this._compileCombos();
        if (!this._actionMap) {
          this._actionMap = new ActionMap();
        }
        if (!this._comboMap) {
          this._comboMap = new ComboMap();
        }
        this._inputContext = new InputContext(
          this.constructor.name,
          this._actionMap,
          { priority: this._inputPriority, comboMap: this._comboMap },
        );
        this._context.inputSystem.contextStack.push(this._inputContext);
      }

      this._ensureDefaultView();
      if (this.view && this.view.camera) {
        this._world.setResource(Camera, this.view.camera);
      }
      if (this.view && this.view.viewport) {
        this._world.setResource(Viewport, this.view.viewport);
      }
      if (this.view && this.view.config) {
        this._world.setResource(RenderConfig, this.view.config);
      }
      if (!this._world.getResource(AudioListener)) {
        this._world.setResource(AudioListener, this._listener);
      }
    }

    this._prevDefaultWorld = Sprite._defaultWorld;
    Sprite._defaultWorld = this._world;
    this._prevDefaultParticleWorld = ParticleEffect._defaultWorld;
    ParticleEffect._defaultWorld = this._world;
    this._prevDefaultTextWorld = Text._defaultWorld;
    Text._defaultWorld = this._world;

    const result = this.onEnter();
    if (result && typeof result.then === "function") {
      await result;
    }

    this._ready = true;
  }

  _compileInputBindings() {
    const rawInput = this.input;
    if (!rawInput || typeof rawInput !== "object" || Array.isArray(rawInput)) return;

    if (rawInput instanceof InputContext) return;

    const compiler = new BindingCompiler();
    const map = compiler.compile(rawInput);

    this._actionMap = map;
  }

  _compileCombos() {
    const rawCombo = this.combo;
    if (!rawCombo || typeof rawCombo !== "object" || Array.isArray(rawCombo)) return;
    const cmap = new ComboMap();
    for (const [name, def] of Object.entries(rawCombo)) {
      try {
        if (Array.isArray(def)) {
          cmap.set(name, { sequence: def });
        } else if (def && typeof def === "object" && Array.isArray(def.sequence)) {
          cmap.set(name, { sequence: def.sequence, within: def.within, consume: def.consume });
        }
      } catch (e) {
        if (typeof console !== "undefined") console.warn(`[jygame] invalid combo "${name}": ${e.message}`);
      }
    }
    this._comboMap = cmap;
  }

  // Re-point the world's renderer-bound resources at the game's current
  // renderer. Called by Game when a renderer fallback swaps the renderer
  // after the scene has already entered.
  _refreshRendererResources() {
    if (!this._context || !this._world) return;
    const renderer = this._context.renderer;
    if (!renderer) return;
    const immediate = renderer.immediateContext;
    if (immediate) {
      this._world.setResource(CanvasContext, immediate);
    }
    this._world.setResource(Renderer, renderer);
  }

  // Blends the render positions already captured in the RenderQueue toward
  // the current tick. The queue stores previous and current tick positions
  // per command, so this is a single allocation-free pass over pooled
  // objects — no ECS work, and nothing in the world is mutated.
  _applyRenderAlpha(alpha) {
    const w = this._world;
    if (!w) return;
    const queue = w.getResource(RenderQueue);
    if (queue) queue.applyAlpha(alpha);
  }

  enter() {
    if (this._entered) {
      throw new Error("Scene.enter() called more than once");
    }
    this._entered = true;

    this.world;

    // `_initScene()` is async (it awaits `onEnter()`), but `enter()` is called
    // from a synchronous mount path. Without this catch a throwing `onEnter`
    // becomes an unhandled rejection: `_ready` stays false forever and the
    // frame loop silently skips update and render, so the developer sees a
    // black screen and no error. Capture it, report it loudly, and keep it
    // queryable via `scene.initError`.
    this._initPromise = this._initScene().catch((err) => {
      this._initError = err ?? new Error("Scene initialization failed");
      console.error(
        `[jygame] Scene "${this.constructor.name}" failed to initialize; ` +
        "it will not update or render.",
        this._initError,
      );
      try {
        this.onError(this._initError);
      } catch (hookErr) {
        console.error("[jygame] Scene.onError() threw while handling an init failure.", hookErr);
      }
      return this._initError;
    });
  }

  // Resolves once `onEnter()` has settled. Resolves to `undefined` on success
  // and to the Error on failure — useful for tests and for callers that want
  // to await a scene transition rather than poll `ready`.
  whenReady() {
    return this._initPromise || Promise.resolve();
  }

  get failed() {
    return this._initError != null;
  }

  get initError() {
    return this._initError || null;
  }

  // Override to handle a failed `onEnter()` (show an error screen, retry,
  // fall back to another scene). The failure is logged either way.
  onError(err) {}

  exit() {
    if (this._exited) {
      throw new Error("Scene.exit() called more than once");
    }
    this._exited = true;

    this.onExit();

    for (const fn of this._cleanups) {
      try { fn(); } catch (err) { console.error(err); }
    }
    this._cleanups = [];

    if (this._context && this._context.inputSystem && this._context.inputSystem.contextStack) {
      if (this._inputContext) {
        this._context.inputSystem.contextStack.pop(this._inputContext.name);
        this._inputContext = null;
      }
    }

    if (Sprite._defaultWorld === this._world) {
      Sprite._defaultWorld = this._prevDefaultWorld;
    }

    if (ParticleEffect._defaultWorld === this._world) {
      ParticleEffect._defaultWorld = this._prevDefaultParticleWorld;
    }

    if (Text._defaultWorld === this._world) {
      Text._defaultWorld = this._prevDefaultTextWorld;
    }

    if (this._world) {
      this._world.clearSystems();
      this._world.clearResources();
      this._world = null;
    }

    this[_VIEW_COMPONENTS] = [];
  }

  pause() {}
  resume() {}
  update(dt) {}

  render(ctx) {
    // user-overridable hook — runs before the World renders retained objects
  }

  // Foreground canvas hook. Runs after the World's retained objects, so it
  // draws above them, but still in screen space — the camera does not
  // transform it. Use it for canvas overlays that must sit on top of the
  // action. Anything that belongs to the DOM layer goes in renderDOM().
  renderUI(ctx) {}

  // The scene's DOM layer. Returns an HTML string patched into `root`, a
  // transparent overlay above the canvas. On-canvas interface drawing belongs
  // in renderUI(ctx), not here.
  renderDOM() {}

  pushScene(scene) {
    if (this._context) this._context.pushScene(scene);
  }

  popScene() {
    if (this._context) this._context.popScene();
  }

  replaceScene(scene) {
    if (this._context) this._context.replaceScene(scene);
  }

  switchScene(scene) {
    if (this._context) this._context.switchScene(scene);
  }

  transitionTo(scene) {
    this.switchScene(scene);
  }
}
