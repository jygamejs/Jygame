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
import { InputContext } from "../input/actions/InputContext.js";
import { ActionMap } from "../input/actions/ActionMap.js";
import { BindingCompiler } from "../input/facade/BindingCompiler.js";
import { Transform } from "../ecs/components/Transform.js";
import { RenderSystem } from "../ecs/systems/RenderSystem.js";
import { AudioListener } from "../audio/AudioListener.js";
import { ParticleEffect } from "../particles/ParticleEffect.js";

const _VIEW_COMPONENTS = Symbol("scene.views");

export class Scene extends EcsScene {
  constructor() {
    super();
    this.dom = null;
    this.root = document.createElement("div");
    this.root.style.position = "absolute";
    this.root.style.inset = "0";
    this._cleanups = [];
    this._entered = false;
    this._exited = false;
    this._game = null;
    this.blocksUpdateBelow = true;
    this.blocksRenderBelow = false;
    this._prevDefaultWorld = null;
    this._prevDefaultParticleWorld = null;
    this._inputContext = null;
    this._actionMap = null;
    this._inputPriority = 0;

    this[_VIEW_COMPONENTS] = [];
    this._listener = new AudioListener();
    this._ready = false;
  }

  get ready() {
    return this._ready;
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
      const vp = this._game
        ? new Viewport(0, 0, this._game.width, this._game.height)
        : new Viewport(0, 0, 800, 600);
      const cam = new Camera(vp.width * 0.5, vp.height * 0.5);
      this[_VIEW_COMPONENTS].push(new View({ camera: cam, viewport: vp }));
    }
  }

  _getSortedViews() {
    return [...this[_VIEW_COMPONENTS]].sort((a, b) => a.order - b.order);
  }

  async _initScene() {
    if (!this._created) {
      this.onCreate();
      this._created = true;
    }

    if (this._game) {
      const immediate = this._game.renderer
        ? this._game.renderer.immediateContext
        : this._game.ctx;
      this._world.setResource(CanvasContext, immediate);

      if (this._game.renderer) {
        this._world.setResource(Renderer, this._game.renderer);
      }

      if (this._game._imageSmoothing !== undefined) {
        this._world.setResource("imageSmoothing.default", this._game._imageSmoothing ? 1 : 0);
      }

      if (this._game.inputSystem && this._game.inputSystem.contextStack) {
        this._compileInputBindings();
        if (!this._actionMap) {
          this._actionMap = new ActionMap();
        }
        this._inputContext = new InputContext(
          this.constructor.name,
          this._actionMap,
          { priority: this._inputPriority },
        );
        this._game.inputSystem.contextStack.push(this._inputContext);
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

  // Re-point the world's renderer-bound resources at the game's current
  // renderer. Called by Game when a renderer fallback swaps the renderer
  // after the scene has already entered.
  _refreshRendererResources() {
    if (!this._game || !this._world) return;
    const renderer = this._game.renderer;
    if (!renderer) return;
    const immediate = renderer.immediateContext;
    if (immediate) {
      this._world.setResource(CanvasContext, immediate);
    }
    this._world.setResource(Renderer, renderer);
  }

  // Rebuilds the RenderQueue from the world's current transforms. Called by
  // the Game right after interpolation has blended transform positions, so
  // the renderers draw the smoothed positions instead of the pre-interpolation
  // values the RenderSystem captured during world.update().
  _populateRenderQueue() {
    const w = this._world;
    if (!w || typeof w.runSystem !== "function") return;
    w.runSystem(RenderSystem);
  }

  enter() {
    if (this._entered) {
      throw new Error("Scene.enter() called more than once");
    }
    this._entered = true;

    this.world;

    this._initScene();
  }

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

    if (this._game && this._game.inputSystem && this._game.inputSystem.contextStack) {
      if (this._inputContext) {
        this._game.inputSystem.contextStack.pop(this._inputContext.name);
        this._inputContext = null;
      }
    }

    if (Sprite._defaultWorld === this._world) {
      Sprite._defaultWorld = this._prevDefaultWorld;
    }

    if (ParticleEffect._defaultWorld === this._world) {
      ParticleEffect._defaultWorld = this._prevDefaultParticleWorld;
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

  interpolate(alpha) {
    const w = this._world;
    if (!w) return;

    const tid = w.registry.getId(Transform);
    if (tid === null) return;

    if (!this._interpQuery || this._interpWorld !== w) {
      this._interpQuery = w.queryEngine.createQuery({ all: [tid] });
      this._interpWorld = w;
    }

    if (!this._savedPositions) this._savedPositions = new Map();
    this._savedPositions.clear();

    const tables = w.queryEngine.getTables(this._interpQuery);
    for (let i = 0; i < tables.length; i++) {
      const table = tables[i];
      const count = table.count;
      if (count === 0) continue;

      const xCol = table.getColumn(tid, "x");
      const yCol = table.getColumn(tid, "y");
      const prevXCol = table.getColumn(tid, "_prevX");
      const prevYCol = table.getColumn(tid, "_prevY");
      const ids = table.entityIds;
      if (!xCol || !yCol || !prevXCol || !prevYCol || !ids) continue;

      for (let r = 0; r < count; r++) {
        const prevX = prevXCol[r];
        const prevY = prevYCol[r];
        const currX = xCol[r];
        const currY = yCol[r];

        if (prevX === 0 && prevY === 0 && (currX !== 0 || currY !== 0)) continue;

        const interpX = prevX + (currX - prevX) * alpha;
        const interpY = prevY + (currY - prevY) * alpha;
        if (interpX !== currX || interpY !== currY) {
          this._savedPositions.set(ids[r], { x: currX, y: currY });
          xCol[r] = interpX;
          yCol[r] = interpY;
        }
      }
    }
  }

  restoreTransforms() {
    const w = this._world;
    if (!w || !this._savedPositions || this._savedPositions.size === 0) return;

    const tid = w.registry.getId(Transform);
    if (tid === null) return;

    for (const [entity, pos] of this._savedPositions) {
      if (!w.entityManager.isAlive(entity)) continue;
      const loc = w.entityManager.getLocation(entity);
      if (!loc) continue;
      const table = w.archetypeSystem.getTableById(loc.archetype);
      if (!table) continue;
      const xCol = table.getColumn(tid, "x");
      const yCol = table.getColumn(tid, "y");
      if (xCol) xCol[loc.row] = pos.x;
      if (yCol) yCol[loc.row] = pos.y;
    }
  }

  render(ctx) {
    // user-overridable hook — runs before the World renders retained objects
  }

  renderUI() {}

  pushScene(scene) {
    if (this._game) this._game.pushScene(scene);
  }

  popScene() {
    if (this._game) this._game.popScene();
  }

  replaceScene(scene) {
    if (this._game) this._game.replaceScene(scene);
  }

  switchScene(scene) {
    if (this._game) this._game.switchScene(scene);
  }

  transitionTo(scene) {
    this.switchScene(scene);
  }
}
