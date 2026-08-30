import { Renderer } from "./Renderer.js";
import { Diagnostics, resolveMetricIds } from "../debug/index.js";
import { RenderQueue } from "../ecs/render/RenderQueue.js";
import { RenderConfig } from "../view/RenderConfig.js";
import { Camera } from "../view/Camera.js";
import { Viewport } from "../view/Viewport.js";
import { ImmediateCanvas } from "./immediate/ImmediateCanvas.js";
import { QuadBatch } from "./gl/quad.batch.js";
import { TextureCache } from "./gl/texture.cache.js";
import { TrailBatch } from "./gl/trails.batch.js";
import { readParticleInstance, buildBackendCommandBuffer } from "./gl/particles.batch.js";
import { createProgram, buildViewProjection } from "./gl/index.js";

const VERTEX_SOURCE = `#version 300 es
precision highp float;
in vec2 aCorner;
in vec2 aPos;
in float aRot;
in vec2 aScale;
in vec2 aSize;
in vec4 aUv;
in vec4 aColor;
in float aDepth;
in float aShape;
out vec2 vUv;
out vec4 vColor;
out vec2 vLocal;
out vec2 vScale;
out float vRadius;
out float vShape;
uniform mat4 uMatrix;
void main() {
  vec2 local = (aCorner - 0.5) * aSize * aScale;
  float cosR = cos(aRot);
  float sinR = sin(aRot);
  vec2 rotated = vec2(cosR * local.x - sinR * local.y, sinR * local.x + cosR * local.y);
  vec2 world = rotated + aPos;
  gl_Position = uMatrix * vec4(world, aDepth, 1.0);
  vUv = mix(aUv.xy, aUv.zw, aCorner);
  vColor = aColor;
  vLocal = local;
  vScale = aScale;
  vRadius = min(abs(aSize.x), abs(aSize.y)) * 0.5;
  vShape = aShape;
}
`;

const FRAGMENT_SOURCE = `#version 300 es
precision mediump float;
in vec2 vUv;
in vec4 vColor;
in vec2 vLocal;
in vec2 vScale;
in float vRadius;
in float vShape;
uniform sampler2D uTexture;
out vec4 outColor;
void main() {
  if (vShape > 0.5) {
    vec2 p = vScale.x != 0.0 && vScale.y != 0.0 ? vLocal / vScale : vec2(0.0, 0.0);
    if (length(p) > vRadius) discard;
  }
  vec4 color = texture(uTexture, vUv) * vColor;
  if (color.a <= 0.001) discard;
  outColor = color;
}
`;

