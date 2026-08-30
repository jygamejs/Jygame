import { Clock } from "../time/Clock.js";
import { Input } from "../input/Input.js";
import { InputSystem } from "../input/InputSystem.js";
import { BrowserBackend } from "../input/BrowserBackend.js";
import { ContextStack } from "../input/actions/ContextStack.js";
import { CoordinateSystem } from "../input/CoordinateSystem.js";
import { Keyboard } from "../input/Keyboard.js";
import { Mouse } from "../input/Mouse.js";
import { Gamepad } from "../input/Gamepad.js";
import { PointerManager } from "../input/PointerManager.js";
import { TouchSurface } from "../input/TouchSurface.js";
import { Stylus } from "../input/Stylus.js";
import { TextInput } from "../input/TextInput.js";
import { GestureEngine } from "../input/GestureEngine.js";
import { ActionMap } from "../input/actions/ActionMap.js";
import { ChordBinding } from "../input/actions/ChordBinding.js";
import { KeyCode } from "../input/KeyCode.js";
import { InputContext as ActionInputContext } from "../input/actions/InputContext.js";
import { Diagnostics, MetricCategory, MetricUnit, MetricType, resolveMetricIds }
  from "../debug/index.js";
import { OverlayHost } from "../debug/overlay/OverlayHost.js";
import { enableDebugWorkspace, takeDebugSnapshot, isDebugStreaming } from "../debug/EnableDebugWorkspace.js";
import { RendererHost } from "../renderer/RendererHost.js";
import { BrowserHost } from "./Host.js";
import { SceneStack } from "./SceneStack.js";
import { SceneContext } from "./SceneContext.js";
import { RenderConfig } from "../view/RenderConfig.js";

