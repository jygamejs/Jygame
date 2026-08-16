import { System } from "../core/System.js";
import { Transform } from "../components/Transform.js";
import { Renderable } from "../components/Renderable.js";
import { Text } from "../components/Text.js";
import { Visible } from "../components/Visible.js";
import { RenderQueue } from "../render/RenderQueue.js";
import { TextResourcePool } from "../render/TextResourcePool.js";
import { layoutText } from "../render/TextLayout.js";
import { rasterizeText } from "../render/TextRasterizer.js";
import { Font } from "../../loaders/Font.js";

// TextSystem converts each Text entity into its single rasterized
// representation and emits exactly ONE RenderQueue command for it — the text
// is one texture, one region, one quad, regardless of how many glyphs it has.
//
// Two independent caches live in the TextResourcePool, invalidated separately:
//
//   version         (Text.version)          → layout cache (glyph records + positions)
//   surfaceVersion  (Text.surfaceVersion)   → rasterized bitmap cache
//
// Layout-affecting changes (content, font, alignment, letter spacing) bump
// both; a color change bumps only surfaceVersion (the bitmap must be redrawn
// with the new tint, but the positions are unchanged). Transform and
// Renderable changes never bump either — they are applied at draw time.
//
// Layout is computed by `layoutText` (TextLayout.js) purely from the font's
// glyph records — never from a concrete image representation — and the
// surface is rasterized by `rasterizeText` (TextRasterizer.js) from those
// records' regions. Both stages are representation-independent.
export class TextSystem extends System {
  static query = { all: [Transform, Renderable, Text, Visible] };
  static priority = 4;

  constructor() {
    super();
    this._releaseHook = null;
  }

  onAdded(world) {
    this._releaseHook = (entity) => {
      const pool = world.getResource(TextResourcePool);
      if (!pool || !world.has(entity, Text)) return;
      const handle = world.get(entity, Text).contentHandle;
      if (handle !== 0) pool.release(handle);
    };
    world.onEntityDestroyed(this._releaseHook);
  }

  onRemoved(world) {
    if (this._releaseHook) {
      world.offEntityDestroyed(this._releaseHook);
      this._releaseHook = null;
    }
  }

  update(ctx, dt) {
    const tid = this._compiled.componentIds.get(Transform);
    const rid = this._compiled.componentIds.get(Renderable);
    const txid = this._compiled.componentIds.get(Text);
    const vid = this._compiled.componentIds.get(Visible);
    if (tid === undefined || rid === undefined || txid === undefined || vid === undefined) return;

    const queue = ctx.resources.get(RenderQueue);
    if (!queue) {
      throw new Error(
        "TextSystem.update failed: RenderQueue resource is not set. " +
        "Use world.setResource(RenderQueue, queue) before updating."
      );
    }
    const pool = ctx.resources.get(TextResourcePool);
    if (!pool) {
      throw new Error(
        "TextSystem.update failed: TextResourcePool resource is not set. " +
        "Use world.setResource(TextResourcePool, pool) before updating."
      );
    }

    const interp = queue.interpolation;

    for (const table of ctx) {
      const count = table.count;
      if (count === 0) continue;

      const tx = table.getColumn(tid, "x");
      const ty = table.getColumn(tid, "y");
      const trot = table.getColumn(tid, "rotation");
      const tsx = table.getColumn(tid, "scaleX");
      const tsy = table.getColumn(tid, "scaleY");
      const tpx = interp ? table.getColumn(tid, "_prevX") : null;
      const tpy = interp ? table.getColumn(tid, "_prevY") : null;
      const tiv = interp ? table.getColumn(tid, "_interpValid") : null;

      const fillCol = table.getColumn(rid, "fillColor");
      const layer = table.getColumn(rid, "layer");
      const depth = table.getColumn(rid, "depth");
      const smoothing = table.getColumn(rid, "imageSmoothing");

      const fontHandle = table.getColumn(txid, "fontHandle");
      const contentHandle = table.getColumn(txid, "contentHandle");
      const align = table.getColumn(txid, "align");
      const letterSpacing = table.getColumn(txid, "letterSpacing");
      const version = table.getColumn(txid, "version");
      const colorEnabled = table.getColumn(txid, "colorEnabled");
      const surfaceVersion = table.getColumn(txid, "surfaceVersion");

      const visible = table.getColumn(vid, "value");
      if (!tx || !ty || !trot || !tsx || !tsy || !fillCol || !layer || !depth || !smoothing
          || !fontHandle || !contentHandle || !align || !letterSpacing || !version || !colorEnabled
          || !surfaceVersion || !visible) continue;

      for (let r = 0; r < count; r++) {
        if (!visible[r]) continue;
        const handle = contentHandle[r];
        if (handle === 0) continue;

        let layout = pool.layout(handle);
        let relayouted = false;
        if (layout === null || version[r] !== pool.layoutVersion(handle)) {
          const font = fontHandle[r] ? Font.byId(fontHandle[r]) : null;
          if (!font || typeof font.getGlyph !== "function") continue;
          const content = pool.get(handle);
          if (typeof content !== "string") continue;
          layout = pool.layoutTarget(handle);
          if (!layout) continue;
          layoutText(layout, font, content, align[r], letterSpacing[r]);
          pool.setLayout(handle, layout);
          pool.setLayoutVersion(handle, version[r]);
          relayouted = true;
        }
        if (layout === null || layout.count === 0) continue;

        if (relayouted || surfaceVersion[r] !== pool.surfaceVersion(handle)) {
          const font = fontHandle[r] ? Font.byId(fontHandle[r]) : null;
          if (!font || typeof font.getTintedGlyph !== "function") continue;
          const tint = colorEnabled[r] ? "#" + fillCol[r].toString(16).padStart(6, "0") : null;
          const surface = pool.ensureSurface(handle, layout.width, layout.height);
          if (!surface) continue;
          const sctx = surface.getContext("2d");
          sctx.clearRect(0, 0, surface.width, surface.height);
          rasterizeText(sctx, font, layout, tint);
          pool.setSurfaceVersion(handle, surfaceVersion[r]);
        }

        const surface = pool.surface(handle);
        if (!surface) continue;

        const canInterp = tiv !== null && tiv[r] === 1;
        const prevX = canInterp && tpx ? tpx[r] : tx[r];
        const prevY = canInterp && tpy ? tpy[r] : ty[r];

        queue.push(
          surface, 0, 0, layout.width, layout.height,
          tx[r] + layout.drawX, ty[r],
          trot[r], tsx[r], tsy[r],
          layout.width, layout.height,
          fillCol[r], 0, layer[r], !!smoothing[r], depth[r],
          prevX + layout.drawX, prevY,
          canInterp
        );
      }
    }
  }
}