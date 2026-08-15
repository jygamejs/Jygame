import { Scene } from "./Scene.js";

// The ordered stack of mounted scenes, the deferred-operation queue, and the
// mount/unmount lifecycle.
//
// Transitions cannot run in the middle of an update — a scene popping itself
// from inside its own update() would mutate the array being iterated — so any
// operation requested while `updating` is true is queued and flushed after the
// tick loop finishes. That deferral is why every operation is split into a
// public method that validates and may queue, and an `_exec` half that does
// the work at the moment it is legal.
export class SceneStack {
  constructor({ uiLayer = null, context = null, onSwitch = null } = {}) {
    this._scenes = [];
    this._ops = [];
    this._updating = false;
    this._uiLayer = uiLayer;
    this._context = context;
    // Fired by switch(), which resets the whole stack. Pause state belongs to
    // the frame loop, not here, so the loop is told rather than reached into.
    this._onSwitch = onSwitch;
  }

  setContext(context) { this._context = context; }
  setUiLayer(layer) { this._uiLayer = layer; }

  get scenes() { return this._scenes; }
  get size() { return this._scenes.length; }
  get updating() { return this._updating; }
  set updating(v) { this._updating = v; }
  get pendingOpCount() { return this._ops.length; }

  get top() {
    return this._scenes[this._scenes.length - 1] || null;
  }

  peek() { return this.top; }

  at(index) {
    if (index < 0 || index >= this._scenes.length) return null;
    return this._scenes[index];
  }

  all() { return this._scenes.slice(); }
  contains(scene) { return this._scenes.includes(scene); }
  isTop(scene) { return this.top === scene; }

  // The lowest index that still needs to run, given a blocking flag. A scene
  // with blocksUpdateBelow / blocksRenderBelow hides everything under it.
  findBlockingIndex(prop) {
    const stack = this._scenes;
    for (let i = stack.length - 1; i >= 0; i--) {
      if (stack[i][prop]) return i;
    }
    return 0;
  }

  // ─── Mount lifecycle ────────────────────────────────

  validate(scene, methodName) {
    if (scene == null || !(scene instanceof Scene)) {
      throw new Error(
        `Game.${methodName}(): argument must be a Scene instance, got ${scene === null ? "null" : typeof scene}`,
      );
    }
  }

  mount(scene) {
    if (scene._exited) {
      throw new Error("Scene instance already exited. Create a new scene.");
    }
    if (scene._entered) {
      throw new Error("Scene instance already mounted. Create a new scene.");
    }
    if (scene._context && scene._context !== this._context) {
      throw new Error("Scene belongs to another Game instance.");
    }
    scene._context = this._context;
    scene.game = this._context ? this._context.game : null;
    scene.dom = scene.root;
    if (this._uiLayer && scene.root) this._uiLayer.append(scene.root);
    scene.enter();
    this.applyUI(scene);
  }

  unmount(scene) {
    scene.exit();
    if (scene.root) scene.root.remove();
  }

  reset() {
    for (const s of this._scenes) this.unmount(s);
    this._scenes = [];
  }

  // ─── UI ─────────────────────────────────────────────

  applyUI(scene) {
    if (!scene || !scene.root) return;
    const html = scene.renderDOM();
    if (html !== undefined && html !== null) {
      scene.root.innerHTML = html;
      scene._lastUIHTML = html;
    }
  }

  refreshUI() {
    const top = this.top;
    if (top) this.applyUI(top);
  }

  patchUI(updates) {
    const root = this.top ? this.top.root : null;
    if (!root) return;
    for (const [id, content] of Object.entries(updates)) {
      const el = root.querySelector("#" + id);
      if (el && el.textContent !== String(content)) {
        el.textContent = content;
      }
    }
  }

  // ─── Deferred operations ────────────────────────────

  _queue(type, ...args) {
    this._ops.push({ type, args });
  }

  flush() {
    while (this._ops.length > 0) {
      const op = this._ops.shift();
      // A deferred op can fail validation that passed when it was queued (see
      // _execPop). Report it and keep draining: letting it escape would unwind
      // through the frame into the rAF callback, killing the loop and
      // stranding every remaining op in the queue.
      try {
        switch (op.type) {
          case "push":    this._execPush(...op.args); break;
          case "pop":     this._execPop(); break;
          case "replace": this._execReplace(...op.args); break;
          case "switch":  this._execSwitch(...op.args); break;
        }
      } catch (err) {
        console.error(`[jygame] Deferred scene op "${op.type}" failed.`, err);
      }
    }
  }

