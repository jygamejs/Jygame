import { Renderer } from "./Renderer.js";
import { Diagnostics, resolveMetricIds } from "../debug/index.js";
import { RenderQueue } from "../ecs/render/RenderQueue.js";
import { CanvasContext } from "../ecs/render/CanvasContext.js";
import { TrailRenderer } from "../ecs/render/TrailRenderer.js";
import { Camera } from "../view/Camera.js";
import { Viewport } from "../view/Viewport.js";

export class CanvasRenderer extends Renderer {
  constructor({ canvas = null, context = null, width = 0, height = 0, options = {} } = {}) {
    super({ canvas, width, height, options });

    if (context) {
      this._ctx = context;
    } else if (canvas) {
      this._ctx = canvas.getContext("2d");
    } else {
      this._ctx = null;
    }

    this._width = width;
    this._height = height;
    if (!this._width && canvas) this._width = canvas.width;
    if (!this._height && canvas) this._height = canvas.height;
    if (!this._width && this._ctx && this._ctx.canvas) this._width = this._ctx.canvas.width;
    if (!this._height && this._ctx && this._ctx.canvas) this._height = this._ctx.canvas.height;

    if (options.imageSmoothing !== undefined && this._ctx) {
      this._ctx.imageSmoothingEnabled = options.imageSmoothing;
    }

    this._frameCount = 0;
    this._diagIds = null;
    this._trailRenderer = null;
  }

  beginFrame() {}

  clear() {
    if (!this._ctx) return;
    this._ctx.clearRect(0, 0, this._width, this._height);
  }

  endFrame() {}

  render(world) {
    const ctx = this._ctx;
    if (!ctx) return;

    const diag = world.getResource(Diagnostics);
    const ownFrame = diag && !diag.isInsideFrame;
    if (ownFrame) diag.beginFrame(this._frameCount++, 16);

    try {
      ctx.save();

      const camera = world.getResource(Camera);
      if (camera) {
        const vp = world.getResource(Viewport);
        const cx = vp ? vp.x + vp.width * 0.5 : 0;
        const cy = vp ? vp.y + vp.height * 0.5 : 0;
        ctx.translate(cx, cy);
        ctx.scale(camera.zoom, camera.zoom);
        ctx.rotate(-camera.rotation);
        ctx.translate(-camera.x, -camera.y);
      }

      const queue = world.getResource(RenderQueue);
      if (queue && queue.count > 0) {
        queue.execute(ctx);
      }

      this._renderTrails(world);
      this._renderEffects(world, ctx);

      ctx.restore();
    } finally {
      if (ownFrame) diag.endFrame();
    }
  }

  _renderTrails(world) {
    const surface = world.getResource(CanvasContext);
    if (!surface) return;

    const items = world.collectTrailRenderables();
    if (items.length === 0) return;

    const diag = world.getResource(Diagnostics);
    if (diag) this._initDiag(diag);
    const ids = this._diagIds;

    let segments = 0, lines = 0, ribbons = 0;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      segments += item.buffer.count - 1;
      if (item.mode === 1) {
        ribbons++;
      } else {
        lines++;
      }
    }

    const doRender = () => {
      if (!this._trailRenderer) this._trailRenderer = new TrailRenderer();
      this._trailRenderer.render(surface, items);
    };

    if (diag && ids && ids.trails >= 0) {
      diag.scope(ids.trails, doRender);
    } else {
      doRender();
    }

    if (diag && ids) {
      if (ids.trailSegments >= 0) diag.recordCounter(ids.trailSegments, segments);
      if (ids.trailLines >= 0) diag.recordCounter(ids.trailLines, lines);
      if (ids.trailRibbons >= 0) diag.recordCounter(ids.trailRibbons, ribbons);
    }
  }

  _renderEffects(world, ctx) {
    const effects = world.effects;
    if (!effects || effects.length === 0) return;

    const ordered = effects.length > 1
      ? effects.slice().sort((a, b) => (a.depth || 0) - (b.depth || 0))
      : effects;

    for (let i = 0; i < ordered.length; i++) {
      ordered[i].render(ctx);
    }
  }

  _initDiag(diag) {
    if (this._diagIds) return;
    this._diagIds = resolveMetricIds(diag, {
      trails: "render.trails",
      trailSegments: "render.trails.segments",
      trailLines: "render.trails.lines",
      trailRibbons: "render.trails.ribbons",
    });
  }

  resize(width, height) {
    this._width = width;
    this._height = height;
    if (this.canvas) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
  }

  destroy() {}

  get immediateContext() {
    return this._ctx;
  }
}
