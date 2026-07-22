import { System } from "../core/System.js";
import { Transform } from "../components/Transform.js";
import { Renderable } from "../components/Renderable.js";
import { RenderBounds } from "../components/RenderBounds.js";
import { Visible } from "../components/Visible.js";
import { RenderQueue } from "../render/RenderQueue.js";
import { AssetRegistry } from "../render/AssetRegistry.js";
import { Diagnostics, resolveMetricIds } from "../../debug/index.js";

export class RenderSystem extends System {
  static query = { all: [Transform, Renderable, RenderBounds, Visible] };
  static priority = 3;

  _initDiag(diag) {
    if (this._diagIds) return;
    this._diagIds = resolveMetricIds(diag, {
      populate:   "render.populate",
      commands:   "render.commands",
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

    queue.clear();

    const ids = this._diagIds;
    if (diag && ids && ids.populate >= 0) {
      diag.scope(ids.populate, () => {
        this._populateQueue(queue, ctx);
      });
    } else {
      this._populateQueue(queue, ctx);
    }

    if (diag && ids && ids.commands >= 0) {
      diag.recordCounter(ids.commands, queue.count);
    }
  }

  _populateQueue(queue, ctx) {
    const tid = this._compiled.componentIds.get(Transform);
    const rid = this._compiled.componentIds.get(Renderable);
    const rbid = this._compiled.componentIds.get(RenderBounds);
    const vid = this._compiled.componentIds.get(Visible);

    const assetRegistry = ctx.resources.get(AssetRegistry);

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

        let sourceImage = null, sx = 0, sy = 0, sw = 0, sh = 0;
        const assetId = img[r];
        if (assetId && assetRegistry) {
          const asset = assetRegistry.get(assetId);
          if (asset) {
            sourceImage = asset.sourceImage;
            sx = asset.sx;
            sy = asset.sy;
            sw = asset.sw;
            sh = asset.sh;
          }
        }

        queue.push(
          sourceImage, sx, sy, sw, sh,
          tx[r], ty[r], trot[r], tsx[r], tsy[r],
          rw[r], rh[r], fillCol[r], shape[r], layer[r]
        );
      }
    }
  }
}
