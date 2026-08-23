import { ParticleSystem } from "./ParticleSystem.js";
import { ParticleEmitter } from "./ParticleEmitter.js";

export class ParticleEffect {
  static _defaultWorld = null;

  constructor({ asset, x = 0, y = 0, renderer, backend } = {}) {
    this._asset = asset;
    this._visual = asset._visual ?? null;
    this._destroyed = false;
    this._autoDestroy = false;
    this._finished = false;
    this._onFinishCallback = null;
    this._visible = true;
    this._enabled = true;
    this._rotation = 0;
    this._depth = 0;
    this._world = null;

    if (ParticleEffect._defaultWorld) {
      this._world = ParticleEffect._defaultWorld;
      this._world.addEffect(this);
    }

    const system = new ParticleSystem({
      renderParticle: asset._renderParticle || undefined,
      renderer: renderer ?? asset._renderer ?? undefined,
      backend: backend ?? asset._backend ?? undefined,
    });

    if (asset._modifierStack) {
      this._modifierStack = asset._modifierStack.clone();
      system.addModifier(this._modifierStack);
    } else {
      this._modifierStack = null;
    }

    if (asset._capacity > 0) {
      system.warmup(asset._capacity);
    }

    this._system = system;

    const emitterConfig = {
      system,
      shape: asset._shape,
      ...asset._emitterConfig,
    };

    if (asset._initializer) {
      emitterConfig.initializer = emitterConfig.initializer || asset._initializer;
    }

    this._emitter = new ParticleEmitter(emitterConfig);
    this._emitter.setPosition(x, y);
    this._initPositionView();
  }

  _initPositionView() {
    const emitter = this._emitter;
    const view = {
      set(x, y) {
        if (typeof x === "object" && x !== null) {
          y = x.y;
          x = x.x;
        }
        emitter.setPosition(x, y);
      },
    };
    Object.defineProperty(view, "x", {
      get() { return emitter.x; },
      set(value) { emitter.setPosition(value, emitter.y); },
      enumerable: true,
      configurable: true,
    });
    Object.defineProperty(view, "y", {
      get() { return emitter.y; },
      set(value) { emitter.setPosition(emitter.x, value); },
      enumerable: true,
      configurable: true,
    });
    this._positionView = view;
  }

  _applyRotation(value) {
    const shape = this._emitter.shape;
    if (!shape) return;
    if ("rotation" in shape) {
      shape.rotation = value;
    } else if (typeof shape._coneDirection === "number") {
      shape._coneDirection = value;
    }
  }

  get active() {
    return !this._destroyed && !this._finished;
  }

  get finished() {
    return this._finished;
  }

  get system() {
    return this._system;
  }

  get asset() {
    return this._asset;
  }

  get visual() {
    return this._visual;
  }

  get emitter() {
    return this._emitter;
  }

  get position() {
    return this._positionView;
  }

  set position(value) {
    if (Array.isArray(value)) {
      this._emitter.setPosition(value[0], value[1]);
    } else if (value && typeof value === "object") {
      this._emitter.setPosition(value.x ?? 0, value.y ?? 0);
    }
  }

  get rotation() {
    const shape = this._emitter.shape;
    if (shape && typeof shape._coneDirection === "number") {
      return shape._coneDirection;
    }
    return this._rotation;
  }

  set rotation(value) {
    this._rotation = value;
    this._applyRotation(value);
  }

  get visible() {
    return this._visible;
  }

  set visible(value) {
    this._visible = !!value;
  }

  get enabled() {
    return this._enabled;
  }

  set enabled(value) {
    this._enabled = !!value;
  }

  get depth() {
    return this._depth;
  }

  set depth(value) {
    this._depth = value;
  }

  get following() {
    return this._emitter.isFollowing;
  }

  play() {
    if (this._destroyed) return;
    if (this._finished) this._finished = false;
    this._emitter.start();
  }

  stop() {
    if (this._destroyed) return;
    this._emitter.stop();
  }

  pause() {
    if (this._destroyed) return;
    this._emitter.pause();
  }

  resume() {
    if (this._destroyed) return;
    this._emitter.resume();
  }

  restart() {
    this.stop();
    this.clear();
    this.play();
  }

  emit(count) {
    if (this._destroyed || this._finished) return;
    this._emitter.emit(count);
  }

  burst(count) {
    this.emit(count);
  }

  clear() {
    if (this._destroyed) return;
    this._system.clear();
    this._emitter.reset();
  }

  follow(target, getter) {
    if (this._destroyed) return;
    this._emitter.follow(target, getter);
  }

  unfollow() {
    if (this._destroyed) return;
    this._emitter.clearFollow();
  }

  move(dx, dy) {
    if (this._destroyed) return;
    this._emitter.move(dx, dy);
  }

  update(dt) {
    if (this._destroyed || this._finished || !this._enabled) return;
    this._emitter.update(dt);
    this._system.update(dt);
    if (this._autoDestroy && this._system.activeCount === 0) {
      this._finished = true;
      if (this._onFinishCallback) this._onFinishCallback(this);
    }
  }

  render(ctx) {
    if (this._destroyed || this._finished || !this._enabled || !this._visible) return;
    this._system.render(ctx);
  }

  destroyWhenFinished(callback) {
    this._autoDestroy = true;
    this._onFinishCallback = callback || null;
  }

  onFinish(callback) {
    this.destroyWhenFinished(callback);
  }

  destroy() {
    if (this._destroyed) return;
    if (this._world) {
      this._world.removeEffect(this);
      this._world = null;
    }
    this._destroyed = true;
    this._finished = true;
    this._emitter.destroy();
    this._system.destroy();
    this._modifierStack = null;
  }
}
