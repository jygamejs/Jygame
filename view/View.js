import { Camera } from "./Camera.js";
import { Viewport } from "./Viewport.js";
import { RenderConfig } from "./RenderConfig.js";

export class View {
  constructor(options = {}) {
    this.active    = options.active ?? true;
    this.camera    = options.camera ?? new Camera();
    this.viewport  = options.viewport ?? new Viewport(0, 0, 800, 600);
    this.config    = options.config ?? new RenderConfig();
    this.order     = options.order ?? 0;

    if (options.screenSpace !== undefined) {
      this.config.screenSpace = options.screenSpace;
    }
  }

  screenToWorld(sx, sy) {
    const vp = this.viewport;
    const cam = this.camera;
    const cx = vp.width * 0.5;
    const cy = vp.height * 0.5;
    const a = (sx - vp.x - cx) / cam.zoom;
    const b = (sy - vp.y - cy) / cam.zoom;
    return {
      x: cam.x + a * cam._cos - b * cam._sin,
      y: cam.y + a * cam._sin + b * cam._cos,
    };
  }

  worldToScreen(wx, wy) {
    const vp = this.viewport;
    const cam = this.camera;
    const dx = wx - cam.x;
    const dy = wy - cam.y;
    const cx = vp.width * 0.5;
    const cy = vp.height * 0.5;
    return {
      x: vp.x + cx + (dx * cam._cos + dy * cam._sin) * cam.zoom,
      y: vp.y + cy + (-dx * cam._sin + dy * cam._cos) * cam.zoom,
    };
  }
}
