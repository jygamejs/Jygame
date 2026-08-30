import { RendererResolver } from "./RendererResolver.js";

const _RENDERER_NAMES = {
  webgpu: "WebGPU",
  webgl: "WebGL",
  canvas: "Canvas",
};

function _rendererLabel(kind) {
  if (!kind) return "Renderer";
  return _RENDERER_NAMES[kind] || kind;
}

function _errorMessage(err) {
  return err && err.message ? err.message : String(err);
}

// Owns the presentation surface: the canvas, the active renderer, the ordered
// fallback chain, and viewport scaling.
//
// This was ~190 lines inside Game, tangled with the scene stack and the frame
// loop. It is the fiddliest code in the engine — a renderer that reaches its
// constructor permanently claims the canvas's context mode, so every fallback
// attempt needs a fresh canvas swapped into the DOM — and it was almost
// entirely untested because exercising it meant standing up a whole Game.
//
// The only thing it needs from the outside is a nudge when the renderer
// changes, so scenes can re-point their world resources: that is
// `onRendererChanged`.
export class RendererHost {
  constructor({
    host,
    container,
    renderer = "canvas",
    width = 800,
    height = 600,
    imageSmoothing = true,
    backgroundColor = null,
    onRendererChanged = null,
  }) {
    this._host = host;
    this._container = container;
    this._width = width;
    this._height = height;
    this._imageSmoothing = imageSmoothing;
    this._backgroundColor = backgroundColor;
    this._onRendererChanged = onRendererChanged;
    this._destroyed = false;
    this._noRendererWarned = false;
    this._viewport = null;
    this._resizeObserver = null;
    this._resizeHandler = null;

    this.canvas = host.createElement("canvas");
    this.canvas.width = width;
    this.canvas.height = height;
    this.canvas.style.display = "block";
    if (container) container.appendChild(this.canvas);

    // Ordered fallback chain (e.g. WebGPU → WebGL → Canvas). When the resolved
    // renderer fails to initialize (or construct), the host walks the chain
    // and logs each fallback instead of silently keeping a broken renderer.
    this._chain = RendererResolver.chain(renderer);
    this._index = 0;
    this.renderer = null;
    this.ctx = null;

    // Deliberately unguarded. A named renderer is a requirement: if WebGPU or
    // WebGL2 cannot be obtained, that throws out of the constructor so the
    // caller finds out immediately. "auto" resolves without throwing — it
    // degrades internally — so only an explicit request can fail here.
    const initial = RendererResolver.resolve({
      renderer,
      canvas: this.canvas,
      width,
      height,
      options: { imageSmoothing, backgroundColor: this._backgroundColor },
    });

    this.renderer = initial;
    this._index = Math.max(0, this._chain.indexOf(RendererResolver.kindOf(initial)));

    // Apply initial backgroundColor to the resolved renderer
    if (this._backgroundColor != null && this.renderer) {
      this.backgroundColor = this._backgroundColor;
    }

    if (this.renderer && typeof this.renderer.initialize === "function") {
      this._initRenderer(this.renderer);
    }

    // _initRenderer may already have swapped the renderer synchronously.
    if (!this.ctx) {
      this.ctx = this.renderer ? this.renderer.immediateContext : null;
      if (this.ctx) this.ctx.imageSmoothingEnabled = imageSmoothing;
    }
  }

  get width() { return this._width; }
  get height() { return this._height; }
  get imageSmoothing() { return this._imageSmoothing; }
  get backgroundColor() { return this._backgroundColor; }
  set backgroundColor(v) {
    this._backgroundColor = v;
    // Propagate to current renderer if it supports a background
    if (this.renderer) {
      if (typeof this.renderer.setBackgroundColor === "function") {
        this.renderer.setBackgroundColor(v);
      } else if ("backgroundColor" in this.renderer) {
        this.renderer.backgroundColor = v;
      } else if (this.renderer._backgroundColor !== undefined) {
        this.renderer._backgroundColor = v;
      }
      // WebGL/WebGPU also use RenderConfig per world; Game will set that directly.
      // For Canvas without a world, keep the host value as fallback.
    }
  }
  get chain() { return this._chain; }
  get kind() { return this._chain[this._index] || null; }
  get viewport() { return this._viewport; }

