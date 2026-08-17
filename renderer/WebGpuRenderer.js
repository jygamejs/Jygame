import { Renderer } from "./Renderer.js";
import { Diagnostics, resolveMetricIds } from "../debug/index.js";
import { RenderQueue } from "../ecs/render/RenderQueue.js";
import { RenderConfig } from "../view/RenderConfig.js";
import { Camera } from "../view/Camera.js";
import { Viewport } from "../view/Viewport.js";
import { ImmediateCanvas } from "./immediate/ImmediateCanvas.js";
import { WgpuSpriteBatch } from "./wgpu/sprites.batch.js";
import { WgpuTrailBatch } from "./wgpu/trails.batch.js";
import { WgpuTextureCache } from "./wgpu/texture.cache.js";
import { buildViewProjection } from "./gl/index.js";
import { readParticleInstance, buildBackendCommandBuffer } from "./gl/particles.batch.js";
import { WebGpuDeviceManager } from "../particles/gpu/webgpu/WebGpuDeviceManager.js";
import {
  COMPOSITE_VERTEX_WGSL,
  COMPOSITE_FRAGMENT_WGSL,
} from "./wgpu/index.js";

// WebGPU renderer implementing the same `Renderer` contract as the Canvas and
// WebGL backends: instanced-quad sprites, triangle-strip trail ribbons, and
// particle effects (CPU/operator backends through the shared command buffer,
// compute backends through the existing `WebGpuParticleRenderer`). Device and
// pipeline creation is asynchronous; `initialize()` must be awaited (the Game
// kicks it off at construction) and `render()` no-ops until it resolves.
export class WebGpuRenderer extends Renderer {
  static isAvailable() {
    return WebGpuDeviceManager.isAvailable();
  }

  constructor({ canvas = null, context = null, width = 0, height = 0, options = {} } = {}) {
    super({ canvas, width, height, options });

    if (context) {
      this._context = context;
    } else if (canvas) {
      this._context = canvas.getContext("webgpu");
    } else {
      this._context = null;
    }
    if (!this._context) {
      throw new Error("WebGpuRenderer requires a WebGPU context.");
    }

    this._device = null;
    this._initialized = false;
    this._format = null;
    this._batch = null;
    this._trailBatch = null;
    this._textures = null;
    this._compositeTexture = null;
    this._compositePipeline = null;
    this._compositeBindGroupLayout = null;

    this._immediateBg = new ImmediateCanvas(width, height);
    this._immediateFg = new ImmediateCanvas(width, height);
    this._applyImmediateSmoothing();
    this._clearColor = [0, 0, 0, 0];
    this._tmpParticle = {};
    this._matrix = null;
    this._currentView = null;

    this._frameCount = 0;
    this._diagIds = null;
    this._diag = null;
  }