export class Game {
  // `debug` is opt-in. It installs the diagnostics overlay, the Ctrl+F3
  // workspace binding and the snapshot backend; a shipped game should not be
  // carrying any of that by default.
  constructor({ parent, width = 800, height = 600, fps = 60, maxTicks = 5, autoPause = true, scaleToFit = null, debug = false, interpolation = true, imageSmoothing = true,    renderer = "canvas", host = null, backgroundColor = null } = {}) {
    // Every environment touch goes through the host, so the engine can run
    // under Node with no DOM. Defaults to the real browser.
    this.host = host || new BrowserHost();

    // `parent` accepts a CSS selector or an element; anything else falls back
    // to the host's default parent.
    const container = typeof parent === "string"
      ? (this.host.querySelector(parent) || this.host.defaultParent)
      : (parent && typeof parent.appendChild === "function" ? parent : this.host.defaultParent);

    this._backgroundColor = backgroundColor;

    // Canvas, renderer resolution and the fallback chain live in RendererHost.
    this.rendererHost = new RendererHost({
      host: this.host,
      container,
      renderer,
      width,
      height,
      imageSmoothing,
      backgroundColor: this._backgroundColor,
      onRendererChanged: () => {
        if (this.scenes) this.scenes.refreshRendererResources();
        this._syncInputCanvasRect();
      },
    });

    this.domLayer = this.host.createElement("div");
    this.domLayer.className = "jygame-ui";
    this.domLayer.style.position = "absolute";
    this.domLayer.style.top = "0";
    this.domLayer.style.left = "0";
    this.domLayer.style.width = "100%";
    this.domLayer.style.height = "100%";
    container.appendChild(this.domLayer);

    if (this.host.computedStyle(container).position === "static") {
      container.style.position = "relative";
    }

    this._imageSmoothing = imageSmoothing;
    this.width = width;
    this.height = height;
    this.clock = new Clock(fps, maxTicks);
    this.scenes = new SceneStack({ onSwitch: () => this._onSceneSwitch() });
    this._running = false;
    this._destroyed = false;
    this._paused = false;
    this._lastTime = 0;
    this._rafId = null;
    this._pausedByVisibility = false;
    this._diagnostics = null;
    this._diagIds = null;
    this._diagWorld = null;
    this._debugControls = null;
    this._disabledDebug = null;
    this._debugWarned = false;
    this.debugSession = null;
    this._frameCount = 0;
    // Bound once: rAF is re-armed every frame, so an inline arrow here would
    // allocate a closure per frame for the lifetime of the game.
    this._boundLoop = (t) => this._loop(t);
    this.fps = 60;

    this.inputSystem = new InputSystem();
    const backend = new BrowserBackend(container, this.host);
    this.inputSystem.setBackend(backend);
    this.inputSystem.contextStack = new ContextStack();
    this.inputSystem.coordinateSystem = new CoordinateSystem({
      canvasRect: { x: 0, y: 0, width, height },
      devicePixelRatio: this.host.devicePixelRatio,
    });
    // Wire DOM element and host for cursor / pointer-lock managers
    // Prefer the canvas for cursor/pointerLock so styling stays on the presentation surface
    const canvasEl = this.rendererHost ? this.rendererHost.canvas : null;
    this.inputSystem.domElement = canvasEl || container;
    this.inputSystem.host = this.host;

    // Register standard input devices
    this.inputSystem.devices.register(new Keyboard());
    this.inputSystem.devices.register(new Mouse());
    this.inputSystem.devices.register(new Gamepad(this.host));
    this.inputSystem.devices.register(new PointerManager());
    this.inputSystem.devices.register(new TouchSurface());
    this.inputSystem.devices.register(new Stylus());
    this.inputSystem.devices.register(new TextInput());
    this.inputSystem.devices.register(new GestureEngine(this.inputSystem.devices.get(PointerManager)));

    Input.setSystem(this.inputSystem);

    this._interpolation = interpolation;
    this._debug = debug;
    this._debugActionMap = null;
    if (this._debug) {
      this._debugActionMap = new ActionMap();
      this._debugActionMap.bind("openDebugWorkspace", new ChordBinding(KeyCode.F3, { ctrl: true }));
      const debugCtx = new ActionInputContext("jygame-debug", this._debugActionMap, { priority: -100 });
      this.inputSystem.contextStack.push(debugCtx);
      enableDebugWorkspace(this);
      this._debugOverlay = new OverlayHost(this);
    }

    this._visibilityHandler = null;
    this._focusHandler = () => {
      const kb = this.inputSystem.devices.get(Keyboard);
      if (kb) kb.reset();
    };
    this.host.onWindow("focus", this._focusHandler);
    if (autoPause) {
      this._visibilityHandler = () => {
        if (this._debug && this.debugSession) return;
        if (this.host.hidden) {
          if (!this._paused) {
            this._pausedByVisibility = true;
            this.pause();
          }
        } else {
          if (this._paused && this._pausedByVisibility) {
            this._pausedByVisibility = false;
            this.resume();
          }
        }
      };
      this.host.onDocument("visibilitychange", this._visibilityHandler);
    }

    // The pointer pipeline reports client/viewport coordinates, so the
    // coordinate system needs the canvas's real position on the page. Re-read
    // it whenever layout could move the canvas (mount, resize).
    this._syncInputRectHandler = () => this._syncInputCanvasRect();
    this.host.onWindow("resize", this._syncInputRectHandler);
    this._syncInputCanvasRect();

    // Everything a Scene is allowed to see. Built last so it can close over
    // the fully wired renderer host, input system and stack.
    this.sceneContext = new SceneContext({
      host: this.host,
      rendererHost: this.rendererHost,
      inputSystem: this.inputSystem,
      stack: this.scenes,
      uiLayer: this.domLayer,
      imageSmoothing,
      interpolation,
      backgroundColor: this._backgroundColor,
      game: this,
    });
    // Apply to any worlds already created (none yet, but keeps method useful after setter)
    this._applyBackgroundColor();
    this.scenes.setContext(this.sceneContext);
    this.scenes.setUiLayer(this.domLayer);

    if (scaleToFit) this.rendererHost.enableScaleToFit(scaleToFit);
  }

  // ─── Presentation, delegated to RendererHost ────────

