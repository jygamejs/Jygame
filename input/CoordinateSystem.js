import { Space } from "./Space.js";

export class CoordinateSystem {
  constructor({
    camera = null,
    canvasRect = { x: 0, y: 0, width: 800, height: 600 },
    devicePixelRatio = 1,
  } = {}) {
    this._camera = camera;
    this._canvasRect = { ...canvasRect };
    this._devicePixelRatio = devicePixelRatio;
  }

  get camera() { return this._camera; }
  set camera(c) { this._camera = c; }

  get canvasRect() { return { ...this._canvasRect }; }
  set canvasRect(r) { this._canvasRect = { ...r }; }

  get devicePixelRatio() { return this._devicePixelRatio; }
  set devicePixelRatio(dpr) { this._devicePixelRatio = dpr; }

  toViewport(screenPoint) {
    return {
      x: (screenPoint.x - this._canvasRect.x) / this._devicePixelRatio,
      y: (screenPoint.y - this._canvasRect.y) / this._devicePixelRatio,
    };
  }

  toWorld(viewportPoint) {
    if (!this._camera) {
      return { x: viewportPoint.x, y: viewportPoint.y };
    }
    if (typeof this._camera.unproject === "function") {
      return this._camera.unproject(viewportPoint.x, viewportPoint.y);
    }
    if (typeof this._camera.screenToWorld === "function") {
      const out = {};
      this._camera.screenToWorld(viewportPoint.x, viewportPoint.y, out);
      return out;
    }
    return { x: viewportPoint.x, y: viewportPoint.y };
  }

  toUI(viewportPoint) {
    return { x: viewportPoint.x, y: viewportPoint.y };
  }

  toScreen(worldPoint) {
    let vp = { x: worldPoint.x, y: worldPoint.y };
    if (this._camera) {
      if (typeof this._camera.project === "function") {
        vp = this._camera.project(worldPoint.x, worldPoint.y);
      } else if (typeof this._camera.worldToScreen === "function") {
        const out = {};
        this._camera.worldToScreen(worldPoint.x, worldPoint.y, out);
        vp = out;
      }
    }
    return {
      x: vp.x * this._devicePixelRatio + this._canvasRect.x,
      y: vp.y * this._devicePixelRatio + this._canvasRect.y,
    };
  }

  transform(point, fromSpace, toSpace) {
    let vp;
    if (fromSpace === Space.SCREEN) {
      vp = this.toViewport(point);
    } else if (fromSpace === Space.WORLD) {
      vp = this._camera
        ? this._camera.project(point.x, point.y)
        : { x: point.x, y: point.y };
    } else {
      vp = { x: point.x, y: point.y };
    }

    if (toSpace === Space.SCREEN) {
      return {
        x: vp.x * this._devicePixelRatio + this._canvasRect.x,
        y: vp.y * this._devicePixelRatio + this._canvasRect.y,
      };
    }
    if (toSpace === Space.WORLD) {
      if (!this._camera) return { x: vp.x, y: vp.y };
      return this._camera.unproject(vp.x, vp.y);
    }
    if (toSpace === Space.UI) {
      return { x: vp.x, y: vp.y };
    }
    return { x: vp.x, y: vp.y };
  }
}
