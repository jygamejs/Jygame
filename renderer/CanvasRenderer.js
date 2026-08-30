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

    this._backgroundColor = options.backgroundColor ?? null;
    this._frameCount = 0;
    this._diagIds = null;
    this._trailRenderer = null;
  }

  get backgroundColor() { return this._backgroundColor; }
  set backgroundColor(v) { this._backgroundColor = v; }
  setBackgroundColor(v) { this._backgroundColor = v; }

  beginFrame() {}

  clear() {
    if (!this._ctx) return;
    if (this._backgroundColor) {
      this._ctx.save();
      this._ctx.fillStyle = this._backgroundColor;
      this._ctx.fillRect(0, 0, this._width, this._height);
      this._ctx.restore();
    } else {
      this._ctx.clearRect(0, 0, this._width, this._height);
    }
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

      // Mirror the camera transform into six scalars as we apply it, so
      // RenderQueue.execute does not have to call ctx.getTransform() and
      // allocate a DOMMatrix to read back what we just set.
      const mat = this._baseMatrix ||
        (this._baseMatrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
      mat.a = 1; mat.b = 0; mat.c = 0; mat.d = 1; mat.e = 0; mat.f = 0;

      const camera = world.getResource(Camera);
      if (camera) {
        const vp = world.getResource(Viewport);
        const cx = vp ? vp.x + vp.width * 0.5 : 0;
        const cy = vp ? vp.y + vp.height * 0.5 : 0;
        ctx.translate(cx, cy);
        ctx.scale(camera.zoom, camera.zoom);
        ctx.rotate(-camera.rotation);
        ctx.translate(-camera.x, -camera.y);

        const z = camera.zoom;
        const cos = Math.cos(-camera.rotation);
        const sin = Math.sin(-camera.rotation);
        // translate(cx,cy) · scale(z,z) · rotate(-rot) · translate(-camX,-camY)
        const a = z * cos, b = z * sin, c = -z * sin, d = z * cos;
        mat.a = a; mat.b = b; mat.c = c; mat.d = d;
        mat.e = cx + a * -camera.x + c * -camera.y;
        mat.f = cy + b * -camera.x + d * -camera.y;
      }

      const queue = world.getResource(RenderQueue);
      if (queue && queue.count > 0) {
        queue.execute(ctx, 0xFFFFFFFF, mat);
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

    // world.sortedEffects() reuses a persistent array; the old
    // `.slice().sort(...)` allocated both an array and a comparator per frame.
    const ordered = effects.length > 1 && typeof world.sortedEffects === "function"
      ? world.sortedEffects()
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
    super.resize(width, height);
    if (this.canvas) {
      if (this.canvas.width !== width) this.canvas.width = width;
      if (this.canvas.height !== height) this.canvas.height = height;
    }
    if (this._ctx && this._options.imageSmoothing !== undefined) {
      this._ctx.imageSmoothingEnabled = this._options.imageSmoothing;
    }
  }

  destroy() {}

  get immediateContext() {
    return this._ctx;
  }

  get immediateBackgroundContext() {
    return this._ctx;
  }
}
