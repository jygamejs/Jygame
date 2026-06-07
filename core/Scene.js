import { Input } from "../input/Input.js";

export class Scene {
  constructor() {
    this.dom = null;
    this.root = document.createElement("div");
    this._cleanups = [];
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

  enter() {}

  exit() {
    for (const fn of this._cleanups) fn();
    this._cleanups = [];
  }

  pause() {}
  resume() {}
  update(dt) {}
  interpolate(alpha) {}
  render(ctx) {}
  renderUI() {}

  transitionTo(scene) {
    if (this.game) this.game.switchScene(scene);
  }
}
