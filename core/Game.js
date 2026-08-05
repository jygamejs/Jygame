import { Clock } from "../time/Clock.js";
import { Input } from "../input/Input.js";
import { InputSystem } from "../input/InputSystem.js";
import { BrowserBackend } from "../input/BrowserBackend.js";
import { ContextStack } from "../input/actions/ContextStack.js";
import { CoordinateSystem } from "../input/CoordinateSystem.js";
import { Keyboard } from "../input/Keyboard.js";
import { Mouse } from "../input/Mouse.js";
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
<<<<<<< HEAD
import { RendererResolver } from "../renderer/RendererResolver.js";

const _RENDERER_NAMES = {
  webgpu: "WebGPU",
  webgl: "WebGL",
  canvas: "Canvas",
};

function _rendererLabel(kind) {
  if (!kind) return "Renderer";
  return _RENDERER_NAMES[kind] || kind;
}

function _errorMessage(err) {
  return err && err.message ? err.message : String(err);
}
=======
import { RendererHost } from "../renderer/RendererHost.js";
import { BrowserHost } from "./Host.js";
import { SceneStack } from "./SceneStack.js";
import { SceneContext } from "./SceneContext.js";
>>>>>>> 07d6ec7 (refactor: add host abstraction, scene stack/context and renderer host; make debug streaming opt-in)