  get renderer() { return this.rendererHost ? this.rendererHost.renderer : null; }
  get ctx() { return this.rendererHost ? this.rendererHost.ctx : null; }
  get canvas() { return this.rendererHost ? this.rendererHost.canvas : null; }
  get _viewport() { return this.rendererHost ? this.rendererHost.viewport : null; }

  get backgroundColor() { return this._backgroundColor; }
  set backgroundColor(v) {
    this._backgroundColor = v;
    if (this.rendererHost) {
      this.rendererHost.backgroundColor = v;
    }
    this._applyBackgroundColor();
  }

  _applyBackgroundColor() {
    const color = this._backgroundColor;
    // Update existing worlds (top scene and any stacked scenes)
    if (this.scenes) {
      for (const scene of this.scenes.all()) {
        if (scene && scene._world) {
          let cfg = scene._world.getResource(RenderConfig);
          if (!cfg) {
            cfg = new RenderConfig({ clearColor: color });
            scene._world.setResource(RenderConfig, cfg);
          } else {
            cfg.clearColor = color;
          }
        }
      }
    }
    // Also ensure future scenes get it via SceneContext
    if (this.sceneContext) {
      this.sceneContext.backgroundColor = color;
    }
  }

  resize(width, height) {
    this.width = width;
    this.height = height;
    this.rendererHost.resize(width, height);
    if (this.inputSystem && this.inputSystem.coordinateSystem) {
      this.inputSystem.coordinateSystem.canvasRect = { x: 0, y: 0, width, height };
    }
    this._syncInputCanvasRect();
  }

  // Keeps the input coordinate system's canvas position in step with the
  // canvas's actual location on the page, so Input.pointer can convert client
  // coords to canvas space. Only x/y are corrected — width/height stay the
  // logical size the game was created/resized to. No-op in headless hosts
  // whose canvas reports a zero rect.
  _syncInputCanvasRect() {
    const canvas = this.canvas;
    const cs = this.inputSystem && this.inputSystem.coordinateSystem;
    if (this.inputSystem && canvas && this.inputSystem.domElement !== canvas) {
      this.inputSystem.domElement = canvas;
    }
    if (!canvas || !cs || typeof canvas.getBoundingClientRect !== "function") return;
    const r = canvas.getBoundingClientRect();
    const prev = cs.canvasRect;
    cs.canvasRect = { x: r.left, y: r.top, width: prev.width, height: prev.height };
  }

  enableDebugWorkspace(backend) {
    if (!this._debug) return;
    enableDebugWorkspace(this, backend);
  }

  // The surface the debug layer is allowed to depend on. Everything debug/
  // needs from a Game goes through here, so Game's private fields are not
  // part of the debug contract and can be refactored freely.
  get debugControls() {
    if (!this._debugControls) {
      const game = this;
      this._debugControls = {
        get diagnostics() { return game._getDiag(); },
        get frameNumber() { return game._frameCount; },
        get scene() { return game.scene; },
        get inputSystem() { return game.inputSystem; },
        get isPaused() { return game._paused; },
        pause: () => game.pause(),
        resume: () => game.resume(),
        stepFrame: () => game.stepFrame(),
        togglePause: () => game.togglePause(),
      };
    }
    return this._debugControls;
  }

  // Convenience alias; the diagnostics instance belongs to the top scene's
  // world and is re-resolved whenever that world changes.
  get diagnostics() {
    return this._getDiag();
  }

  get frameNumber() {
    return this._frameCount;
  }

  // game.debug is never null. When debug is disabled it is a safe no-op
  // facade: methods do nothing and the first user-facing call (show/toggle)
  // warns once, explaining how to enable the overlay — instead of a cryptic
  // "Cannot read properties of null" TypeError killing the game loop.
  get debug() {
    if (!this._debug) return this._disabledDebugFacade();
    if (!this._debugOverlay) {
      this._debugOverlay = new OverlayHost(this);
    }
    return this._debugOverlay;
  }

