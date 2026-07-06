import { System } from "../core/System.js";
import { Transform } from "../components/Transform.js";
import { Renderable } from "../components/Renderable.js";
import { RenderBounds } from "../components/RenderBounds.js";
import { Visible } from "../components/Visible.js";
import { Camera } from "../../camera/Camera.js";
import { RenderQueue } from "../render/RenderQueue.js";
import { CanvasContext } from "../render/CanvasContext.js";
import { Diagnostics, MetricCategory, MetricUnit, MetricType }
  from "../../debug/index.js";

export class RenderSystem extends System {
  static query = { all: [Transform, Renderable, RenderBounds, Visible] };
  static priority = 3;

  _initDiag(diag) {
    if (this._diagInitDone) return;
    this._diagInitDone = true;
    this._diagDrawId = diag.registerDynamicMetric({
      name: "render.draw",
      displayName: "Render Draw",
      category: MetricCategory.RENDER,
      group: "Render",
      unit: MetricUnit.MILLISECONDS,
      type: MetricType.TIMER,
      tags: Object.freeze(["render"]),
    });
    this._diagDrawCallsId = diag.registerDynamicMetric({
      name: "render.drawCalls",
      displayName: "Draw Calls",
      category: MetricCategory.RENDER,
      group: "Render",
      unit: MetricUnit.COUNT,
      type: MetricType.GAUGE,
      tags: Object.freeze(["render"]),
    });
  }

  update(ctx, dt) {
    const tid = this._compiled.componentIds.get(Transform);
    const rid = this._compiled.componentIds.get(Renderable);
    const rbid = this._compiled.componentIds.get(RenderBounds);
    const vid = this._compiled.componentIds.get(Visible);
    if (tid === undefined || rid === undefined || rbid === undefined || vid === undefined) return;

    const diag = ctx.resources.get(Diagnostics);
    if (diag) this._initDiag(diag);

    const queue = ctx.resources.get(RenderQueue);
    if (!queue) {
      throw new Error(
        "RenderSystem.update failed: RenderQueue resource is not set. " +
        "Use world.setResource(RenderQueue, queue) before updating."
      );
    }

    const canvas = ctx.resources.get(CanvasContext);
    if (!canvas) {
      throw new Error(
        "RenderSystem.update failed: CanvasContext resource is not set. " +
        "Use world.setResource(CanvasContext, ctx) before updating."
      );
    }

    const camera = ctx.resources.get(Camera);

    queue.clear();

    for (const table of ctx) {
      const count = table.count;
      if (count === 0) continue;

      const tx = table.getColumn(tid, "x");
      const ty = table.getColumn(tid, "y");
      const trot = table.getColumn(tid, "rotation");
      const tsx = table.getColumn(tid, "scaleX");
      const tsy = table.getColumn(tid, "scaleY");
      const img = table.getColumn(rid, "image");
      const fillCol = table.getColumn(rid, "fillColor");
      const shape = table.getColumn(rid, "shape");
      const layer = table.getColumn(rid, "layer");
      const rw = table.getColumn(rbid, "width");
      const rh = table.getColumn(rbid, "height");
      const visible = table.getColumn(vid, "value");
      if (!tx || !ty || !trot || !tsx || !tsy || !img || !fillCol || !shape || !layer || !rw || !rh || !visible) continue;

      for (let r = 0; r < count; r++) {
        if (!visible[r]) continue;
        queue.push(
          img[r], tx[r], ty[r], trot[r], tsx[r], tsy[r],
          rw[r], rh[r], fillCol[r], shape[r], layer[r]
        );
      }
    }

    if (diag && this._diagDrawId !== undefined) {
      diag.scope(this._diagDrawId, () => {
        queue.execute(canvas, camera);
      });
    } else {
      queue.execute(canvas, camera);
    }

    if (diag && this._diagDrawCallsId !== undefined) {
      diag.recordGauge(this._diagDrawCallsId, queue.count);
    }
  }
}