  resize(width, height) {
    this._width = width;
    this._height = height;
    if (this.renderer) this.renderer.resize(width, height);
  }

  // Logged once per outage rather than every frame; installing a renderer
  // clears the latch so a later failure reports again.
  warnNoRenderer() {
    if (this._noRendererWarned) return;
    this._noRendererWarned = true;
    console.warn(
      "[jygame] No renderer available — the game continues to update but nothing is drawn.",
    );
  }

  // ─── Fallback chain ─────────────────────────────────

  _initRenderer(instance) {
    let init;
    try {
      init = instance.initialize();
    } catch (err) {
      this._fallback(instance, _errorMessage(err));
      return;
    }
    Promise.resolve(init).catch((err) => {
      this._fallback(instance, _errorMessage(err));
    });
  }

  _fallback(failed, reason) {
    if (this._destroyed) return;
    const chain = this._chain;
    let i = this._index + 1;
    while (i < chain.length) {
      const kind = chain[i];
      // A renderer that reached its constructor (e.g. WebGPU calling
      // `canvas.getContext("webgpu")`) permanently claims the canvas's context
      // mode, so every fallback attempt needs its own fresh canvas or the next
      // `getContext(...)` returns null and the renderer silently no-ops.
      const fresh = this._createCanvas();
      let next;
      try {
        next = RendererResolver.resolveKind(kind, {
          canvas: fresh,
          width: this._width,
          height: this._height,
          options: { imageSmoothing: this._imageSmoothing, backgroundColor: this._backgroundColor },
        });
      } catch (err) {
        this._logFallback(kind, _errorMessage(err), chain[i + 1]);
        i++;
        continue;
      }
      const fromKind = RendererResolver.kindOf(failed) || chain[this._index] || kind;
      this._logFallback(fromKind, reason, kind);
      this._install(next, i, fresh);
      if (typeof next.initialize === "function") {
        this._initRenderer(next);
      }
      return;
    }
    this._destroyRenderer(failed);
    this.renderer = null;
    this.ctx = null;
    this._logFallback(RendererResolver.kindOf(failed) || chain[this._index], reason, null);
    this._notifyChanged();
  }

  _install(next, index, freshCanvas) {
    if (this._destroyed) {
      this._destroyRenderer(next);
      return;
    }
    this._destroyRenderer(this.renderer);
    if (freshCanvas && freshCanvas !== this.canvas) {
      this._replaceCanvas(freshCanvas);
    }
    this._index = index;
    this.renderer = next;
    this._noRendererWarned = false;
    this.ctx = next ? next.immediateContext : null;
    if (this.ctx) {
      this.ctx.imageSmoothingEnabled = this._imageSmoothing;
    }
    if (this._backgroundColor != null && next) {
      if (typeof next.setBackgroundColor === "function") {
        next.setBackgroundColor(this._backgroundColor);
      } else if ("backgroundColor" in next) {
        next.backgroundColor = this._backgroundColor;
      } else if (next._backgroundColor !== undefined) {
        next._backgroundColor = this._backgroundColor;
      }
    }
    this._notifyChanged();
    console.info(`[jygame] Using ${_rendererLabel(this._chain[index])} renderer.`);
  }

  _notifyChanged() {
    if (this._onRendererChanged) this._onRendererChanged(this.renderer, this.ctx);
  }

  _createCanvas() {
    const canvas = this._host.createElement("canvas");
    canvas.width = this._width;
    canvas.height = this._height;
    if (this.canvas) {
      canvas.className = this.canvas.className;
      canvas.id = this.canvas.id;
      if (typeof canvas.style.cssText === "string" && typeof this.canvas.style.cssText === "string") {
        canvas.style.cssText = this.canvas.style.cssText;
      }
    }
    return canvas;
  }