  _disabledDebugFacade() {
    if (this._disabledDebug) return this._disabledDebug;
    const game = this;
    this._disabledDebug = {
      get visible() { return false; },
      get commands() { return null; },
      get selection() { return null; },
      get context() { return null; },
      show() { this._warnDisabled(); },
      toggle() { this._warnDisabled(); },
      hide() {},
      update() {},
      render() {},
      destroy() {},
      _warnDisabled() {
        if (game._debugWarned) return;
        game._debugWarned = true;
        if (typeof console !== "undefined") {
          console.warn(
            "[jygame] game.debug is disabled. Pass `debug: true` to the Game constructor to enable the debug overlay.",
          );
        }
      },
    };
    return this._disabledDebug;
  }

  get isPaused() {
    return this._paused;
  }

  pause() {
    if (this._paused) return;
    this._paused = true;
    this.scene?.pause?.();
  }

  resume() {
    if (!this._paused) return;
    this._paused = false;
    this._pausedByVisibility = false;
    this.clock.reset();
    this._lastTime = this.host.now();
    this.scene?.resume?.();
  }

  stepFrame() {
    if (!this._paused) {
      this._paused = true;
      this.scene?.pause?.();
    }
    this._doFrame();
  }

  _doFrame() {
    const realDt = this.clock.fixedDt;
    const diag = this._getDiag();
    const mids = this._diagIds;
    // Counted unconditionally: frameNumber is public and the debug snapshot
    // stream keys off it, so it must advance whether or not diagnostics ran.
    const frame = this._frameCount++;
    if (diag) diag.beginFrame(frame, realDt * 1000);
    if (diag && mids && mids.frameTotal >= 0) {
      diag.begin(mids.frameTotal);
      this._frame(diag, 1, realDt);
      diag.end(mids.frameTotal);
    } else {
      this._frame(null, 1, realDt);
    }
    if (diag && mids) {
      if (mids.frameDelta >= 0) diag.recordGauge(mids.frameDelta, realDt * 1000);
      if (mids.frameFps >= 0) diag.recordGauge(mids.frameFps, realDt > 0 ? 1 / realDt : 0);
      diag.endFrame();
    }
  }

  togglePause() {
    this._paused ? this.resume() : this.pause();
  }

  // ─── Scenes, delegated to SceneStack ────────────────

  run(scene) {
    if (this._running) {
      throw new Error("Game.run() called while game is already running. Call destroy() first.");
    }
    this.scenes.start(scene);
    this.clock.reset();
    this._running = true;
    this._lastTime = this.host.now();
    this._rafId = this.host.requestFrame(this._boundLoop);
  }

  pushScene(scene) { this.scenes.push(scene); }
  popScene() { this.scenes.pop(); }
  replaceScene(scene) { this.scenes.replace(scene); }
  switchScene(scene) { this.scenes.switch(scene); }
  peekScene() { return this.scenes.peek(); }
  getScene(index) { return this.scenes.at(index); }
  getScenes() { return this.scenes.all(); }
  containsScene(scene) { return this.scenes.contains(scene); }
  isTopScene(scene) { return this.scenes.isTop(scene); }
  refreshUI() { this.scenes.refreshUI(); }
  patchUI(updates) { this.scenes.patchUI(updates); }

  get sceneCount() { return this.scenes.size; }
  get scene() { return this.scenes.top; }

  // switchScene() tears the whole stack down; pause state belongs to the loop,
  // so the stack calls back here rather than reaching into it.
  _onSceneSwitch() {
    this._paused = false;
    this._pausedByVisibility = false;
    // Clear pending edge state so the incoming scene does not see the press
    // that triggered the switch as its own justPressed.
    this.inputSystem.snapshot();
    this.clock.reset();
    this._lastTime = this.host.now();
  }

