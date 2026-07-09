import { System } from "../core/System.js";
import { Transform } from "../components/Transform.js";
import { Trail } from "../components/Trail.js";
import { Visible } from "../components/Visible.js";
import { TrailManager } from "../trails/TrailManager.js";
import { CanvasContext } from "../render/CanvasContext.js";
import { Camera } from "../../camera/Camera.js";
import { Diagnostics, resolveMetricIds } from "../../debug/index.js";

export class TrailSystem extends System {
  static query = { all: [Transform, Trail, Visible] };
  static priority = 4;

  constructor() {
    super();
    this._prevSet = new Set();
    this._currSet = new Set();
    this._colorCache = new Map();
  }

  _initDiag(diag) {
    if (this._diagIds) return;
    this._diagIds = resolveMetricIds(diag, {
      trails:   "render.trails",
      segments: "render.trails.segments",
      lines:    "render.trails.lines",
      ribbons:  "render.trails.ribbons",
    });
  }

  _getColorString(color) {
    let s = this._colorCache.get(color);
    if (!s) {
      s = "#" + color.toString(16).padStart(6, "0");
      this._colorCache.set(color, s);
    }
    return s;
  }

  update(ctx, dt) {
    const tid = this._compiled.componentIds.get(Transform);
    const tlid = this._compiled.componentIds.get(Trail);
    const vid = this._compiled.componentIds.get(Visible);
    if (tid === undefined || tlid === undefined || vid === undefined) return;

    const diag = ctx.resources.get(Diagnostics);
    if (diag) this._initDiag(diag);

    const manager = ctx.resources.get(TrailManager);
    if (!manager) {
      throw new Error(
        "TrailSystem.update failed: TrailManager resource is not set. " +
        "Use world.setResource(TrailManager, manager) before updating."
      );
    }

    const canvas = ctx.resources.get(CanvasContext);
    if (!canvas) {
      throw new Error(
        "TrailSystem.update failed: CanvasContext resource is not set. " +
        "Use world.setResource(CanvasContext, ctx) before updating."
      );
    }

    const camera = ctx.resources.get(Camera);

    this._currSet.clear();

    let segments = 0, lines = 0, ribbons = 0;

    const doRender = () => {
      canvas.save();
      if (camera) camera.apply(canvas);

      for (const table of ctx) {
        const count = table.count;
        if (count === 0) continue;

        const tx = table.getColumn(tid, "x");
        const ty = table.getColumn(tid, "y");
        const enabledCol = table.getColumn(tlid, "enabled");
        const maxPointsCol = table.getColumn(tlid, "maxPoints");
        const spacingCol = table.getColumn(tlid, "spacing");
        const visibleCol = table.getColumn(vid, "value");
        const entities = table.entityIds;
        if (!tx || !ty || !enabledCol || !maxPointsCol || !spacingCol || !visibleCol || !entities) continue;

        const colorCol = table.getColumn(tlid, "color");
        const widthCol = table.getColumn(tlid, "width");
        const modeCol = table.getColumn(tlid, "mode");

        for (let r = 0; r < count; r++) {
          const eid = entities[r];
          this._currSet.add(eid);

          if (!visibleCol[r] || !enabledCol[r]) continue;

          const maxP = maxPointsCol[r];
          if (maxP < 2) continue;

          const sp = spacingCol[r];
          if (sp <= 0) continue;

          const buffer = manager.getOrCreate(eid, maxP);
          const dx = tx[r] - buffer._lastX;
          const dy = ty[r] - buffer._lastY;
          const distSq = dx * dx + dy * dy;
          if (distSq === 0) continue;

          const dist = Math.sqrt(distSq);
          const oldAccum = buffer._accumulated;
          buffer._accumulated += dist;
          const needed = Math.min((buffer._accumulated / sp) | 0, maxP);
          if (needed > 0) {
            for (let s = 0; s < needed; s++) {
              const t = (sp - oldAccum + s * sp) / dist;
              buffer.addPoint(buffer._lastX + dx * t, buffer._lastY + dy * t);
            }
            buffer._accumulated -= needed * sp;
          }

          buffer._lastX = tx[r];
          buffer._lastY = ty[r];

          if (buffer.count >= 2) {
            segments += buffer.count - 1;
            const width = widthCol[r];
            if (modeCol[r] === 1) {
              this._renderRibbon(canvas, buffer, colorCol[r], width);
              ribbons++;
            } else {
              this._renderLine(canvas, buffer, colorCol[r], width);
              lines++;
            }
          }
        }
      }

      canvas.restore();
    };

    const ids = this._diagIds;
    if (diag && ids && ids.trails >= 0) {
      diag.scope(ids.trails, doRender);
    } else {
      doRender();
    }

    if (diag && ids) {
      if (ids.segments >= 0) diag.recordCounter(ids.segments, segments);
      if (ids.lines >= 0) diag.recordCounter(ids.lines, lines);
      if (ids.ribbons >= 0) diag.recordCounter(ids.ribbons, ribbons);
    }

    for (const eid of this._prevSet) {
      if (!this._currSet.has(eid)) {
        manager.remove(eid);
      }
    }

    const tmp = this._prevSet;
    this._prevSet = this._currSet;
    this._currSet = tmp;
  }

  _renderLine(ctx, buffer, color, width) {
    ctx.strokeStyle = this._getColorString(color);
    ctx.lineWidth = width;
    ctx.beginPath();
    buffer.forEachPoint((x, y, i) => {
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();
  }

  _renderRibbon(ctx, buffer, color, width) {
    ctx.fillStyle = this._getColorString(color);
    const hw = width * 0.5;
    ctx.beginPath();

    let prevX, prevY;
    let first = true;

    buffer.forEachPoint((x, y, i) => {
      if (first) {
        prevX = x;
        prevY = y;
        first = false;
        return;
      }

      const dx = x - prevX;
      const dy = y - prevY;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len < 1e-10) return;

      const nx = -dy / len;
      const ny = dx / len;
      const lx = prevX - nx * hw;
      const ly = prevY - ny * hw;
      const lx1 = x - nx * hw;
      const ly1 = y - ny * hw;
      const rx = prevX + nx * hw;
      const ry = prevY + ny * hw;
      const rx1 = x + nx * hw;
      const ry1 = y + ny * hw;

      ctx.moveTo(lx, ly);
      ctx.lineTo(lx1, ly1);
      ctx.lineTo(rx1, ry1);
      ctx.lineTo(rx, ry);
      ctx.lineTo(lx, ly);

      prevX = x;
      prevY = y;
    });

    ctx.fill();
  }
}
