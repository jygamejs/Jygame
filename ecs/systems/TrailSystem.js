import { System } from "../core/System.js";
import { Transform } from "../components/Transform.js";
import { Trail } from "../components/Trail.js";
import { Visible } from "../components/Visible.js";
import { TrailManager } from "../trails/TrailManager.js";

export class TrailSystem extends System {
  static query = { all: [Transform, Trail, Visible] };
  static priority = 4;

  constructor() {
    super();
    this._prevSet = new Set();
    this._currSet = new Set();
  }

  update(ctx, dt) {
    const tid = this._compiled.componentIds.get(Transform);
    const tlid = this._compiled.componentIds.get(Trail);
    const vid = this._compiled.componentIds.get(Visible);
    if (tid === undefined || tlid === undefined || vid === undefined) return;

    const manager = ctx.resources.get(TrailManager);
    if (!manager) {
      throw new Error(
        "TrailSystem.update failed: TrailManager resource is not set. " +
        "Use world.setResource(TrailManager, manager) before updating."
      );
    }

    this._currSet.clear();

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
      }
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
}
