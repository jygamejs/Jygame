import { System } from "../core/System.js";
import { Transform } from "../components/Transform.js";
import { Renderable } from "../components/Renderable.js";
import { Text } from "../components/Text.js";
import { Visible } from "../components/Visible.js";
import { RenderQueue } from "../render/RenderQueue.js";
import { TextResourcePool } from "../render/TextResourcePool.js";
import { TextRenderMode, renderModeName } from "../render/TextRenderMode.js";
import { layoutText } from "../render/TextLayout.js";
import { rasterizeText } from "../render/TextRasterizer.js";
import { GlyphBuffer } from "../render/GlyphBuffer.js";
import { fillGlyphBuffer, pushGlyphs } from "../render/GlyphRenderer.js";
import { Font } from "../../loaders/Font.js";

// TextSystem is the coordinator between the two text representations.  It
// resolves entity state, obtains the shared cached TextLayout, then dispatches
// to the representation chosen by `Text.renderMode`:
//
//   RASTERIZED  → TextRasterizer → one cached surface → ONE RenderQueue command
//   GLYPH       → GlyphRenderer  → reusable GlyphBuffer → N RenderQueue commands
//
// Both representations consume the SAME layout (computed by `layoutText` from
// the font's glyph records) and the SAME glyph-region contract.  The layout is
// renderer-independent — it is shared, never duplicated per mode.
//
// Two independent caches live in the TextResourcePool, invalidated separately:
//
//   version         (Text.version)          → layout cache (glyph records + positions)
//   surfaceVersion  (Text.surfaceVersion)   → rasterized bitmap cache
//
// Layout-affecting changes (content, font, alignment, letter spacing) bump
// both; a color change bumps only surfaceVersion (the bitmap must be redrawn
// with the new tint, but the positions are unchanged). A render-mode change
// bumps NEITHER — it only selects which representation consumes the existing
// layout. Transform and Renderable changes never bump either.
//
// A single reusable `GlyphBuffer` is shared by every GLYPH entity in the
// world; it is cleared and refilled per entity, so switching modes or iterating
// many text entities never allocates.
export class TextSystem extends System {
  static query = { all: [Transform, Renderable, Text, Visible] };
  static priority = 4;

  constructor() {
    super();
    this._releaseHook = null;
    this._glyphBuffer = new GlyphBuffer(16);
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
      const renderMode = table.getColumn(txid, "renderMode");

      const visible = table.getColumn(vid, "value");
      if (!tx || !ty || !trot || !tsx || !tsy || !fillCol || !layer || !depth || !smoothing
          || !fontHandle || !contentHandle || !align || !letterSpacing || !version || !colorEnabled
          || !surfaceVersion || !renderMode || !visible) continue;

      for (let r = 0; r < count; r++) {
        if (!visible[r]) continue;
        const handle = contentHandle[r];
        if (handle === 0) continue;

        // Capability contract: the font must declare support for the entity's
        // render mode. This is checked every frame (not only at relayout) so a
        // raw ECS font/mode mutation can never slip an unsupported combination
        // past the boundary into a renderer — it fails clearly instead.
        const font = fontHandle[r] ? Font.byId(fontHandle[r]) : null;
        if (!font) continue;
        if (typeof font.supportsRenderMode !== "function" || !font.supportsRenderMode(renderMode[r])) {
          throw new Error(
            `Text: font "${font.name}" does not support render mode "${renderModeName(renderMode[r])}".`
          );
        }
        if (typeof font.getGlyph !== "function") continue;

        let layout = pool.layout(handle);
        let relayouted = false;
        if (layout === null || version[r] !== pool.layoutVersion(handle)) {
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

        const canInterp = tiv !== null && tiv[r] === 1;
        const prevX = canInterp && tpx ? tpx[r] : tx[r];
        const prevY = canInterp && tpy ? tpy[r] : ty[r];

        if (renderMode[r] === TextRenderMode.GLYPH) {
          this._renderGlyph(queue, pool, handle, layout, fontHandle[r], colorEnabled[r], fillCol[r],
            tx[r], ty[r], trot[r], tsx[r], tsy[r], prevX, prevY, canInterp,
            layer[r], depth[r], !!smoothing[r]);
        } else {
          this._renderRasterized(queue, pool, handle, layout, relayouted, fontHandle[r], colorEnabled[r],
            surfaceVersion[r], fillCol[r], layer[r], depth[r], !!smoothing[r],
            tx[r], ty[r], trot[r], tsx[r], tsy[r], prevX, prevY, canInterp);
        }
      }
    }
  }

  // Glyph representation: each glyph stays an independent RenderQueue command
  // via the reusable GlyphBuffer.  The buffer is filled per entity (cleared
  // and refilled in place) and pushed immediately — no per-frame allocation.
  _renderGlyph(queue, pool, handle, layout, fontHandle, colorEnabled, fillCol,
               tx, ty, trot, tsx, tsy, prevX, prevY, canInterp,
               layer, depth, imageSmoothing) {
    // Untinted glyphs resolve straight from the layout's stored records — no
    // font registry lookup needed.  Only a color override requires the font to
    // bake a tinted record.
    let font = null;
    let tint = null;
    if (colorEnabled) {
      font = fontHandle ? Font.byId(fontHandle) : null;
      if (!font || typeof font.getTintedGlyph !== "function") return;
      tint = "#" + fillCol.toString(16).padStart(6, "0");
    }

    fillGlyphBuffer(this._glyphBuffer, layout, font, tint);
    pushGlyphs(queue, this._glyphBuffer, tx, ty, trot, tsx, tsy, prevX, prevY, canInterp,
      layer, depth, fillCol, imageSmoothing);
  }

  // Rasterized representation: the whole text is composited into one cached
  // surface and emitted as a single RenderQueue command.  The surface is only
  // rebuilt when the surfaceVersion changed (a color change or a fresh layout);
  // everything else reuses the cached surface.
  _renderRasterized(queue, pool, handle, layout, relayouted, fontHandle, colorEnabled,
                    surfaceVersion, fillCol, layer, depth, imageSmoothing,
                    tx, ty, trot, tsx, tsy, prevX, prevY, canInterp) {
    if (relayouted || surfaceVersion !== pool.surfaceVersion(handle)) {
      const font = fontHandle ? Font.byId(fontHandle) : null;
      if (!font || typeof font.getTintedGlyph !== "function") return;
      const tint = colorEnabled ? "#" + fillCol.toString(16).padStart(6, "0") : null;
      const surface = pool.ensureSurface(handle, layout.width, layout.height);
      if (!surface) return;
      const sctx = surface.getContext("2d");
      sctx.clearRect(0, 0, surface.width, surface.height);
      rasterizeText(sctx, font, layout, tint);
      pool.setSurfaceVersion(handle, surfaceVersion);
    }

    const surface = pool.surface(handle);
    if (!surface) return;

    queue.push(
      surface, 0, 0, layout.width, layout.height,
      tx + layout.drawX, ty,
      trot, tsx, tsy,
      layout.width, layout.height,
      fillCol, 0, layer, imageSmoothing, depth,
      prevX + layout.drawX, prevY,
      canInterp
    );
  }
}
