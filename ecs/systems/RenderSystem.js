import { System } from "../core/System.js";
import { Transform } from "../components/Transform.js";
import { Renderable } from "../components/Renderable.js";
import { RenderBounds } from "../components/RenderBounds.js";
import { Visible } from "../components/Visible.js";
import { Camera } from "../../camera/Camera.js";
import { RenderQueue } from "../render/RenderQueue.js";
import { CanvasContext } from "../render/CanvasContext.js";
import { Diagnostics } from "../../debug/index.js";

export class RenderSystem extends System {
  static query = { all: [Transform, Renderable, RenderBounds, Visible] };
  static priority = 3;

  _initDiag(diag) {
    if (this._diagInitDone) return;
    this._diagInitDone = true;
    const draw = diag.metrics.find("render.draw");
    if (draw) this._diagDrawId = draw.id;
    const cmds = diag.metrics.find("render.commands");
    if (cmds) this._diagCommandsId = cmds.id;
    const pop = diag.metrics.find("render.populate");
    if (pop) this._diagPopulateId = pop.id;
    const batch = diag.metrics.find("render.batch");
    if (batch) this._diagBatchId = batch.id;
    const img = diag.metrics.find("render.images");
    if (img) this._diagImagesId = img.id;
    const prim = diag.metrics.find("render.primitives");
    if (prim) this._diagPrimitivesId = prim.id;
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

    if (diag && this._diagDrawId !== undefined) {
      diag.scope(this._diagDrawId, () => {
        this._renderAll(diag, queue, canvas, camera, ctx);
      });
    } else {
      this._renderAll(null, queue, canvas, camera, ctx);
    }

    if (diag && this._diagCommandsId !== undefined) {
      diag.recordCounter(this._diagCommandsId, queue.count);
    }
  }

  _renderAll(diag, queue, canvas, camera, ctx) {
    if (diag && this._diagPopulateId !== undefined) {
      diag.scope(this._diagPopulateId, () => {
        this._populateQueue(queue, ctx);
      });
    } else {
      this._populateQueue(queue, ctx);
    }

    if (diag && this._diagBatchId !== undefined) {
      diag.scope(this._diagBatchId, () => {
        queue.execute(canvas, camera);
      });
      if (this._diagImagesId !== undefined)
        diag.recordCounter(this._diagImagesId, queue.imagesDrawn);
      if (this._diagPrimitivesId !== undefined)
        diag.recordCounter(this._diagPrimitivesId, queue.primitivesDrawn);
    } else {
      queue.execute(canvas, camera);
    }
  }

  _populateQueue(queue, ctx) {
    const tid = this._compiled.componentIds.get(Transform);
    const rid = this._compiled.componentIds.get(Renderable);
    const rbid = this._compiled.componentIds.get(RenderBounds);
    const vid = this._compiled.componentIds.get(Visible);

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
  }
}