export class Game {
  // `debug` is opt-in. It installs the diagnostics overlay, the Ctrl+F3
  // workspace binding and the snapshot backend; a shipped game should not be
  // carrying any of that by default.
<<<<<<< HEAD
  constructor({ parent, width = 800, height = 600, fps = 60, maxTicks = 5, autoPause = true, scaleToFit = null, debug = false, interpolation = true, imageSmoothing = true,    renderer = "canvas" } = {}) {
    // `parent` accepts a CSS selector or an element; anything else falls back
    // to document.body.
    const container = typeof parent === "string"
      ? (document.querySelector(parent) || document.body)
      : (parent && typeof parent.appendChild === "function" ? parent : document.body);
=======
  constructor({ parent, width = 800, height = 600, fps = 60, maxTicks = 5, autoPause = true, scaleToFit = null, debug = false, interpolation = true, imageSmoothing = true,    renderer = "canvas", host = null } = {}) {
    // Every environment touch goes through the host, so the engine can run
    // under Node with no DOM. Defaults to the real browser.
    this.host = host || new BrowserHost();

    // `parent` accepts a CSS selector or an element; anything else falls back
    // to the host's default parent.
    const container = typeof parent === "string"
      ? (this.host.querySelector(parent) || this.host.defaultParent)
      : (parent && typeof parent.appendChild === "function" ? parent : this.host.defaultParent);
>>>>>>> 07d6ec7 (refactor: add host abstraction, scene stack/context and renderer host; make debug streaming opt-in)

    // Canvas, renderer resolution and the fallback chain live in RendererHost.
    this.rendererHost = new RendererHost({
      host: this.host,
      container,
      renderer,
      width,
      height,
      imageSmoothing,
      onRendererChanged: () => { if (this.scenes) this.scenes.refreshRendererResources(); },
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
<<<<<<< HEAD
    this._noRendererWarned = false;
=======
    this._debugControls = null;
    this.debugSession = null;
>>>>>>> 07d6ec7 (refactor: add host abstraction, scene stack/context and renderer host; make debug streaming opt-in)
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

    // Register standard input devices
    this.inputSystem.devices.register(new Keyboard());
    this.inputSystem.devices.register(new Mouse());
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

<<<<<<< HEAD
    if (scaleToFit) {
      const vp = scaleToFit === true
        ? { width, height, padding: 0, element: undefined }
        : scaleToFit;
      const vpW = vp.width ?? width;
      const vpH = vp.height ?? height;
      const pad = vp.padding ?? 0;
      const target = typeof vp.element === "string"
        ? document.querySelector(vp.element) || document.documentElement
        : vp.element || document.documentElement;
      this._viewport = { width: vpW, height: vpH, padding: pad, target };
      this._applyViewport();
      this._resizeObserver = new ResizeObserver(() => this._applyViewport());
      this._resizeObserver.observe(document.documentElement);
      this._resizeHandler = () => this._applyViewport();
      window.addEventListener("resize", this._resizeHandler);
    }
  }

  _applyViewport() {
    const { target } = this._viewport;
    const doc = document.documentElement;
    const style = getComputedStyle(doc);
    const cssScale = style.getPropertyValue("--jygame-scale").trim();
    if (cssScale) {
      const s = parseFloat(cssScale);
      const mv = style.getPropertyValue("--jygame-margin-v").trim();
      target.style.transform = `scale(${s})`;
      target.style.marginTop = mv;
      target.style.marginBottom = mv;
      doc.style.removeProperty("--jygame-scale");
      doc.style.removeProperty("--jygame-margin-v");
      if (this.renderer) this.renderer.resize(this.width, this.height);
      return;
    }
    const { width: vpW, height: vpH, padding: pad } = this._viewport;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const availW = vw - pad * 2;
    const availH = vh - pad * 2;
    const scale = Math.min(1, availW / vpW, availH / vpH);
    const visualH = vpH * scale;
    const marginV = ((vpH - visualH) / 2) * -1;
    target.style.transform = `scale(${scale})`;
    target.style.marginTop = marginV + "px";
    target.style.marginBottom = marginV + "px";
    if (this.renderer) this.renderer.resize(this.width, this.height);
  }

  _initRenderer(instance) {
    let init;
    try {
      init = instance.initialize();
    } catch (err) {
      this._fallbackRenderer(instance, _errorMessage(err));
      return;
    }
    Promise.resolve(init).catch((err) => {
      this._fallbackRenderer(instance, _errorMessage(err));
=======
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
      game: this,
>>>>>>> 07d6ec7 (refactor: add host abstraction, scene stack/context and renderer host; make debug streaming opt-in)
    });
    this.scenes.setContext(this.sceneContext);
    this.scenes.setUiLayer(this.domLayer);

    if (scaleToFit) this.rendererHost.enableScaleToFit(scaleToFit);
  }

  // ─── Presentation, delegated to RendererHost ────────

<<<<<<< HEAD
  _installRenderer(next, index, freshCanvas) {
    if (this._destroyed) {
      this._destroyRenderer(next);
      return;
    }
    this._destroyRenderer(this.renderer);
    if (freshCanvas && freshCanvas !== this.canvas) {
      this._replaceCanvas(freshCanvas);
    }
    this._rendererIndex = index;
    this.renderer = next;
    this._noRendererWarned = false;
    this.ctx = next ? next.immediateContext : null;
    if (this.ctx) {
      this.ctx.imageSmoothingEnabled = this._imageSmoothing;
    }
    this._refreshSceneRendererResources();
    console.info(`[jygame] Using ${_rendererLabel(this._rendererChain[index])} renderer.`);
  }

  _createCanvas() {
    const canvas = document.createElement("canvas");
    canvas.width = this.width;
    canvas.height = this.height;
    if (this.canvas) {
      canvas.className = this.canvas.className;
      canvas.id = this.canvas.id;
      if (typeof canvas.style.cssText === "string" && typeof this.canvas.style.cssText === "string") {
        canvas.style.cssText = this.canvas.style.cssText;
      }
    }
    return canvas;
  }

  _replaceCanvas(fresh) {
    const old = this.canvas;
    const parent = old ? old.parentNode || old.parentElement : null;
    if (parent && old !== fresh) {
      if (typeof parent.replaceChild === "function") {
        try {
          parent.replaceChild(fresh, old);
        } catch (err) {
          /* fall through to append fallback below */
        }
      }
      if (fresh.parentNode !== parent) {
        if (old && old.parentNode === parent && typeof parent.removeChild === "function") {
          parent.removeChild(old);
        }
        if (typeof parent.appendChild === "function") {
          parent.appendChild(fresh);
        }
      }
    }
    this.canvas = fresh;
  }

  _logRendererFallback(kind, reason, toKind) {
    const from = _rendererLabel(kind);
    if (toKind) {
      console.info(
        `[jygame] ${from} unavailable (${reason}) — falling back to ${_rendererLabel(toKind)}.`,
      );
    } else {
      console.warn(`[jygame] ${from} unavailable (${reason}); no fallback renderer available.`);
    }
  }

  // Logged once per outage rather than every frame; _installRenderer clears
  // the latch so a later recovery reports again if it fails again.
  _warnNoRenderer() {
    if (this._noRendererWarned) return;
    this._noRendererWarned = true;
    console.warn(
      "[jygame] No renderer available — the game continues to update but nothing is drawn.",
    );
  }

  _destroyRenderer(renderer) {
    if (renderer && typeof renderer.destroy === "function") {
      try {
        renderer.destroy();
      } catch (err) {
        /* ignore renderer teardown errors during fallback */
      }
    }
  }

  _refreshSceneRendererResources() {
    for (const scene of this._sceneStack) {
      if (scene && typeof scene._refreshRendererResources === "function") {
        scene._refreshRendererResources();
      }
    }
  }
=======
  get renderer() { return this.rendererHost ? this.rendererHost.renderer : null; }
  get ctx() { return this.rendererHost ? this.rendererHost.ctx : null; }
  get canvas() { return this.rendererHost ? this.rendererHost.canvas : null; }
  get _viewport() { return this.rendererHost ? this.rendererHost.viewport : null; }
>>>>>>> 07d6ec7 (refactor: add host abstraction, scene stack/context and renderer host; make debug streaming opt-in)

  resize(width, height) {
    this.width = width;
    this.height = height;
    this.rendererHost.resize(width, height);
    if (this.inputSystem && this.inputSystem.coordinateSystem) {
      this.inputSystem.coordinateSystem.canvasRect = { x: 0, y: 0, width, height };
    }
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

  get debug() {
    if (!this._debug) return null;
    if (!this._debugOverlay) {
      this._debugOverlay = new OverlayHost(this);
    }
    return this._debugOverlay;
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

<<<<<<< HEAD
  _validateScene(scene, methodName) {
    if (scene == null || !(scene instanceof Scene)) {
      throw new Error(`Game.${methodName}(): argument must be a Scene instance, got ${scene === null ? "null" : typeof scene}`);
    }
  }

  _mountScene(scene) {
    if (scene._exited) {
      throw new Error("Scene instance already exited. Create a new scene.");
    }
    if (scene._entered) {
      throw new Error("Scene instance already mounted. Create a new scene.");
    }
    if (scene._game && scene._game !== this) {
      throw new Error("Scene belongs to another Game instance.");
    }
    scene._game = this;
    scene.game = this;
    scene.dom = scene.root;
    this.domLayer.append(scene.root);
    scene.enter();
    this._applyUI(scene);
  }

  _unmountScene(scene) {
    scene.exit();
    scene.root.remove();
  }

  _resetSceneStack() {
    for (const s of this._sceneStack) {
      this._unmountScene(s);
    }
    this._sceneStack = [];
  }

  _applyUI(scene) {
    const html = scene.renderUI();
    if (html !== undefined && html !== null) {
      scene.root.innerHTML = html;
      scene._lastUIHTML = html;
    }
  }

  _findBlockingIndex(prop) {
    const stack = this._sceneStack;
    for (let i = stack.length - 1; i >= 0; i--) {
      if (stack[i][prop]) return i;
    }
    return 0;
  }

  _queueSceneOp(type, ...args) {
    this._sceneOps.push({ type, args });
  }

  _flushSceneOps() {
    while (this._sceneOps.length > 0) {
      const op = this._sceneOps.shift();
      // A deferred op can fail validation that passed when it was queued (see
      // _execPopScene). Report it and keep draining: letting it escape would
      // unwind through _frame into the rAF callback, killing the loop and
      // stranding every remaining op in the queue.
      try {
        switch (op.type) {
          case "push":    this._execPushScene(...op.args); break;
          case "pop":     this._execPopScene(); break;
          case "replace": this._execReplaceScene(...op.args); break;
          case "switch":  this._execSwitchScene(...op.args); break;
        }
      } catch (err) {
        console.error(`[jygame] Deferred scene op "${op.type}" failed.`, err);
      }
    }
  }
=======
  // ─── Scenes, delegated to SceneStack ────────────────
>>>>>>> 07d6ec7 (refactor: add host abstraction, scene stack/context and renderer host; make debug streaming opt-in)

  run(scene) {
    if (this._running) {
      throw new Error("Game.run() called while game is already running. Call destroy() first.");
    }
    this.scenes.start(scene);
    this.clock.reset();
    this._running = true;
<<<<<<< HEAD
    this._lastTime = performance.now();
    this._rafId = requestAnimationFrame(this._boundLoop);
=======
    this._lastTime = this.host.now();
    this._rafId = this.host.requestFrame(this._boundLoop);
>>>>>>> 07d6ec7 (refactor: add host abstraction, scene stack/context and renderer host; make debug streaming opt-in)
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

<<<<<<< HEAD
  replaceScene(scene) {
    this._validateScene(scene, "replaceScene");
    if (this._updating) {
      this._queueSceneOp("replace", scene);
      return;
    }
    this._execReplaceScene(scene);
  }

  _execReplaceScene(scene) {
    if (scene._entered) {
      throw new Error("Game.replaceScene(): scene instance already mounted. Create a new scene.");
    }
    const old = this._sceneStack.pop();
    if (old) {
      this._unmountScene(old);
    }
    this._sceneStack.push(scene);
    this._mountScene(scene);
  }

  popScene() {
    if (this._sceneStack.length <= 1) {
      throw new Error("Cannot pop the last scene");
    }
    if (this._updating) {
      this._queueSceneOp("pop");
      return;
    }
    this._execPopScene();
  }

  _execPopScene() {
    // The guard in popScene() runs at call time, but pops issued during
    // update() are deferred. Two deferred pops against a stack of two would
    // both pass that check and the second would empty the stack, leaving
    // `below` null. Re-check at execution time, when the depth is real.
    if (this._sceneStack.length <= 1) {
      throw new Error("Cannot pop the last scene");
    }
    const top = this._sceneStack.pop();
    this._unmountScene(top);
    const below = this.peekScene();
    if (top.blocksUpdateBelow) {
      below.resume();
    }
    this._applyUI(below);
  }

  peekScene() {
    return this._sceneStack[this._sceneStack.length - 1] || null;
  }

  switchScene(scene) {
    this._validateScene(scene, "switchScene");
    if (this._updating) {
      this._queueSceneOp("switch", scene);
      return;
    }
    this._execSwitchScene(scene);
  }

  _execSwitchScene(scene) {
    if (scene._entered) {
      throw new Error("Game.switchScene(): scene instance already mounted. Create a new scene.");
    }
    this._paused = false;
    this._pausedByVisibility = false;
    this._resetSceneStack();
    this._sceneStack = [scene];
=======
  // switchScene() tears the whole stack down; pause state belongs to the loop,
  // so the stack calls back here rather than reaching into it.
  _onSceneSwitch() {
    this._paused = false;
    this._pausedByVisibility = false;
>>>>>>> 07d6ec7 (refactor: add host abstraction, scene stack/context and renderer host; make debug streaming opt-in)
    // Clear pending edge state so the incoming scene does not see the press
    // that triggered the switch as its own justPressed.
    this.inputSystem.snapshot();
    this.clock.reset();
<<<<<<< HEAD
    this._lastTime = performance.now();
    this._mountScene(scene);
  }

  refreshUI() {
    const top = this.peekScene();
    if (top) this._applyUI(top);
  }

  patchUI(updates) {
    const root = this.scene?.root;
    if (!root) return;
    for (const [id, content] of Object.entries(updates)) {
      const el = root.querySelector("#" + id);
      if (el && el.textContent !== String(content)) {
        el.textContent = content;
      }
    }
  }

  _updateScenes(dt, start) {
    for (let i = start; i < this._sceneStack.length; i++) {
      this._sceneStack[i].update(dt);
    }
  }

  // Blend render positions toward the current tick. The queue already holds
  // both endpoints per command, so this replaces what used to be three
  // passes — mutate the world's transforms, rebuild the queue from them,
  // then restore the originals — with one pass over pooled objects.
  _applyRenderAlpha(alpha, start) {
    for (let i = start; i < this._sceneStack.length; i++) {
      const scene = this._sceneStack[i];
      if (scene && typeof scene._applyRenderAlpha === "function") {
        scene._applyRenderAlpha(alpha);
      }
    }
  }

  _renderScenes(renderer, start) {
    for (let i = start; i < this._sceneStack.length; i++) {
      const scene = this._sceneStack[i];
      scene.render(renderer.immediateContext);
      if (scene.world) {
        renderer.render(scene.world);
      }
      const html = scene.renderUI();
      if (html !== undefined && html !== null && html !== scene._lastUIHTML) {
        scene.root.innerHTML = html;
        scene._lastUIHTML = html;
      }
    }
=======
    this._lastTime = this.host.now();
>>>>>>> 07d6ec7 (refactor: add host abstraction, scene stack/context and renderer host; make debug streaming opt-in)
  }

  _loop(time) {
    if (!this._running) return;

    if (this._paused) {
<<<<<<< HEAD
      this._rafId = requestAnimationFrame(this._boundLoop);
=======
      this._rafId = this.host.requestFrame(this._boundLoop);
>>>>>>> 07d6ec7 (refactor: add host abstraction, scene stack/context and renderer host; make debug streaming opt-in)
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

<<<<<<< HEAD
    this._rafId = requestAnimationFrame(this._boundLoop);
=======
    this._rafId = this.host.requestFrame(this._boundLoop);
>>>>>>> 07d6ec7 (refactor: add host abstraction, scene stack/context and renderer host; make debug streaming opt-in)
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
<<<<<<< HEAD
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    window.open(url, "jygame-debug-workspace");
=======
    const url = this.host.createObjectURL(html, "text/html");
    this.host.openWindow(url, "jygame-debug-workspace");
>>>>>>> 07d6ec7 (refactor: add host abstraction, scene stack/context and renderer host; make debug streaming opt-in)
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
<<<<<<< HEAD
    const updateStart = this._findBlockingIndex("blocksUpdateBelow");
    const top = this.scene;
    if (top && !top.ready) return;
    this._updating = true;
=======
    const updateStart = this.scenes.findBlockingIndex("blocksUpdateBelow");
    const top = this.scene;
    if (top && !top.ready) return;
    this.scenes.updating = true;
>>>>>>> 07d6ec7 (refactor: add host abstraction, scene stack/context and renderer host; make debug streaming opt-in)
    try {
      if (ticks > 0) {
        const fixedDt = this.clock.fixedDt;
        for (let i = 0; i < ticks; i++) {
<<<<<<< HEAD
          this._updateScenes(fixedDt, updateStart);
=======
          this.scenes.update(fixedDt, updateStart);
>>>>>>> 07d6ec7 (refactor: add host abstraction, scene stack/context and renderer host; make debug streaming opt-in)
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
<<<<<<< HEAD
    } finally { this._updating = false; }
=======
    } finally { this.scenes.updating = false; }
>>>>>>> 07d6ec7 (refactor: add host abstraction, scene stack/context and renderer host; make debug streaming opt-in)
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
<<<<<<< HEAD
    if (this._debug && this._snapshotBuilder && isDebugStreaming(this)) {
=======
    if (this._debug && isDebugStreaming(this)) {
>>>>>>> 07d6ec7 (refactor: add host abstraction, scene stack/context and renderer host; make debug streaming opt-in)
      takeDebugSnapshot(this);
    }

    const top = this.scene;
    if (top && !top.ready) return;

    const alpha = this.clock.alpha;
    const renderStart = this.scenes.findBlockingIndex("blocksRenderBelow");
    if (this._interpolation) {
<<<<<<< HEAD
      this._applyRenderAlpha(alpha, renderStart);
=======
      this.scenes.applyRenderAlpha(alpha, renderStart);
>>>>>>> 07d6ec7 (refactor: add host abstraction, scene stack/context and renderer host; make debug streaming opt-in)
    }

    // _fallbackRenderer sets this.renderer to null when the whole chain is
    // exhausted. Update still runs — the simulation stays live and the game
    // can recover if a renderer is reinstalled — but there is nothing to
    // draw into, so skip the render half of the frame.
    const renderer = this.renderer;
    if (!renderer) {
<<<<<<< HEAD
      this._warnNoRenderer();
=======
      this.rendererHost.warnNoRenderer();
>>>>>>> 07d6ec7 (refactor: add host abstraction, scene stack/context and renderer host; make debug streaming opt-in)
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
<<<<<<< HEAD
      this._renderScenes(renderer, renderStart);
      diag.end(mids.frameRender);
    } else { this._renderScenes(renderer, renderStart); }
=======
      this.scenes.render(renderer, renderStart);
      diag.end(mids.frameRender);
    } else { this.scenes.render(renderer, renderStart); }
>>>>>>> 07d6ec7 (refactor: add host abstraction, scene stack/context and renderer host; make debug streaming opt-in)

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
<<<<<<< HEAD
    if (this._resizeHandler) window.removeEventListener("resize", this._resizeHandler);
    if (this._resizeObserver) this._resizeObserver.disconnect();
    this._resetSceneStack();
    if (this.inputSystem) {
      const backend = this.inputSystem.backend;
      if (backend && typeof backend.stop === "function") backend.stop();
    }
    Input.gestures.clear();
    if (this._debug && this._debugBackend) this._debugBackend.close();
    if (this._debug && this._debugOverlay) this._debugOverlay.destroy();
    if (this.renderer && this.renderer.destroy) {
      this.renderer.destroy();
    }
=======
    this.scenes.reset();
    if (this.inputSystem) {
      const backend = this.inputSystem.backend;
      if (backend && typeof backend.stop === "function") backend.stop();
    }
    Input.gestures.clear();
    if (this.debugSession) { this.debugSession.close(); this.debugSession = null; }
    if (this._debug && this._debugOverlay) this._debugOverlay.destroy();
    // Releases the renderer, the resize observer and the resize listener.
    if (this.rendererHost) this.rendererHost.destroy();
>>>>>>> 07d6ec7 (refactor: add host abstraction, scene stack/context and renderer host; make debug streaming opt-in)
    // Drop the cached per-world Diagnostics so a destroyed game cannot keep
    // the last scene's world alive through this reference.
    this._diagnostics = null;
    this._diagIds = null;
    this._diagWorld = null;
  }
}