  async initialize() {
    if (this._initialized) return;
    const options = this._options || {};
    if (options.device) {
      this._device = options.device;
    } else {
      await WebGpuDeviceManager.initialize();
      this._device = WebGpuDeviceManager.device();
    }

    const device = this._device;
    const format = options.format
      || (typeof navigator !== "undefined" && navigator.gpu && typeof navigator.gpu.getPreferredCanvasFormat === "function"
        ? navigator.gpu.getPreferredCanvasFormat()
        : "bgra8unorm");
    this._format = format;
    this._context.configure({ device, format, alphaMode: "premultiplied" });

    this._batch = new WgpuSpriteBatch(device, { format, maxInstances: options.maxInstances || 4096 });
    this._trailBatch = new WgpuTrailBatch(device, { format, maxVertices: options.maxTrailVertices || 16384 });
    this._textures = new WgpuTextureCache(device);

    this._compositeBindGroupLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } },
      ],
    });
    const pipelineLayout = device.createPipelineLayout({
      bindGroupLayouts: [this._compositeBindGroupLayout],
    });
    this._compositePipeline = device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: {
        module: device.createShaderModule({ code: COMPOSITE_VERTEX_WGSL }),
        entryPoint: "vs_main",
      },
      fragment: {
        module: device.createShaderModule({ code: COMPOSITE_FRAGMENT_WGSL }),
        entryPoint: "fs_main",
        targets: [{ format }],
      },
      primitive: { topology: "triangle-list" },
    });

    this._initialized = true;
  }

  beginFrame() {
    this._immediateBg.clear();
    this._immediateFg.clear();
  }

  clear() {
    // WebGPU clears through the render pass `loadOp`; the color was recorded
    // by `_applyClearColor` and is used as the pass `clearValue`.
  }

  render(world) {
    if (!this._initialized) return;

    const diag = world.getResource(Diagnostics);
    const ownFrame = diag && !diag.isInsideFrame;
    if (ownFrame) diag.beginFrame(this._frameCount++, 16);

    try {
      this._diag = diag;
      if (diag) this._initDiag(diag);
      const ids = this._diagIds;

      const doRender = () => {
        this._renderFrame(world);
      };

      if (diag && ids && ids.draw >= 0) {
        diag.scope(ids.draw, doRender);
      } else {
        doRender();
      }
    } finally {
      this._diag = null;
      if (ownFrame) diag.endFrame();
    }
  }

  endFrame() {
    if (!this._initialized) return;
    if (this._immediateFg.dirty) {
      this._compositePass(this._immediateFg);
      this._immediateFg.dirty = false;
    }
  }

  _renderFrame(world) {
    const device = this._device;
    const cfg = world.getResource(RenderConfig);
    this._applyClearColor(cfg);

    const encoder = device.createCommandEncoder();
    const texture = this._context.getCurrentTexture();
    const view = texture.createView();

    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view,
          loadOp: "clear",
          storeOp: "store",
          clearValue: this._clearColor,
        },
      ],
    });

    if (this._immediateBg.dirty) {
      this._drawCompositeInPass(pass, this._immediateBg);
      this._immediateBg.dirty = false;
    }

    this._setupSpriteFrame(world);
    this._renderQueue(world, pass);
    this._flushBatch(pass);
    this._renderTrails(world, pass);
    this._renderEffects(world, pass);
    this._flushBatch(pass);
    this._currentView = null;
    pass.end();

    device.queue.submit([encoder.finish()]);
  }

  _setupSpriteFrame(world) {
    const cfg = world.getResource(RenderConfig);
    const camera = world.getResource(Camera);
    const vp = world.getResource(Viewport);
    const matrix = buildViewProjection(camera, vp, this._width, this._height, !!(cfg && cfg.screenSpace));

    this._batch.setMatrix(matrix);
    this._batch.reset();
    this._matrix = matrix;
    return matrix;
  }

  _renderQueue(world, pass) {
    const queue = world.getResource(RenderQueue);
    if (!queue || queue.count === 0) return;

    const cfg = world.getResource(RenderConfig);
    const camera = world.getResource(Camera);
    const vp = world.getResource(Viewport);

    let images = 0, primitives = 0;

    queue.forEachCommandSorted((cmd) => {
      let entry = this._textures.white();
      if (cmd.sourceImage) {
        entry = this._textures.get(cmd.sourceImage);
        images++;
      } else {
        primitives++;
      }

      if (entry.view !== this._currentView) {
        this._flushBatch(pass);
        this._currentView = entry.view;
        this._batch.setTexture(entry.view, this._textures.sampler(cmd.imageSmoothing));
      }

      if (this._cull(cmd, camera, vp, cfg)) return;

      let x = cmd.x;
      let y = cmd.y;
      if (cfg && cfg.pixelPerfect) {
        x = Math.round(x);
        y = Math.round(y);
      }

      let r = 255, g = 255, b = 255;
      let u0 = 0, v0 = 0, u1 = 1, v1 = 1;
      if (cmd.sourceImage) {
        const iw = entry.width;
        const ih = entry.height;
        u0 = cmd.sx / iw;
        v0 = cmd.sy / ih;
        u1 = (cmd.sx + cmd.sw) / iw;
        v1 = (cmd.sy + cmd.sh) / ih;
      } else {
        r = (cmd.fillColor >> 16) & 255;
        g = (cmd.fillColor >> 8) & 255;
        b = cmd.fillColor & 255;
      }

      this._batch.add({
        x,
        y,
        rotation: cmd.rotation,
        scaleX: cmd.scaleX,
        scaleY: cmd.scaleY,
        width: cmd.width,
        height: cmd.height,
        u0, v0, u1, v1,
        r: r / 255, g: g / 255, b: b / 255, a: 1,
        depth: cmd.depth,
        shape: cmd.shape,
      });
    });

    this._flushBatch(pass);

    if (this._diag && this._diagIds) {
      const ids = this._diagIds;
      if (ids.images >= 0) this._diag.recordCounter(ids.images, images);
      if (ids.primitives >= 0) this._diag.recordCounter(ids.primitives, primitives);
    }
  }

  _flushBatch(pass) {
    if (this._batch.count === 0) return;
    const diag = this._diag;
    const ids = this._diagIds;
    const doFlush = () => this._batch.flush(pass);
    if (diag && ids && ids.batch >= 0) {
      diag.scope(ids.batch, doFlush);
    } else {
      doFlush();
    }
  }

  _renderTrails(world, pass) {
    const items = world.collectTrailRenderables();
    if (items.length === 0) return;

    const diag = this._diag;
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
      const batch = this._trailBatch;
      batch.reset();
      batch.setMatrix(this._matrix);
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        batch.addTrail(item.buffer, item.color, item.width);
      }
      batch.flush(pass);
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

  _renderEffects(world, pass) {
    const effects = world.effects;
    if (!effects || effects.length === 0) return;

    const ordered = effects.length > 1
      ? effects.slice().sort((a, b) => (a.depth || 0) - (b.depth || 0))
      : effects;

    let sprites = 0, primitives = 0;
    for (let i = 0; i < ordered.length; i++) {
      const effect = ordered[i];
      if (effect._destroyed || effect._finished || !effect._enabled || !effect._visible) continue;

      const backend = effect.system ? effect.system._backend : null;
      if (!backend) continue;

      if (backend._mode === "compute" && backend._gpuRenderer) {
        // GPU-native particle path: draw into this frame's render pass (with
        // this renderer's attachment format and camera matrix) instead of the
        // particle renderer submitting its own command buffer — a separate
        // submit would execute before this pass's loadOp "clear" and get wiped
        // every frame.
        backend.render(pass, this._format, this._matrix);
        continue;
      }

      const res = this._renderEffect(backend, effect.depth || 0, pass);
      sprites += res.sprites;
      primitives += res.primitives;
    }

    this._flushBatch(pass);

    if (this._diag && this._diagIds) {
      const ids = this._diagIds;
      if (ids.particleSprites >= 0) this._diag.recordCounter(ids.particleSprites, sprites);
      if (ids.particlePrimitives >= 0) this._diag.recordCounter(ids.particlePrimitives, primitives);
    }
  }

  _renderEffect(backend, depth, pass) {
    if (backend.activeCount === 0) return { sprites: 0, primitives: 0 };

    const buf = buildBackendCommandBuffer(backend);
    if (!buf || buf.count === 0) return { sprites: 0, primitives: 0 };

    const inst = this._tmpParticle;
    let sprites = 0, primitives = 0;

    for (let i = 0; i < buf.count; i++) {
      readParticleInstance(buf, i, inst);
      if (inst.texture) {
        sprites++;
      } else {
        primitives++;
      }
      this._pushParticle(inst, depth, pass);
    }

    return { sprites, primitives };
  }

  _pushParticle(inst, depth, pass) {
    const entry = inst.texture ? this._textures.get(inst.texture) : this._textures.white();

    if (entry.view !== this._currentView) {
      this._flushBatch(pass);
      this._currentView = entry.view;
      this._batch.setTexture(entry.view, this._textures.sampler(true));
    }

    const w = inst.width > 0 ? inst.width : inst.size;
    const h = inst.height > 0 ? inst.height : inst.size;
    const ox = (0.5 - inst.originX) * w;
    const oy = (0.5 - inst.originY) * h;
    const cosR = Math.cos(inst.rotation);
    const sinR = Math.sin(inst.rotation);

    let u0 = 0, v0 = 0, u1 = 1, v1 = 1;
    if (inst.texture) {
      const iw = entry.width;
      const ih = entry.height;
      if (inst.frameWidth > 0 && inst.frameHeight > 0) {
        u0 = inst.frameX / iw;
        v0 = inst.frameY / ih;
        u1 = (inst.frameX + inst.frameWidth) / iw;
        v1 = (inst.frameY + inst.frameHeight) / ih;
      }
    }

    this._batch.add({
      x: inst.x + cosR * ox - sinR * oy,
      y: inst.y + sinR * ox + cosR * oy,
      rotation: inst.texture ? inst.rotation : 0,
      scaleX: 1,
      scaleY: 1,
      width: w,
      height: h,
      u0, v0, u1, v1,
      // Premultiplied blend (one, one-minus-src-alpha): untextured particles
      // must carry a premultiplied tint or faded particles wash out the scene.
      r: inst.texture ? inst.r : inst.r * inst.alpha,
      g: inst.texture ? inst.g : inst.g * inst.alpha,
      b: inst.texture ? inst.b : inst.b * inst.alpha,
      a: inst.alpha,
      depth,
      shape: 0,
    });
  }

  _compositeTextureFor(overlay) {
    const source = overlay.canvas;
    if (!source || !overlay.context) return null;
    const device = this._device;
    if (!device || !this._compositePipeline) return null;
    if (typeof device.queue.copyExternalImageToTexture !== "function") return null;

    let tex = this._compositeTexture;
    if (!tex || tex.width !== source.width || tex.height !== source.height) {
      if (tex && tex.destroy) tex.destroy();
      tex = device.createTexture({
        size: { width: source.width, height: source.height, depthOrArrayLayers: 1 },
        format: "rgba8unorm",
        // copyExternalImageToTexture validates the destination for both
        // COPY_DST and RENDER_ATTACHMENT usage.
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
      });
      this._compositeTexture = tex;
    }

    device.queue.copyExternalImageToTexture(
      { source },
      { texture: tex },
      { width: source.width, height: source.height },
    );
    return tex;
  }

  _drawCompositeInPass(pass, overlay) {
    const tex = this._compositeTextureFor(overlay);
    if (!tex) return;
    const device = this._device;
    const bindGroup = device.createBindGroup({
      layout: this._compositeBindGroupLayout,
      entries: [
        { binding: 0, resource: this._textures.sampler() },
        { binding: 1, resource: tex.createView() },
      ],
    });
    pass.setPipeline(this._compositePipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(4);
  }

  _compositePass(overlay) {
    const device = this._device;
    const tex = this._compositeTextureFor(overlay);
    if (!tex) return;
    const encoder = device.createCommandEncoder();
    const view = this._context.getCurrentTexture().createView();
    const bindGroup = device.createBindGroup({
      layout: this._compositeBindGroupLayout,
      entries: [
        { binding: 0, resource: this._textures.sampler() },
        { binding: 1, resource: tex.createView() },
      ],
    });

    const pass = encoder.beginRenderPass({
      colorAttachments: [{ view, loadOp: "load", storeOp: "store" }],
    });
    pass.setPipeline(this._compositePipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(4);
    pass.end();

    device.queue.submit([encoder.finish()]);
  }

  _cull(cmd, camera, vp, cfg) {
    if (!cfg || !cfg.culling || !camera || !vp) return false;
    const dx = cmd.x - camera.x;
    const dy = cmd.y - camera.y;
    const maxHalf = Math.max(Math.abs(cmd.width * cmd.scaleX), Math.abs(cmd.height * cmd.scaleY)) * 0.5;
    const radius = maxHalf * Math.SQRT2 * camera.zoom;
    const cx = vp.width * 0.5;
    const cy = vp.height * 0.5;
    const sx = vp.x + cx + (dx * camera._cos + dy * camera._sin) * camera.zoom;
    const sy = vp.y + cy + (-dx * camera._sin + dy * camera._cos) * camera.zoom;
    return sx < -radius || sx > vp.width + radius || sy < -radius || sy > vp.height + radius;
  }

  _applyClearColor(cfg) {
    if (!cfg || cfg.clearColor == null) {
      this._clearColor = [0, 0, 0, 0];
      return;
    }
    this._clearColor = this._parseColor(cfg.clearColor);
  }

  _parseColor(color) {
    if (typeof color !== "string") return [0, 0, 0, 0];
    const s = color.trim();
    if (s[0] === "#") {
      let hex = s.slice(1);
      if (hex.length === 3) {
        hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
      }
      const int = parseInt(hex, 16);
      if (Number.isNaN(int)) return [0, 0, 0, 0];
      if (hex.length >= 8) {
        return [
          ((int >> 24) & 255) / 255,
          ((int >> 16) & 255) / 255,
          ((int >> 8) & 255) / 255,
          (int & 255) / 255,
        ];
      }
      return [
        ((int >> 16) & 255) / 255,
        ((int >> 8) & 255) / 255,
        (int & 255) / 255,
        1,
      ];
    }
    if (s.startsWith("rgb")) {
      const m = s.match(/([\d.]+)/g);
      if (m && m.length >= 3) {
        return [
          parseFloat(m[0]) / 255,
          parseFloat(m[1]) / 255,
          parseFloat(m[2]) / 255,
          m[3] !== undefined ? parseFloat(m[3]) : 1,
        ];
      }
    }
    return [0, 0, 0, 0];
  }

  _initDiag(diag) {
    if (this._diagIds) return;
    this._diagIds = resolveMetricIds(diag, {
      draw: "render.draw",
      batch: "render.batch",
      images: "render.images",
      primitives: "render.primitives",
      trails: "render.trails",
      trailSegments: "render.trails.segments",
      trailLines: "render.trails.lines",
      trailRibbons: "render.trails.ribbons",
      particleSprites: "render.particles.sprites",
      particlePrimitives: "render.particles.primitives",
    });
  }

  resize(width, height) {
    super.resize(width, height);
    if (this.canvas) {
      if (this.canvas.width !== width) this.canvas.width = width;
      if (this.canvas.height !== height) this.canvas.height = height;
    }
    this._immediateBg.resize(width, height);
    this._immediateFg.resize(width, height);
    this._applyImmediateSmoothing();
  }

  destroy() {
    if (this._batch) this._batch.destroy();
    if (this._trailBatch) this._trailBatch.destroy();
    if (this._textures) this._textures.destroy();
    if (this._compositeTexture && this._compositeTexture.destroy) this._compositeTexture.destroy();
    this._batch = null;
    this._trailBatch = null;
    this._textures = null;
    this._compositeTexture = null;
    this._compositePipeline = null;
    this._initialized = false;
  }

  get immediateContext() {
    return this._immediateFg.drawingContext;
  }

  get immediateBackgroundContext() {
    return this._immediateBg.drawingContext;
  }

  // Match the game's imageSmoothing option on both immediate 2D layers (see
  // WebGLRenderer._applyImmediateSmoothing). Re-applied after resize, since
  // resizing a canvas resets its 2D context state.
  _applyImmediateSmoothing() {
    if (this._options.imageSmoothing === undefined) return;
    const bg = this._immediateBg.drawingContext;
    const fg = this._immediateFg.drawingContext;
    if (bg) bg.imageSmoothingEnabled = this._options.imageSmoothing;
    if (fg) fg.imageSmoothingEnabled = this._options.imageSmoothing;
  }
}