  // ─── Transitions ────────────────────────────────────

  start(scene) {
    this.validate(scene, "run");
    if (scene._entered) {
      throw new Error("Game.run(): scene instance already mounted. Create a new scene.");
    }
    this._scenes = [scene];
    this.mount(scene);
  }

  push(scene) {
    this.validate(scene, "pushScene");
    if (this._updating) { this._queue("push", scene); return; }
    this._execPush(scene);
  }

  _execPush(scene) {
    if (scene._entered) {
      throw new Error("Game.pushScene(): scene instance already mounted. Create a new scene.");
    }
    const top = this.top;
    if (top && scene.blocksUpdateBelow) top.pause();
    this._scenes.push(scene);
    this.mount(scene);
  }

  replace(scene) {
    this.validate(scene, "replaceScene");
    if (this._updating) { this._queue("replace", scene); return; }
    this._execReplace(scene);
  }

  _execReplace(scene) {
    if (scene._entered) {
      throw new Error("Game.replaceScene(): scene instance already mounted. Create a new scene.");
    }
    const old = this._scenes.pop();
    if (old) this.unmount(old);
    this._scenes.push(scene);
    this.mount(scene);
  }

  pop() {
    if (this._scenes.length <= 1) {
      throw new Error("Cannot pop the last scene");
    }
    if (this._updating) { this._queue("pop"); return; }
    this._execPop();
  }

  _execPop() {
    // The guard in pop() runs at call time, but pops issued during update()
    // are deferred. Two deferred pops against a stack of two would both pass
    // that check and the second would empty the stack, leaving `below` null.
    // Re-check at execution time, when the depth is real.
    if (this._scenes.length <= 1) {
      throw new Error("Cannot pop the last scene");
    }
    const top = this._scenes.pop();
    this.unmount(top);
    const below = this.top;
    if (top.blocksUpdateBelow && below) below.resume();
    this.applyUI(below);
  }

  switch(scene) {
    this.validate(scene, "switchScene");
    if (this._updating) { this._queue("switch", scene); return; }
    this._execSwitch(scene);
  }

  _execSwitch(scene) {
    if (scene._entered) {
      throw new Error("Game.switchScene(): scene instance already mounted. Create a new scene.");
    }
    this.reset();
    this._scenes = [scene];
    if (this._onSwitch) this._onSwitch();
    this.mount(scene);
  }

  // ─── Per-frame iteration ────────────────────────────

  update(dt, start) {
    for (let i = start; i < this._scenes.length; i++) {
      this._scenes[i].update(dt);
    }
  }

  // Blend render positions toward the current tick. The render queue holds
  // both endpoints per command, so this is one allocation-free pass rather
  // than mutating the world and restoring it afterwards.
  applyRenderAlpha(alpha, start) {
    for (let i = start; i < this._scenes.length; i++) {
      const scene = this._scenes[i];
      if (scene && typeof scene._applyRenderAlpha === "function") {
        scene._applyRenderAlpha(alpha);
      }
    }
  }

  render(renderer, start) {
    for (let i = start; i < this._scenes.length; i++) {
      const scene = this._scenes[i];
      // Immediate drawing goes on the background layer (behind the world) —
      // GPU renderers composite it before the world, canvas renderers simply
      // draw before the world because both hooks share the visible context.
      scene.render(renderer.immediateBackgroundContext);
      if (scene.world) {
        renderer.render(scene.world);
      }
      // Foreground canvas layer, above the retained objects, below the DOM
      // overlay. Like renderUI it is screen space — the camera does not
      // transform it.
      scene.renderUI(renderer.immediateContext);
      const html = scene.renderDOM();
      if (html !== undefined && html !== null && html !== scene._lastUIHTML && scene.root) {
        scene.root.innerHTML = html;
        scene._lastUIHTML = html;
      }
    }
  }

  refreshRendererResources() {
    for (const scene of this._scenes) {
      if (scene && typeof scene._refreshRendererResources === "function") {
        scene._refreshRendererResources();
      }
    }
  }
}
