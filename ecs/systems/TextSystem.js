import { System } from "../core/System.js";
import { Transform } from "../components/Transform.js";
import { Renderable } from "../components/Renderable.js";
import { Text } from "../components/Text.js";
import { Visible } from "../components/Visible.js";
import { RenderQueue } from "../render/RenderQueue.js";
import { TextResourcePool } from "../render/TextResourcePool.js";
import { Font } from "../../loaders/Font.js";

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

      const visible = table.getColumn(vid, "value");
      if (!tx || !ty || !trot || !tsx || !tsy || !fillCol || !layer || !depth || !smoothing
          || !fontHandle || !contentHandle || !align || !letterSpacing || !version || !visible) continue;

      for (let r = 0; r < count; r++) {
        if (!visible[r]) continue;
        const handle = contentHandle[r];
        if (handle === 0) continue;

        let layout = pool.layout(handle);
        if (layout === null || version[r] !== pool.layoutVersion(handle)) {
          const font = fontHandle[r] ? Font.byId(fontHandle[r]) : null;
          if (!font || typeof font.glyph !== "function") continue;
          const content = pool.get(handle);
          if (typeof content !== "string") continue;
          const placements = this._layout(font, content, align[r], letterSpacing[r], fillCol[r]);
          pool.setLayout(handle, placements);
          pool.setLayoutVersion(handle, version[r]);
          layout = pool.layout(handle);
          if (layout === null) continue;
        }

        const canvases = layout.canvases;
        const positions = layout.positions;
        const glyphCount = layout.count;
        const canInterp = tiv !== null && tiv[r] === 1;
        const prevX = canInterp && tpx ? tpx[r] : tx[r];
        const prevY = canInterp && tpy ? tpy[r] : ty[r];

        for (let i = 0; i < glyphCount; i++) {
          const canvas = canvases[i];
          const lx = positions[i * 4];
          const ly = positions[i * 4 + 1];
          const w = positions[i * 4 + 2];
          const h = positions[i * 4 + 3];
          queue.push(
            canvas, 0, 0, w, h,
            tx[r] + lx, ty[r] + ly,
            trot[r], tsx[r], tsy[r],
            w, h,
            fillCol[r], 0, layer[r], !!smoothing[r], depth[r],
            prevX + lx, prevY + ly,
            canInterp
          );
        }
      }
    }
  }

  _layout(font, content, align, letterSpacing, color) {
    const placements = [];
    let total = 0;
    for (const ch of content) total += font.advance(ch) + letterSpacing;
    let startX = 0;
    if (align === 1) startX = -total / 2;
    else if (align === 2) startX = -total;
    const tint = color === 0xffffff ? null : "#" + color.toString(16).padStart(6, "0");
    let cx = startX;
    for (const ch of content) {
      const glyph = font.glyph(ch);
      const adv = font.advance(ch) + letterSpacing;
      if (glyph) {
        const source = tint ? font._getTinted(ch, tint) : glyph;
        if (source) {
          placements.push({ canvas: source, x: cx, y: 0, w: source.width, h: source.height });
        }
      }
      cx += adv;
    }
    return placements;
  }
}