  _replaceCanvas(fresh) {
    const old = this.canvas;
    const parent = old ? old.parentNode || old.parentElement : null;
    if (parent && old !== fresh) {
      if (typeof parent.replaceChild === "function") {
        try {
          parent.replaceChild(fresh, old);
        } catch (err) {
          /* fall through to append fallback below */
        }
      }
      if (fresh.parentNode !== parent) {
        if (old && old.parentNode === parent && typeof parent.removeChild === "function") {
          parent.removeChild(old);
        }
        if (typeof parent.appendChild === "function") {
          parent.appendChild(fresh);
        }
      }
    }
    this.canvas = fresh;
  }

  _logFallback(kind, reason, toKind) {
    const from = _rendererLabel(kind);
    if (toKind) {
      console.info(
        `[jygame] ${from} unavailable (${reason}) — falling back to ${_rendererLabel(toKind)}.`,
      );
    } else {
      console.warn(`[jygame] ${from} unavailable (${reason}); no fallback renderer available.`);
    }
  }

  _destroyRenderer(renderer) {
    if (renderer && typeof renderer.destroy === "function") {
      try {
        renderer.destroy();
      } catch (err) {
        /* ignore renderer teardown errors during fallback */
      }
    }
  }

  // ─── Viewport scaling ───────────────────────────────

  // `scaleToFit` scales a target element so the game's logical size fits the
  // available viewport. It is presentation, not simulation, so it lives here.
  enableScaleToFit(scaleToFit) {
    if (!scaleToFit) return;
    const vp = scaleToFit === true
      ? { width: this._width, height: this._height, padding: 0, element: undefined }
      : scaleToFit;
    const target = typeof vp.element === "string"
      ? this._host.querySelector(vp.element) || this._host.documentElement
      : vp.element || this._host.documentElement;

    this._viewport = {
      width: vp.width ?? this._width,
      height: vp.height ?? this._height,
      padding: vp.padding ?? 0,
      target,
    };

    this.applyViewport();
    this._resizeObserver = this._host.observeResize(() => this.applyViewport());
    this._resizeHandler = () => this.applyViewport();
    this._host.onWindow("resize", this._resizeHandler);
  }

  applyViewport() {
    if (!this._viewport) return;
    const { target } = this._viewport;
    const doc = this._host.documentElement;
    const style = this._host.computedStyle(doc);
    const cssScale = style.getPropertyValue("--jygame-scale").trim();
    if (cssScale) {
      const s = parseFloat(cssScale);
      const mv = style.getPropertyValue("--jygame-margin-v").trim();
      target.style.transform = `scale(${s})`;
      target.style.marginTop = mv;
      target.style.marginBottom = mv;
      doc.style.removeProperty("--jygame-scale");
      doc.style.removeProperty("--jygame-margin-v");
      if (this.renderer) this.renderer.resize(this._width, this._height);
      return;
    }
    const { width: vpW, height: vpH, padding: pad } = this._viewport;
    const availW = this._host.viewportWidth - pad * 2;
    const availH = this._host.viewportHeight - pad * 2;
    const scale = Math.min(1, availW / vpW, availH / vpH);
    const visualH = vpH * scale;
    const marginV = ((vpH - visualH) / 2) * -1;
    target.style.transform = `scale(${scale})`;
    target.style.marginTop = marginV + "px";
    target.style.marginBottom = marginV + "px";
    if (this.renderer) this.renderer.resize(this._width, this._height);
  }

  destroy() {
    this._destroyed = true;
    if (this._resizeHandler) {
      this._host.offWindow("resize", this._resizeHandler);
      this._resizeHandler = null;
    }
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }
    this._destroyRenderer(this.renderer);
    this.renderer = null;
    this.ctx = null;
  }
}