const COMPOSITE_VERTEX_SOURCE = `#version 300 es
precision highp float;
in vec2 aPos;
in vec2 aUv;
out vec2 vUv;
void main() {
  vUv = aUv;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

const COMPOSITE_FRAGMENT_SOURCE = `#version 300 es
precision mediump float;
in vec2 vUv;
uniform sampler2D uTexture;
out vec4 outColor;
void main() {
  outColor = texture(uTexture, vUv);
}
`;

const COMPOSITE_VERTICES = new Float32Array([
  -1, -1, 0, 1,
   1, -1, 1, 1,
  -1,  1, 0, 0,
   1,  1, 1, 0,
]);

export class WebGLRenderer extends Renderer {
  static isAvailable() {
    if (typeof document === "undefined" || typeof document.createElement !== "function") {
      return false;
    }
    try {
      const probe = document.createElement("canvas");
      return !!(probe.getContext && probe.getContext("webgl2"));
    } catch (err) {
      return false;
    }
  }

  constructor({ canvas = null, context = null, width = 0, height = 0, options = {} } = {}) {
    super({ canvas, width, height, options });

    if (context) {
      this._gl = context;
    } else if (canvas) {
      this._gl = canvas.getContext("webgl2", options.glAttributes || undefined);
    } else {
      this._gl = null;
    }
    if (!this._gl) {
      throw new Error("WebGLRenderer requires a WebGL2 context.");
    }

    const gl = this._gl;
    this._program = createProgram(gl, VERTEX_SOURCE, FRAGMENT_SOURCE, {
      aCorner: 0, aPos: 1, aRot: 2, aScale: 3, aSize: 4, aUv: 5, aColor: 6, aDepth: 7, aShape: 8,
    });
    this._uMatrixLocation = gl.getUniformLocation(this._program, "uMatrix");
    this._uTextureLocation = gl.getUniformLocation(this._program, "uTexture");

    this._compositeProgram = createProgram(gl, COMPOSITE_VERTEX_SOURCE, COMPOSITE_FRAGMENT_SOURCE, {
      aPos: 0, aUv: 1,
    });
    this._compositeTextureLocation = gl.getUniformLocation(this._compositeProgram, "uTexture");
    this._compositeVertexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this._compositeVertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, COMPOSITE_VERTICES, gl.STATIC_DRAW);
    this._compositeVAO = gl.createVertexArray();
    gl.bindVertexArray(this._compositeVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, this._compositeVertexBuffer);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);

    this._batch = new QuadBatch(gl, { maxInstances: options.maxInstances || 4096 });
    this._textures = new TextureCache(gl);
    this._compositeTexture = gl.createTexture();
    // Without explicit parameters this texture is incomplete (level-0 only,
    // default min filter requests mipmaps), and sampling an incomplete
    // texture returns opaque black — which blacked out the whole frame.
    gl.bindTexture(gl.TEXTURE_2D, this._compositeTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);

    this._immediateBg = new ImmediateCanvas(width, height);
    this._immediateFg = new ImmediateCanvas(width, height);
    this._applyImmediateSmoothing();
    this._backgroundColor = options.backgroundColor ?? null;
    this._clearColor = [0, 0, 0, 0];
    this._trailBatch = null;
    this._tmpParticle = {};
    this._matrix = null;

    this._frameCount = 0;
    this._diagIds = null;
    this._diag = null;
    this._currentTexture = null;

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.DEPTH_TEST);
  }

  beginFrame() {
    this._immediateBg.clear();
    this._immediateFg.clear();
  }

  clear() {
    const gl = this._gl;
    const [r, g, b, a] = this._clearColor;
    gl.clearColor(r, g, b, a);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  render(world) {
    const diag = world.getResource(Diagnostics);
    const ownFrame = diag && !diag.isInsideFrame;
    if (ownFrame) diag.beginFrame(this._frameCount++, 16);

    try {
      this._diag = diag;
      if (diag) this._initDiag(diag);
      const ids = this._diagIds;

      const doRender = () => {
        if (this._immediateBg.dirty) {
          this._compositeOverlay(this._immediateBg);
          this._immediateBg.dirty = false;
        }
        this._setupSpriteFrame(world);
        this._renderQueue(world);
        this._flushBatch();
        this._renderTrails(world);
        this._renderEffects(world);
        this._flushBatch();
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
    this._flushBatch();
    if (this._immediateFg.dirty) {
      this._compositeOverlay(this._immediateFg);
      this._immediateFg.dirty = false;
    }
  }

  _setupSpriteFrame(world) {
    const cfg = world.getResource(RenderConfig);
    this._applyClearColor(cfg);
    const camera = world.getResource(Camera);
    const vp = world.getResource(Viewport);
    const matrix = buildViewProjection(camera, vp, this._width, this._height, !!(cfg && cfg.screenSpace));

    const gl = this._gl;
    gl.useProgram(this._program);
    gl.uniformMatrix4fv(this._uMatrixLocation, false, matrix);
    gl.uniform1i(this._uTextureLocation, 0);
    gl.activeTexture(gl.TEXTURE0);

    this._batch.reset();
    this._currentTexture = null;
    this._matrix = matrix;
    return matrix;
  }

  _renderQueue(world) {
    const queue = world.getResource(RenderQueue);
    if (!queue || queue.count === 0) return;

    const cfg = world.getResource(RenderConfig);
    const camera = world.getResource(Camera);
    const vp = world.getResource(Viewport);

    const gl = this._gl;
    let images = 0, primitives = 0;

    queue.forEachCommandSorted((cmd) => {
      let entry = this._textures.white();
      if (cmd.sourceImage) {
        entry = this._textures.get(cmd.sourceImage, cmd.imageSmoothing);
        images++;
      } else {
        primitives++;
      }

      if (entry.texture !== this._currentTexture) {
        this._flushBatch();
        this._currentTexture = entry.texture;
        gl.bindTexture(gl.TEXTURE_2D, entry.texture);
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

    this._flushBatch();

    if (this._diag && this._diagIds) {
      const ids = this._diagIds;
      if (ids.images >= 0) this._diag.recordCounter(ids.images, images);
      if (ids.primitives >= 0) this._diag.recordCounter(ids.primitives, primitives);
    }
  }

  _flushBatch() {
    if (this._batch.count === 0) return;
    const gl = this._gl;
    // `_textures.get()`/`white()` bind the texture they just created, which
    // may not be the texture the accumulated instances were added under (and
    // even the `white()` upload rebinds). Re-bind the tracked texture so a
    // batch is always drawn with the texture its instances belong to —
    // otherwise a cache-miss upload mid-frame draws the previous sprite with
    // the next sprite's image.
    if (this._currentTexture) {
      gl.bindTexture(gl.TEXTURE_2D, this._currentTexture);
    }
    const diag = this._diag;
    const ids = this._diagIds;
    const doFlush = () => this._batch.flush();
    if (diag && ids && ids.batch >= 0) {
      diag.scope(ids.batch, doFlush);
    } else {
      doFlush();
    }
  }

  _renderTrails(world) {
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
      if (!this._trailBatch) {
        this._trailBatch = new TrailBatch(this._gl, { maxVertices: this._options.maxTrailVertices || 16384 });
      }
      const batch = this._trailBatch;
      batch.reset();
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        batch.addTrail(item.buffer, item.color, item.width);
      }
      batch.flush(this._matrix);

      // Trails use their own program; restore the instanced sprite path for particles.
      this._gl.useProgram(this._program);
      this._currentTexture = null;
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

  _renderEffects(world) {
    const effects = world.effects;
    if (!effects || effects.length === 0) return;

    const ordered = effects.length > 1
      ? effects.slice().sort((a, b) => (a.depth || 0) - (b.depth || 0))
      : effects;

    let sprites = 0, primitives = 0;
    for (let i = 0; i < ordered.length; i++) {
      const effect = ordered[i];
      if (effect._destroyed || effect._finished || !effect._enabled || !effect._visible) continue;
      const res = this._renderEffect(effect);
      sprites += res.sprites;
      primitives += res.primitives;
    }

    this._flushBatch();
    this._restoreSpriteState();

    if (this._diag && this._diagIds) {
      const ids = this._diagIds;
      if (ids.particleSprites >= 0) this._diag.recordCounter(ids.particleSprites, sprites);
      if (ids.particlePrimitives >= 0) this._diag.recordCounter(ids.particlePrimitives, primitives);
    }
  }

  _renderEffect(effect) {
    const backend = effect.system ? effect.system._backend : null;
    if (!backend || backend.activeCount === 0) return { sprites: 0, primitives: 0 };

    const buf = buildBackendCommandBuffer(backend);
    if (!buf || buf.count === 0) return { sprites: 0, primitives: 0 };

    const depth = effect.depth || 0;
    const inst = this._tmpParticle;
    let sprites = 0, primitives = 0;

    for (let i = 0; i < buf.count; i++) {
      readParticleInstance(buf, i, inst);
      if (inst.texture) {
        sprites++;
      } else {
        primitives++;
      }
      this._pushParticle(inst, depth);
    }

    return { sprites, primitives };
  }

  _pushParticle(inst, depth) {
    const gl = this._gl;
    const texture = inst.texture;
    const entry = texture ? this._textures.get(texture, true) : this._textures.white();

    if (entry.texture !== this._currentTexture) {
      this._flushBatch();
      this._currentTexture = entry.texture;
      gl.bindTexture(gl.TEXTURE_2D, entry.texture);
    }

    const w = inst.width > 0 ? inst.width : inst.size;
    const h = inst.height > 0 ? inst.height : inst.size;
    const ox = (0.5 - inst.originX) * w;
    const oy = (0.5 - inst.originY) * h;
    const cosR = Math.cos(inst.rotation);
    const sinR = Math.sin(inst.rotation);

    let u0 = 0, v0 = 0, u1 = 1, v1 = 1;
    if (texture) {
      const iw = entry.width;
      const ih = entry.height;
      if (inst.frameWidth > 0 && inst.frameHeight > 0) {
        u0 = inst.frameX / iw;
        v0 = inst.frameY / ih;
        u1 = (inst.frameX + inst.frameWidth) / iw;
        v1 = (inst.frameY + inst.frameHeight) / ih;
      }
    }

    // The sprite path blends premultiplied alpha (ONE, ONE_MINUS_SRC_ALPHA),
    // so an untextured particle's straight tint must be premultiplied by its
    // alpha or faded particles paint full-strength color and wash out the
    // scene instead of fading. Textured particles keep the straight tint: the
    // uploaded texture is already premultiplied, and the tint multiplies it.
    const a = inst.alpha;
    const tintPremultiplied = texture
      ? inst.r
      : inst.r * a;

    this._batch.add({
      x: inst.x + cosR * ox - sinR * oy,
      y: inst.y + sinR * ox + cosR * oy,
      rotation: texture ? inst.rotation : 0,
      scaleX: 1,
      scaleY: 1,
      width: w,
      height: h,
      u0, v0, u1, v1,
      r: tintPremultiplied,
      g: texture ? inst.g : inst.g * a,
      b: texture ? inst.b : inst.b * a,
      a,
      depth,
      shape: 0,
    });
  }

  _restoreSpriteState() {
    const gl = this._gl;
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(this._program);
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
    const src = cfg && cfg.clearColor != null ? cfg.clearColor : this._backgroundColor;
    if (src == null) {
      this._clearColor = [0, 0, 0, 0];
      return;
    }
    this._clearColor = this._parseColor(src);
  }

  get backgroundColor() { return this._backgroundColor; }
  set backgroundColor(v) { this._backgroundColor = v; }
  setBackgroundColor(v) { this._backgroundColor = v; }

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

  _compositeOverlay(overlay) {
    const gl = this._gl;
    if (!overlay || !overlay.context) return;

    gl.bindTexture(gl.TEXTURE_2D, this._compositeTexture);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, overlay.canvas);

    gl.useProgram(this._compositeProgram);
    gl.uniform1i(this._compositeTextureLocation, 0);
    gl.activeTexture(gl.TEXTURE0);

    gl.bindVertexArray(this._compositeVAO);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);

    gl.useProgram(this._program);
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
    const gl = this._gl;
    gl.viewport(0, 0, this.canvas ? this.canvas.width : width, this.canvas ? this.canvas.height : height);
    this._immediateBg.resize(width, height);
    this._immediateFg.resize(width, height);
    this._applyImmediateSmoothing();
  }

  destroy() {
    const gl = this._gl;
    if (!gl) return;
    this._textures.destroy();
    this._batch.destroy();
    if (this._trailBatch) {
      this._trailBatch.destroy();
      this._trailBatch = null;
    }
    gl.deleteProgram(this._program);
    gl.deleteProgram(this._compositeProgram);
    gl.deleteBuffer(this._compositeVertexBuffer);
    gl.deleteVertexArray(this._compositeVAO);
    gl.deleteTexture(this._compositeTexture);
  }

  get immediateContext() {
    return this._immediateFg.drawingContext;
  }

  get immediateBackgroundContext() {
    return this._immediateBg.drawingContext;
  }

  // The two immediate 2D layers are handed to scene code (render /
  // renderUI) and later composited as textures. Their 2D contexts default to
  // imageSmoothingEnabled = true, which would blur nearest-neighbour drawing
  // (bitmap fonts scaled up, pixel art) on GPU renderers. Match the game's
  // imageSmoothing option on both layers. Re-applied after resize, since
  // resizing a canvas resets its 2D context state.
  _applyImmediateSmoothing() {
    if (this._options.imageSmoothing === undefined) return;
    const bg = this._immediateBg.drawingContext;
    const fg = this._immediateFg.drawingContext;
    if (bg) bg.imageSmoothingEnabled = this._options.imageSmoothing;
    if (fg) fg.imageSmoothingEnabled = this._options.imageSmoothing;
  }

  get gl() {
    return this._gl;
  }
}
