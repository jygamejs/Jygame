import { World } from "../core/World.js";

export class Scene {
  constructor(name) {
    this._name = name;
    this._created = false;
    this._world = null;
  }

  get name() {
    return this._name;
  }

  get world() {
    if (!this._world) {
      this._world = this._createWorld();
    }
    this._ensureCreated();
    return this._world;
  }

  set world(value) {
    this._world = value;
  }

  _createWorld() {
    return new World();
  }

  // The single authority for the "created" state. Every entry point that
  // makes a scene usable (lazy world creation, SceneManager add/replace,
  // engine mount) funnels through here so `onCreate()` runs exactly once
  // regardless of how or how many times the world is touched.
  _ensureCreated() {
    if (this._created) return;
    this._created = true;
    this.onCreate();
  }

  onCreate() {}
  onEnter() {}
  onExit() {}
  onPause() {}
  onResume() {}
  onDestroy() {}

  update(dt) {}

  render(ctx) {}
}
