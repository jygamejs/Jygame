import { Clock } from "../time/Clock.js";
import { Input, InputContext } from "../input/Input.js";
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
import { ActionMap } from "../input/actions/ActionMap.js";
import { ChordBinding } from "../input/actions/ChordBinding.js";
import { KeyCode } from "../input/KeyCode.js";
import { InputContext as ActionInputContext } from "../input/actions/InputContext.js";
import { Scene } from "./Scene.js";
import { Diagnostics, MetricCategory, MetricUnit, MetricType, resolveMetricIds }
  from "../debug/index.js";
import { OverlayHost } from "../debug/overlay/OverlayHost.js";
import { enableDebugWorkspace, takeDebugSnapshot } from "../debug/EnableDebugWorkspace.js";

export class Game {
  constructor({ parent, width, height, fps = 60, maxTicks = 5, autoPause = true, scaleToFit = null, debug = true }) {
    const container = typeof parent === "string"
      ? document.querySelector(parent)
      : parent;

    this.canvas = document.createElement("canvas");
    this.canvas.width = width;
    this.canvas.height = height;
    this.canvas.style.display = "block";
    container.appendChild(this.canvas);

    this.domLayer = document.createElement("div");
    this.domLayer.className = "jygame-ui";
    this.domLayer.style.position = "absolute";
    this.domLayer.style.top = "0";
    this.domLayer.style.left = "0";
    this.domLayer.style.width = "100%";
    this.domLayer.style.height = "100%";
    container.appendChild(this.domLayer);

    if (getComputedStyle(container).position === "static") {
      container.style.position = "relative";
    }

    this.ctx = this.canvas.getContext("2d");
    this.width = width;
    this.height = height;
    this.clock = new Clock(fps, maxTicks);
    this._sceneStack = [];
    this._sceneOps = [];
    this._updating = false;
    this._running = false;
    this._paused = false;
    this._lastTime = 0;
    this._rafId = null;
    this._pausedByVisibility = false;
    this._diagnostics = null;
    this._diagIds = null;
    this._frameCount = 0;
    this.fps = 60;

    this.input = new InputContext();
    this.input.init(container);
    Input.setDefault(this.input);

    this.inputSystem = new InputSystem();
    const backend = new BrowserBackend(container);
    this.inputSystem.setBackend(backend);
    this.inputSystem.contextStack = new ContextStack();
    this.inputSystem.coordinateSystem = new CoordinateSystem({
      canvasRect: { x: 0, y: 0, width, height },
      devicePixelRatio: window.devicePixelRatio || 1,
    });

    // Register standard input devices
    this.inputSystem.devices.register(new Keyboard());
    this.inputSystem.devices.register(new Mouse());
    this.inputSystem.devices.register(new PointerManager());
    this.inputSystem.devices.register(new TouchSurface());
    this.inputSystem.devices.register(new Stylus());
    this.inputSystem.devices.register(new TextInput());

    this._debug = debug;
    this._debugActionMap = null;
    if (this._debug) {
      this._debugActionMap = new ActionMap();
      this._debugActionMap.bind("openDebugWorkspace", new ChordBinding(KeyCode.F3, { ctrl: true }));
      const debugCtx = new ActionInputContext("jygame-debug", this._debugActionMap, { priority: -100 });
      this.inputSystem.contextStack.push(debugCtx);
      enableDebugWorkspace(this);
    }

    this._visibilityHandler = null;
    this._focusHandler = () => {
      const kb = this.inputSystem.devices.get(Keyboard);
      if (kb) kb.reset();
    };
    window.addEventListener("focus", this._focusHandler);
    if (autoPause) {
      this._visibilityHandler = () => {
        if (this._debug && this._debugBackend) return;
        if (document.hidden) {
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
      document.addEventListener("visibilitychange", this._visibilityHandler);
    }

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
  }

  enableDebugWorkspace(backend) {
    if (!this._debug) return;
    enableDebugWorkspace(this, backend);
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

  get scene() {
    return this._sceneStack[this._sceneStack.length - 1] || null;
  }

  get sceneCount() {
    return this._sceneStack.length;
  }

  getScene(index) {
    if (index < 0 || index >= this._sceneStack.length) return null;
    return this._sceneStack[index];
  }

  getScenes() {
    return this._sceneStack.slice();
  }

  containsScene(scene) {
    return this._sceneStack.includes(scene);
  }

  isTopScene(scene) {
    return this.scene === scene;
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
    this._lastTime = performance.now();
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
    if (diag) diag.beginFrame(this._frameCount++, realDt * 1000);
    if (diag && mids && mids.frameTotal >= 0) {
      diag.scope(mids.frameTotal, () => { this._frame(diag, 1, realDt); });
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
      switch (op.type) {
        case "push":    this._execPushScene(...op.args); break;
        case "pop":     this._execPopScene(); break;
        case "replace": this._execReplaceScene(...op.args); break;
        case "switch":  this._execSwitchScene(...op.args); break;
      }
    }
  }

  run(scene) {
    if (this._running) {
      throw new Error("Game.run() called while game is already running. Call destroy() first.");
    }
    this._validateScene(scene, "run");
    if (scene._entered) {
      throw new Error("Game.run(): scene instance already mounted. Create a new scene.");
    }
    this._sceneStack = [scene];
    this._mountScene(scene);
    this.clock.reset();
    this._running = true;
    this._lastTime = performance.now();
    this._rafId = requestAnimationFrame((t) => this._loop(t));
  }

  pushScene(scene) {
    this._validateScene(scene, "pushScene");
    if (this._updating) {
      this._queueSceneOp("push", scene);
      return;
    }
    this._execPushScene(scene);
  }

  _execPushScene(scene) {
    if (scene._entered) {
      throw new Error("Game.pushScene(): scene instance already mounted. Create a new scene.");
    }
    const top = this.peekScene();
    if (top && scene.blocksUpdateBelow) {
      top.pause();
    }
    this._sceneStack.push(scene);
    this._mountScene(scene);
  }

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
    this.input.updateFrame();
    this.clock.reset();
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

  _interpolateScenes(alpha, start) {
    for (let i = start; i < this._sceneStack.length; i++) {
      this._sceneStack[i].interpolate?.(alpha);
    }
  }

  _renderScenes(ctx, start) {
    for (let i = start; i < this._sceneStack.length; i++) {
      this._sceneStack[i].render(ctx);
    }
  }

  _loop(time) {
    if (!this._running) return;

    if (this._paused) {
      this._rafId = requestAnimationFrame((t) => this._loop(t));
      return;
    }

    const realDt = (time - this._lastTime) / 1000;
    this._lastTime = time;

    const ticks = this.clock.tick(realDt);
    const diag = this._getDiag();
    const mids = this._diagIds;

    if (diag) diag.beginFrame(this._frameCount++, realDt * 1000);

    if (diag && mids && mids.frameTotal >= 0) {
      diag.scope(mids.frameTotal, () => { this._frame(diag, ticks, realDt); });
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

    this._rafId = requestAnimationFrame((t) => this._loop(t));
  }

  _getDiag() {
    if (!this._debug) return null;
    if (!this._diagnostics) {
      const top = this.scene;
      if (top && top.world) {
        this._diagnostics = top.world.getResource(Diagnostics);
        this._initDiag();
      }
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
    });
  }

  _frame(diag, ticks, realDt) {
    const mids = this._diagIds;

    const doInput = () => {
      this.input.updateFrame();
      this.inputSystem.update();
      if (this._debugActionMap) {
        const ws = this._debugActionMap.getState("openDebugWorkspace");
        if (ws && ws.justPressed) {
          window.open("/debug/workspace/index.html", "jygame-debug-workspace");
        }
      }
    };
    if (diag && mids && mids.frameInput >= 0) {
      diag.scope(mids.frameInput, doInput);
    } else { doInput(); }

    const doUpdate = () => {
      const updateStart = this._findBlockingIndex("blocksUpdateBelow");
      this._updating = true;
      try {
        if (ticks > 0) {
          for (let i = 0; i < ticks; i++) {
            this._updateScenes(this.clock.fixedDt, updateStart);
            this.input.clearJustPressed();
          }
        }
      } finally { this._updating = false; }
      const top = this.scene;
      if (top && top.world) {
        top.world.update(this.clock.fixedDt);
      }
    };
    if (diag && mids && mids.frameUpdate >= 0) {
      diag.scope(mids.frameUpdate, doUpdate);
    } else { doUpdate(); }

    this._flushSceneOps();

    if (this._debug && this._snapshotBuilder) {
      takeDebugSnapshot(this);
    }

    const alpha = this.clock.alpha;
    const renderStart = this._findBlockingIndex("blocksRenderBelow");
    this._interpolateScenes(alpha, renderStart);

    const doCanvas = () => { this.ctx.clearRect(0, 0, this.width, this.height); };
    if (diag && mids && mids.frameCanvas >= 0) {
      diag.scope(mids.frameCanvas, doCanvas);
    } else { doCanvas(); }

    const doRender = () => { this._renderScenes(this.ctx, renderStart); };
    if (diag && mids && mids.frameRender >= 0) {
      diag.scope(mids.frameRender, doRender);
    } else { doRender(); }

    if (this._debug && this._debugOverlay) {
      this._debugOverlay.render(this.ctx, this.width, this.height);
    }

    this.fps += ((1 / Math.max(realDt, 0.001)) - this.fps) * 0.05;
  }

  destroy() {
    this._running = false;
    if (this._rafId) cancelAnimationFrame(this._rafId);
    if (this._visibilityHandler) {
      document.removeEventListener("visibilitychange", this._visibilityHandler);
      this._visibilityHandler = null;
    }
    if (this._focusHandler) {
      window.removeEventListener("focus", this._focusHandler);
      this._focusHandler = null;
    }
    if (this._resizeHandler) window.removeEventListener("resize", this._resizeHandler);
    if (this._resizeObserver) this._resizeObserver.disconnect();
    this._resetSceneStack();
    this.input.destroy();
    if (this._debug && this._debugBackend) this._debugBackend.close();
    if (this._debug && this._debugOverlay) this._debugOverlay.destroy();
  }
}
