import { System } from "../core/System.js";
import { Transform } from "../components/Transform.js";
import { Collider } from "../components/Collider.js";
import { Visible } from "../components/Visible.js";
import { SpatialHash } from "../../collision/SpatialHash.js";
import { CollisionQuery } from "../collision/CollisionQuery.js";
import { Diagnostics, MetricCategory, MetricUnit, MetricType }
  from "../../debug/index.js";

export class CollisionSystem extends System {
  static query = { all: [Transform, Collider, Visible] };
  static priority = 2;

  _initDiag(diag) {
    if (this._diagInitDone) return;
    this._diagInitDone = true;
    this._diagBroadphaseId = diag.registerDynamicMetric({
      name: "physics.broadphase",
      displayName: "Broadphase",
      category: MetricCategory.PHYSICS,
      group: "Physics",
      unit: MetricUnit.MILLISECONDS,
      type: MetricType.TIMER,
      tags: Object.freeze(["physics"]),
    });
    this._diagBodiesId = diag.registerDynamicMetric({
      name: "physics.bodies",
      displayName: "Collision Bodies",
      category: MetricCategory.PHYSICS,
      group: "Physics",
      unit: MetricUnit.COUNT,
      type: MetricType.GAUGE,
      tags: Object.freeze(["physics"]),
    });
  }

  update(ctx, dt) {
    const tid = this._compiled.componentIds.get(Transform);
    const cid = this._compiled.componentIds.get(Collider);
    const vid = this._compiled.componentIds.get(Visible);
    if (tid === undefined || cid === undefined || vid === undefined) return;

    const diag = ctx.resources.get(Diagnostics);
    if (diag) this._initDiag(diag);

    const spatialHash = ctx.resources.get(SpatialHash);
    if (!spatialHash) {
      throw new Error(
        "CollisionSystem.update failed: SpatialHash resource is not set. " +
        "Use world.setResource(SpatialHash, hash) before updating."
      );
    }

    const doInsert = () => {
      spatialHash.clear();
      for (const table of ctx) {
        const count = table.count;
        if (count === 0) continue;

        const tx = table.getColumn(tid, "x");
        const ty = table.getColumn(tid, "y");
        const cw = table.getColumn(cid, "width");
        const ch = table.getColumn(cid, "height");
        const visible = table.getColumn(vid, "value");
        if (!tx || !ty || !cw || !ch || !visible) continue;

        for (let r = 0; r < count; r++) {
          if (!visible[r]) continue;
          spatialHash.insert(table.getEntity(r), tx[r], ty[r], cw[r], ch[r]);
        }
      }
    };

    if (diag && this._diagBroadphaseId !== undefined) {
      diag.scope(this._diagBroadphaseId, doInsert);
    } else {
      doInsert();
    }

    if (diag && this._diagBodiesId !== undefined) {
      let total = 0;
      for (const table of ctx) {
        total += table.count;
      }
      diag.recordGauge(this._diagBodiesId, total);
    }
  }

  queryRect(hash, rect, out) {
    return hash.queryRect(rect, out);
  }

  queryPoint(hash, point, out) {
    return hash.queryPoint(point, out);
  }

  queryCircle(hash, cx, cy, radius, out) {
    return hash.queryCircle(cx, cy, radius, out);
  }

  queryAABB(hash, x, y, w, h, out) {
    return hash.queryAABB(x, y, w, h, out);
  }

  raycast(hash, ox, oy, dx, dy, maxDist, out) {
    return hash.raycast(ox, oy, dx, dy, maxDist, out);
  }
}