  _loop(time) {
    if (!this._running) return;

    if (this._paused) {
      this._rafId = this.host.requestFrame(this._boundLoop);
      return;
    }

    const realDt = (time - this._lastTime) / 1000;
    this._lastTime = time;

    const ticks = this.clock.tick(realDt);
    const diag = this._getDiag();
    const mids = this._diagIds;

    // Counted unconditionally: frameNumber is public and the debug snapshot
    // stream keys off it, so it must advance whether or not diagnostics ran.
    const frame = this._frameCount++;
    if (diag) diag.beginFrame(frame, realDt * 1000);

    if (diag && mids && mids.frameTotal >= 0) {
      diag.begin(mids.frameTotal);
      this._frame(diag, ticks, realDt);
      diag.end(mids.frameTotal);
    } else {
      this._frame(null, ticks, realDt);
    }

    if (diag && mids) {
      if (mids.frameDelta >= 0) diag.recordGauge(mids.frameDelta, realDt * 1000);
      if (mids.frameFps >= 0) diag.recordGauge(mids.frameFps, realDt > 0 ? 1 / realDt : 0);
      diag.endFrame();
    }

    if (this._debug && this._debugOverlay) {
      this._debugOverlay.update(realDt);
    }

    this._rafId = this.host.requestFrame(this._boundLoop);
  }

  // Diagnostics is a per-world resource, and Scene.exit() clears the world's
  // resources and drops the world. Caching the first scene's instance would
  // leave every metric after the first scene transition writing into a dead
  // world's registry. Re-resolve whenever the top scene's world changes.
  _getDiag() {
    if (!this._debug) return null;
    const top = this.scene;
    const world = top ? top._world : null;
    if (world !== this._diagWorld) {
      this._diagWorld = world;
      this._diagnostics = world ? world.getResource(Diagnostics) : null;
      this._diagIds = null;
      this._initDiag();
    }
    return this._diagnostics;
  }

  _initDiag() {
    if (this._diagIds) return;
    if (!this._diagnostics) return;
    this._diagIds = resolveMetricIds(this._diagnostics, {
      frameTotal: "frame.total",
      frameInput: "frame.input",
      frameUpdate: "frame.update",
      frameRender: "frame.render",
      frameCanvas: "frame.canvas",
      frameDelta: "frame.delta",
      frameFps: "frame.fps",
      inputKeyEvents: "input.keyEvents",
      inputPointerEvents: "input.pointerEvents",
      inputActivePointers: "input.activePointers",
    });
  }

  _openDebugWorkspace() {
    const mainUrl = new URL("../debug/workspace/main.js", import.meta.url);
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>JyGame Debug Workspace</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; overflow: hidden; background: #1e1e1e; }
    canvas { display: block; width: 100%; height: 100%; }
  </style>
</head>
<body>
  <canvas id="workspace-canvas"></canvas>
  <script type="module" src="${mainUrl.href}"><\/script>
</body>
</html>`;
    const url = this.host.createObjectURL(html, "text/html");
    this.host.openWindow(url, "jygame-debug-workspace");
  }

  _frameInput() {
    this.inputSystem.update();
    // Fan gesture recognitions out to Scene.onTap/onSwipe listeners. No-op
    // unless something is actually subscribed.
    Input.gestures.poll();
    if (this._debugActionMap) {
      const ws = this._debugActionMap.getState("openDebugWorkspace");
      if (ws && ws.justPressed) this._openDebugWorkspace();
    }
  }

  // The input.* metrics used to be recorded by the legacy InputContext. The
  // modern InputSystem tallies the same counts without depending on the debug
  // layer, and Game forwards them.
  _recordInputMetrics(diag, mids) {
    const sys = this.inputSystem;
    if (!sys) return;
    if (mids.inputKeyEvents >= 0) diag.recordCounter(mids.inputKeyEvents, sys.keyEventCount);
    if (mids.inputPointerEvents >= 0) diag.recordCounter(mids.inputPointerEvents, sys.pointerEventCount);
    if (mids.inputActivePointers >= 0) diag.recordGauge(mids.inputActivePointers, sys.activePointerCount);
  }

  _frameUpdate(ticks) {
    const updateStart = this.scenes.findBlockingIndex("blocksUpdateBelow");
    const top = this.scene;
    if (top && !top.ready) return;
    this.scenes.updating = true;
    try {
      if (ticks > 0) {
        const fixedDt = this.clock.fixedDt;
        for (let i = 0; i < ticks; i++) {
          this.scenes.update(fixedDt, updateStart);
          if (top && top.world) {
            top.world.update(fixedDt);
          }
          // Input is sampled once per frame, but a catch-up frame runs several
          // fixed ticks. Snapshotting after each one collapses the edge state
          // so a single press reads as justPressed in exactly one tick — a
          // jump bound to justPressed cannot fire five times in one frame.
          this.inputSystem.snapshot();
        }
      }
    } finally { this.scenes.updating = false; }
  }

  // The timed regions below use diag.begin/end rather than diag.scope so the
  // frame loop allocates no closures. Diagnostics.endFrame() discards any
  // timer left running if something throws mid-frame.
  _frame(diag, ticks, realDt) {
    const mids = this._diagIds;

    if (diag && mids && mids.frameInput >= 0) {
      diag.begin(mids.frameInput);
      this._frameInput();
      diag.end(mids.frameInput);
    } else { this._frameInput(); }

    if (diag && mids) this._recordInputMetrics(diag, mids);

    if (diag && mids && mids.frameUpdate >= 0) {
      diag.begin(mids.frameUpdate);
      this._frameUpdate(ticks);
      diag.end(mids.frameUpdate);
    } else { this._frameUpdate(ticks); }

    this.scenes.flush();

    // Only pay for a whole-world snapshot while a debug workspace is actually
    // subscribed. isDebugStreaming is a timestamp comparison, so an unwatched
    // game costs nothing here.
    if (this._debug && isDebugStreaming(this)) {
      takeDebugSnapshot(this);
    }

    const top = this.scene;
    if (top && !top.ready) return;

    const alpha = this.clock.alpha;
    const renderStart = this.scenes.findBlockingIndex("blocksRenderBelow");
    if (this._interpolation) {
      this.scenes.applyRenderAlpha(alpha, renderStart);
    }

    // _fallbackRenderer sets this.renderer to null when the whole chain is
    // exhausted. Update still runs — the simulation stays live and the game
    // can recover if a renderer is reinstalled — but there is nothing to
    // draw into, so skip the render half of the frame.
    const renderer = this.renderer;
    if (!renderer) {
      this.rendererHost.warnNoRenderer();
      this.fps += ((1 / Math.max(realDt, 0.001)) - this.fps) * 0.05;
      return;
    }

    renderer.beginFrame();

    if (diag && mids && mids.frameCanvas >= 0) {
      diag.begin(mids.frameCanvas);
      renderer.clear();
      diag.end(mids.frameCanvas);
    } else { renderer.clear(); }

    if (diag && mids && mids.frameRender >= 0) {
      diag.begin(mids.frameRender);
      this.scenes.render(renderer, renderStart);
      diag.end(mids.frameRender);
    } else { this.scenes.render(renderer, renderStart); }

    if (this._debug && this._debugOverlay) {
      this._debugOverlay.render(this.ctx, this.width, this.height);
    }

    renderer.endFrame();

    this.fps += ((1 / Math.max(realDt, 0.001)) - this.fps) * 0.05;
  }

  destroy() {
    this._running = false;
    this._destroyed = true;
    if (this._rafId) this.host.cancelFrame(this._rafId);
    if (this._visibilityHandler) {
      this.host.offDocument("visibilitychange", this._visibilityHandler);
      this._visibilityHandler = null;
    }
    if (this._focusHandler) {
      this.host.offWindow("focus", this._focusHandler);
      this._focusHandler = null;
    }
    if (this._syncInputRectHandler) {
      this.host.offWindow("resize", this._syncInputRectHandler);
      this._syncInputRectHandler = null;
    }
    this.scenes.reset();
    if (this.inputSystem) {
      try { this.inputSystem.destroy(); } catch {}
    }
    Input.setSystem(null);
    Input.gestures.clear();
    if (this.debugSession) { this.debugSession.close(); this.debugSession = null; }
    if (this._debug && this._debugOverlay) this._debugOverlay.destroy();
    // Releases the renderer, the resize observer and the resize listener.
    if (this.rendererHost) this.rendererHost.destroy();
    // Drop the cached per-world Diagnostics so a destroyed game cannot keep
    // the last scene's world alive through this reference.
    this._diagnostics = null;
    this._diagIds = null;
    this._diagWorld = null;
  }
}
